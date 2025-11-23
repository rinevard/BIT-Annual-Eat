async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArray = [...new Uint8Array(hashBuf)];
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
                id = fullHash.slice(0, 12); // 12 位十六进制 ID
            } else {
                // 没有 student_key 时退回随机 ID，兼容旧客户端
                id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
            }

            const key = `report:${id}`;

            // 存到 KV，过期时间最长一年（单位秒）
            await env.REPORTS_KV.put(key, html, {
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