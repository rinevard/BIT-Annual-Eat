// 模板内容（由 build_worker.py 自动填充）
const INDEX_HTML = `__INDEX_HTML__`;
const STYLES_CSS = `__STYLES_CSS__`;
const SCRIPTS_JS = `__SCRIPTS_JS__`;

async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArray = [...new Uint8Array(hashBuf)];
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 使用存储的数据动态填充模板，生成完整的 HTML 页面。
 */
function generateHtml(dailyStats, achState, barcodeId, profile) {
    return INDEX_HTML
        .replace("/*__INLINE_STYLE__*/", STYLES_CSS)
        .replace("//__INLINE_SCRIPT__", SCRIPTS_JS)
        .replace("__EAT_DATA__", JSON.stringify(dailyStats))
        .replace("__ACH_STATE__", JSON.stringify(achState))
        .replace("__BARCODE_ID__", JSON.stringify(barcodeId))
        .replace("__PROFILE__", JSON.stringify(profile || {}));
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const { pathname } = url;

        // 上传报告：POST /api/reports
        // 接收 JSON 格式：{ daily_stats, ach_state, edit_pw }
        // 将 JSON 数据保存到 KV
        if (request.method === "POST" && pathname === "/api/reports") {
            // 检查请求体大小（限制 300KB）
            const contentLength = request.headers.get("Content-Length");
            if (contentLength && parseInt(contentLength) > 300_000) {
                return new Response("Payload too large", { status: 413 });
            }

            let payload;
            try {
                const text = await request.text();
                if (text.length > 300_000) {
                    return new Response("Payload too large", { status: 413 });
                }
                payload = JSON.parse(text);
            } catch (e) {
                return new Response("Invalid JSON", { status: 400 });
            }

            const { daily_stats, ach_state, edit_pw } = payload;

            if (!daily_stats || !ach_state) {
                return new Response("Missing required fields: daily_stats, ach_state", { status: 400 });
            }

            // 基于 student_key + REPORT_SALT 生成 id
            let id;
            const studentKey = request.headers.get("X-Eatbit-Student-Key");
            const salt = env.REPORT_SALT;

            if (studentKey && salt) {
                const base = `${salt}:${studentKey}`;
                const fullHash = await sha256Hex(base);
                id = fullHash.slice(0, 8);
            } else {
                id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
            }

            const key = `report:${id}`;

            // 尝试读取旧数据，保留 profile（头像、昵称、徽章选择）
            let oldProfile = {};
            const existing = await env.REPORTS_KV.get(key);
            if (existing) {
                try {
                    const parsed = JSON.parse(existing);
                    oldProfile = parsed.profile || {};
                } catch (e) { /* ignore parse error */ }
            }

            // 保存 JSON 数据到 KV
            const dataToStore = {
                daily_stats,
                ach_state,
                edit_pw: edit_pw || "0000",
                profile: oldProfile,
            };

            await env.REPORTS_KV.put(key, JSON.stringify(dataToStore), {
                expirationTtl: 60 * 60 * 24 * 365, // 1 年
            });

            return new Response(JSON.stringify({
                id,
                url: `https://eatbit.top/r/${id}`,
            }), {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8" },
            });
        }

        // 更新报告个人资料：PATCH /api/reports/<id>/profile
        // 接收 JSON 格式：{ userName }
        // 需要 X-Edit-Password 头验证
        if (request.method === "PATCH" && pathname.match(/^\/api\/reports\/[^/]+\/profile$/)) {
            const id = pathname.split("/")[3];
            const key = `report:${id}`;

            const stored = await env.REPORTS_KV.get(key);
            if (!stored) {
                return new Response("Not found", { status: 404 });
            }

            let data;
            try {
                data = JSON.parse(stored);
            } catch (e) {
                return new Response("Corrupted data", { status: 500 });
            }

            // 验证编辑密码
            const providedPw = request.headers.get("X-Edit-Password");
            if (!providedPw || providedPw !== data.edit_pw) {
                return new Response("Forbidden", { status: 403 });
            }

            // 解析请求体
            let updates;
            try {
                updates = await request.json();
            } catch (e) {
                return new Response("Invalid JSON", { status: 400 });
            }

            // 验证 userName
            if (updates.userName !== undefined) {
                if (typeof updates.userName !== "string") {
                    return new Response("Invalid userName type", { status: 400 });
                }
                if (updates.userName.length > 20) {
                    return new Response("userName too long (max 20)", { status: 400 });
                }
            }

            // 验证 selectedBadges
            if (updates.selectedBadges !== undefined) {
                if (!Array.isArray(updates.selectedBadges)) {
                    return new Response("Invalid selectedBadges type", { status: 400 });
                }
                if (updates.selectedBadges.length > 6) {
                    return new Response("selectedBadges too many (max 6)", { status: 400 });
                }
                // 确保每个元素都是字符串
                if (!updates.selectedBadges.every(id => typeof id === "string")) {
                    return new Response("Invalid selectedBadges element type", { status: 400 });
                }
            }

            // 验证 avatar（Base64 图片，限制 100KB）
            if (updates.avatar !== undefined) {
                if (typeof updates.avatar !== "string") {
                    return new Response("Invalid avatar type", { status: 400 });
                }
                // Base64 data URL 格式检查
                if (!updates.avatar.startsWith("data:image/")) {
                    return new Response("Invalid avatar format", { status: 400 });
                }
                // 限制大小（Base64 字符串长度，约等于原始大小 * 1.37）
                if (updates.avatar.length > 140_000) {
                    return new Response("Avatar too large (max ~100KB)", { status: 413 });
                }
            }

            // 更新 profile
            data.profile = data.profile || {};
            if (updates.userName !== undefined) {
                data.profile.userName = updates.userName.trim();
            }
            if (updates.selectedBadges !== undefined) {
                data.profile.selectedBadges = updates.selectedBadges;
            }
            if (updates.avatar !== undefined) {
                data.profile.avatar = updates.avatar;
            }

            // 保存回 KV
            await env.REPORTS_KV.put(key, JSON.stringify(data), {
                expirationTtl: 60 * 60 * 24 * 365,
            });

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8" },
            });
        }

        // 查看报告：GET /r/<id>
        // 从 KV 读取 JSON 数据，动态填充模板返回 HTML
        if (request.method === "GET" && pathname.startsWith("/r/")) {
            const id = pathname.slice("/r/".length);

            if (!id) {
                return new Response("Not found", { status: 404 });
            }

            const key = `report:${id}`;
            const stored = await env.REPORTS_KV.get(key);

            if (!stored) {
                return new Response("Not found", { status: 404 });
            }

            let data;
            try {
                data = JSON.parse(stored);
            } catch (e) {
                return new Response("Corrupted data", { status: 500 });
            }

            const html = generateHtml(data.daily_stats, data.ach_state, id, data.profile);

            return new Response(html, {
                status: 200,
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        // 首页
        if (pathname === "/" || pathname === "/index.html") {
            return new Response("Hello from eatbit.top worker", { status: 200 });
        }

        return new Response("Not found", { status: 404 });
    },
};