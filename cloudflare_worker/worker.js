async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArray = [...new Uint8Array(hashBuf)];
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 从已保存的旧报告 HTML 中提取头像和标题，并将它们合并到这次上传的新 HTML 中。
 *
 * 要求：
 * - oldHtml：之前存入 KV 的旧版报告 HTML，包含且只包含一个 `<div class="avatar">...</div>`
 *   和一个 `<span id="user-title">...</span>` 结构。
 * - newHtml：本次上传生成的新报告 HTML，同样应包含上述结构
 * 
 * 如果找不到这些标记，则直接返回 newHtml。
 *
 * @param {*} oldHtml  之前已经存入 KV 的旧 HTML 字符串
 * @param {*} newHtml  本次上传的新 HTML 字符串
 * @returns {*} 合并头像和标题后的 HTML 字符串
 */
function mergeAvatarAndTitle(oldHtml, newHtml) {
    const AVATAR_MARKER = '<div class="avatar"';
    const END_DIV = "</div>";

    const USER_TITLE_MARKER = '<span id="user-title"';
    const END_SPAN = "</span>";

    let merged = newHtml;

    try {
        const avatarStartOld = oldHtml.indexOf(AVATAR_MARKER);
        if (avatarStartOld !== -1) {
            const avatarEndOld = oldHtml.indexOf(END_DIV, avatarStartOld);
            const avatarStartNew = newHtml.indexOf(AVATAR_MARKER);
            if (avatarEndOld !== -1 && avatarStartNew !== -1) {
                const avatarEndNew = newHtml.indexOf(END_DIV, avatarStartNew);
                if (avatarEndNew !== -1) {
                    const oldAvatar = oldHtml.slice(avatarStartOld, avatarEndOld + END_DIV.length);
                    merged =
                        merged.slice(0, avatarStartNew) +
                        oldAvatar +
                        merged.slice(avatarEndNew + END_DIV.length);
                }
            }
        }

        const spanStartOld = oldHtml.indexOf(USER_TITLE_MARKER);
        const spanStartNew = merged.indexOf(USER_TITLE_MARKER);
        if (spanStartOld !== -1 && spanStartNew !== -1) {
            const oldInnerStart = oldHtml.indexOf(">", spanStartOld);
            const oldInnerEnd = oldHtml.indexOf(END_SPAN, oldInnerStart);
            const newInnerStart = merged.indexOf(">", spanStartNew);
            const newInnerEnd = merged.indexOf(END_SPAN, newInnerStart);
            if (
                oldInnerStart !== -1 &&
                oldInnerEnd !== -1 &&
                newInnerStart !== -1 &&
                newInnerEnd !== -1
            ) {
                const oldInner = oldHtml.slice(oldInnerStart + 1, oldInnerEnd);
                const openTag = merged.slice(spanStartNew, newInnerStart + 1);
                merged = 
                    merged.slice(0, spanStartNew) + 
                    openTag + oldInner + END_SPAN + 
                    merged.slice(newInnerEnd + END_SPAN.length);
            }
        }
    } catch (e) {
        merged = newHtml;
    }

    return merged;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const { pathname } = url;

        // 上传报告：POST /api/reports
        if (request.method === "POST" && pathname === "/api/reports") {
            const html = await request.text();

            if (!html || html.length > 500_000) { // 约 500 KB
                return new Response("invalid body", { status: 400 });
            }

            // 基于 student_key + REPORT_SALT 生成 id
            let id;
            const studentKey = request.headers.get("X-Eatbit-Student-Key");
            const salt = env.REPORT_SALT;

            if (studentKey && salt) {
                const base = `${salt}:${studentKey}`;
                const fullHash = await sha256Hex(base);
                id = fullHash.slice(0, 8); // 8 位十六进制 ID
            } else {
                // 没有 student_key 时退回随机 ID，兼容旧客户端
                id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
            }

            const key = `report:${id}`;

            let finalHtml = html;
            try {
                const oldHtml = await env.REPORTS_KV.get(key);
                if (oldHtml) {
                    finalHtml = mergeAvatarAndTitle(oldHtml, html);
                }
            } catch (e) {
            }

            // 存到 KV，过期时间最长一年（单位秒）
            await env.REPORTS_KV.put(key, finalHtml, {
                expirationTtl: 60 * 60 * 24 * 365,
            });

            const respBody = JSON.stringify({
                id,
                url: `https://eatbit.top/r/${id}`,
            });

            return new Response(respBody, {
                status: 200,
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                },
            });
        }

        // 覆写报告：PUT /api/reports/<id>
        if (request.method === "PUT" && pathname.startsWith("/api/reports/")) {
            const id = pathname.slice("/api/reports/".length);
            if (!id) {
                return new Response("Invalid id", { status: 400 });
            }

            const html = await request.text();
            if (!html || html.length > 500_000) {
                return new Response("invalid body", { status: 400 });
            }

            const key = `report:${id}`;
            await env.REPORTS_KV.put(key, html, {
                expirationTtl: 60 * 60 * 24 * 365, // 1 年
            });

            return new Response("ok", {
                status: 200,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
        }

        // 查看报告：GET /r/<id>
        if (request.method === "GET" && pathname.startsWith("/r/")) {
            const id = pathname.slice("/r/".length);

            if (!id) {
                return new Response("Not found", { status: 404 });
            }

            const key = `report:${id}`;
            const html = await env.REPORTS_KV.get(key);

            if (!html) {
                return new Response("Not found", { status: 404 });
            }

            return new Response(html, {
                status: 200,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                },
            });
        }

        // 默认首页有个 Hello 用于确认 Worker 正常
        if (pathname === "/" || pathname === "/index.html") {
            return new Response("Hello from eatbit.top worker", { status: 200 });
        }

        // 其它路径 404
        return new Response("Not found", { status: 404 });
    },
};