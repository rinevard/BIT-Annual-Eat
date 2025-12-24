"""
构建 worker.js 的脚本

读取 templates 目录下的模板文件，将其内容填充到 worker_template.js 中的占位符，
生成可以直接复制到 Cloudflare Dashboard 的 worker.js 文件。
"""

import base64
import os


def escape_js_string(content: str) -> str:
    """转义字符串以便安全嵌入 JavaScript 模板字符串（反引号）中。"""
    return (
        content
        .replace("\\", "\\\\")  # 反斜杠
        .replace("`", "\\`")    # 反引号
        .replace("${", "\\${")  # 模板字符串插值
    )


def image_to_base64(img_path: str) -> str:
    """读取图片文件并转换为 base64 data URL。"""
    ext = os.path.splitext(img_path)[1].lower()
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    mime = mime_types.get(ext, "image/jpeg")
    with open(img_path, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def rewrite_asset_urls(content: str, templates_dir: str) -> str:
    """将图片路径替换为 base64 data URL（避免 CORS 问题）。"""
    avatar_path = os.path.join(templates_dir, "images", "eatbit.jpg")
    sprite_path = os.path.join(templates_dir, "images", "ach.jpg")

    avatar_b64 = image_to_base64(avatar_path) if os.path.exists(avatar_path) else ""
    sprite_b64 = image_to_base64(sprite_path) if os.path.exists(sprite_path) else ""

    result = content
    if avatar_b64:
        result = result.replace(
            'const IMG_AVATAR_DEFAULT = "images/eatbit.jpg";',
            f'const IMG_AVATAR_DEFAULT = "{avatar_b64}";'
        )
    if sprite_b64:
        result = result.replace(
            'const IMG_ACH_SPRITE = "images/ach.jpg";',
            f'const IMG_ACH_SPRITE = "{sprite_b64}";'
        )
    return result


def build_worker() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    templates_dir = os.path.join(project_root, "templates")

    template_path = os.path.join(script_dir, "worker_template_with_protect.js")
    output_path = os.path.join(script_dir, "worker_used.js")

    # 读取模板文件
    with open(os.path.join(templates_dir, "index.html"), "r", encoding="utf-8") as f:
        index_html = rewrite_asset_urls(f.read(), templates_dir)

    with open(os.path.join(templates_dir, "styles.css"), "r", encoding="utf-8") as f:
        styles_css = f.read()

    with open(os.path.join(templates_dir, "scripts.js"), "r", encoding="utf-8") as f:
        scripts_js = rewrite_asset_urls(f.read(), templates_dir)

    with open(os.path.join(templates_dir, "mobile.html"), "r", encoding="utf-8") as f:
        mobile_html = rewrite_asset_urls(f.read(), templates_dir)

    with open(os.path.join(templates_dir, "mobile.css"), "r", encoding="utf-8") as f:
        mobile_css = f.read()

    with open(os.path.join(templates_dir, "mobile.js"), "r", encoding="utf-8") as f:
        mobile_js = rewrite_asset_urls(f.read(), templates_dir)

    # 读取 worker 模板
    with open(template_path, "r", encoding="utf-8") as f:
        worker_template = f.read()

    # 替换占位符
    worker_js = (
        worker_template
        .replace("__INDEX_HTML__", escape_js_string(index_html))
        .replace("__STYLES_CSS__", escape_js_string(styles_css))
        .replace("__SCRIPTS_JS__", escape_js_string(scripts_js))
        .replace("__MOBILE_HTML__", escape_js_string(mobile_html))
        .replace("__MOBILE_CSS__", escape_js_string(mobile_css))
        .replace("__MOBILE_JS__", escape_js_string(mobile_js))
    )

    # 写入输出文件
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(worker_js)

    output_size_kb = len(worker_js.encode("utf-8")) / 1024
    print(f"已生成 worker_used.js ({output_size_kb:.2f} KB)")
    print(f"路径: {output_path}")
    print("\n请将 worker_used.js 的内容复制到 Cloudflare Dashboard 的 Worker 编辑器中。")


if __name__ == "__main__":
    build_worker()
