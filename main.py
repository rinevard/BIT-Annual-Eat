import base64
import csv

from colorama import Fore, init as colorama_init
colorama_init()
import json
import os
import shutil
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta

import hashlib
import secrets
import requests
from PIL import Image, ImageDraw, ImageFont

from achievements import evaluate_achievements

from dingtalk_decrypt import DecryptError, extract_jsessionid_from_dingtalk
from dkykt_api import DkyktError, get_openid, query_trades

EDGE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0"
)

DINGTALK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.6943.142 Safari/537.36 "
    "dingtalk-win/1.0.0 nw(0.14.7) DingTalk(8.1.5-Release.251107001) "
    "Mojo/1.0.0 Native AppType(release) Channel/201200 "
    "Architecture/x86_64 webDt/PC"
)

FILTERS = ["浴室", "医院", "开水"] # 如果名称包含这些字符串，将被过滤掉


def make_student_key(student_id: str) -> str:
    """根据学号计算本地 SHA-256 哈希十六进制字符串，上传时不暴露明文学号。"""

    h = hashlib.sha256()
    h.update(student_id.encode("utf-8"))
    return h.hexdigest()

def to_spend_records(raw_trades: list[dict]) -> list[dict]:
    """将原始交易记录转换为仅包含扣费记录的简单结构。"""
    records: list[dict] = []

    for item in raw_trades:
        txamt = item.get("txamt")
        mername_raw = item.get("mername")
        txdate = item.get("txdate")

        if txamt is None or mername_raw is None or txdate is None:
            continue

        try:
            amt = float(txamt)
        except (TypeError, ValueError):
            continue

        # 只保留金额为负的扣费记录
        if amt >= 0:
            continue

        mername = str(mername_raw).strip()

        if any(keyword in mername for keyword in FILTERS):
            continue

        records.append(
            {
                "txdate": str(txdate),
                "mername": mername,
                # 消费额转为正数，便于阅读
                "amount": -amt,
            }
        )

    return records


def save_csv(records: list[dict], path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)

    sorted_records = sorted(records, key=lambda r: r["txdate"])

    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["txdate", "mername", "amount"])
        for r in sorted_records:
            writer.writerow([r["txdate"], r["mername"], f"{r['amount']:.2f}"])


def _format_merchant_label(name: str) -> str:
    # 根据名称中第一次出现的中文数字添加后缀，仅处理良乡校区的食堂
    # 例如 "良四二层" -> "良四二层（东）"
    if not ("良" in name):
        return name
    for c in name:
        if c == "一":
            return name + "（南）"
        if c == "二":
            return name + "（北）"
        if c == "七":
            return name + "（清真）"
        if c == "四":
            return name + "（东）"
    return name

_FONT_CANDIDATES = [
    "simhei.ttf",
    "msyh.ttc",
    "msyh.ttf",
    "simsun.ttc",
    "simsun.ttf",
]


_FONT_CACHE: dict[int, ImageFont.ImageFont] = {}


def _load_font(size: int) -> ImageFont.ImageFont:
    font = _FONT_CACHE.get(size)
    if font is not None:
        return font

    for name in _FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(name, size)
            _FONT_CACHE[size] = font
            return font
        except OSError:
            continue

    font = ImageFont.load_default()
    _FONT_CACHE[size] = font
    return font


def _save_horizontal_bar_chart(
    labels: list[str],
    values: list[float],
    path: str,
    title: str,
    xlabel: str,
    integer_values: bool = False,
) -> None:
    if not labels or not values:
        return

    os.makedirs(os.path.dirname(path), exist_ok=True)

    width = 1200
    left_margin = 260
    right_margin = 160
    top_margin = 80
    bottom_margin = 80
    bar_height = 24
    bar_spacing = 12

    total_bar_area = len(labels) * (bar_height + bar_spacing) - bar_spacing
    height = max(400, top_margin + total_bar_area + bottom_margin)

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    title_font = _load_font(28)
    label_font = _load_font(18)
    value_font = _load_font(16)
    axis_font = _load_font(16)

    # 标题
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_x = (width - (title_bbox[2] - title_bbox[0])) / 2     # 水平居中
    title_y = 20
    draw.text((title_x, title_y), title, fill="black", font=title_font)

    # x 轴下面的标签
    xlabel_bbox = draw.textbbox((0, 0), xlabel, font=axis_font)
    xlabel_x = (width - (xlabel_bbox[2] - xlabel_bbox[0])) / 2
    xlabel_y = height - bottom_margin + 45
    draw.text((xlabel_x, xlabel_y), xlabel, fill="black", font=axis_font)

    # 我们用 val / max_val * usable_width 计算柱子长度, 需要 max_val 大于 0
    max_val = max(values) if values else 0.0
    if max_val <= 0:
        img.save(path, format="PNG")
        return

    # x 轴横线
    usable_width = width - left_margin - right_margin
    axis_y = height - bottom_margin + 10
    draw.line((left_margin, axis_y, width - right_margin, axis_y), fill="black", width=1)

    # x 轴坐标
    num_ticks = 5
    for i in range(num_ticks + 1):
        x = left_margin + usable_width * i / num_ticks
        draw.line((x, axis_y, x, axis_y + 5), fill="black", width=1)    # 竖直刻度线
        tick_val = max_val * i / num_ticks
        tick_str = f"{tick_val:.0f}" if max_val >= 10 else f"{tick_val:.2f}"
        tick_bbox = draw.textbbox((0, 0), tick_str, font=axis_font)
        tick_x = x - (tick_bbox[2] - tick_bbox[0]) / 2
        tick_y = axis_y + 8
        draw.text((tick_x, tick_y), tick_str, fill="black", font=axis_font)

    current_y = top_margin
    bar_color = (51, 122, 183)

    # 商家名和柱子
    for label, value in zip(labels, values):
        bar_len = 0 if value <= 0 else value / max_val * usable_width
        y0 = current_y
        y1 = current_y + bar_height

        draw.rectangle((left_margin, y0, left_margin + bar_len, y1), fill=bar_color)

        label_bbox = draw.textbbox((0, 0), label, font=label_font)
        label_x = left_margin - 10 - (label_bbox[2] - label_bbox[0])
        label_y = y0 + (bar_height - (label_bbox[3] - label_bbox[1])) / 2
        draw.text((label_x, label_y), label, fill="black", font=label_font)

        value_str = str(int(round(value))) if integer_values else f"{value:.2f}"
        value_bbox = draw.textbbox((0, 0), value_str, font=value_font)
        value_x = left_margin + bar_len + 8
        value_y = y0 + (bar_height - (value_bbox[3] - value_bbox[1])) / 2
        draw.text((value_x, value_y), value_str, fill="black", font=value_font)

        current_y += bar_height + bar_spacing

    img.save(path, format="PNG")


def save_bar_chart(records: list[dict], path: str) -> None:
    if not records:
        return

    totals: dict[str, float] = defaultdict(float)
    for r in records:
        totals[r["mername"]] += r["amount"]

    items = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    merchants = [name for name, _ in items]
    display_merchants = [_format_merchant_label(name) for name in merchants]
    amounts = [value for _, value in items]

    _save_horizontal_bar_chart(
        display_merchants,
        amounts,
        path,
        title="吃饭消费总结",
        xlabel="消费金额（元）",
    )


def save_count_chart(records: list[dict], path: str) -> None:
    if not records:
        return

    counts: dict[str, int] = defaultdict(int)
    for r in records:
        counts[r["mername"]] += 1

    items = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    merchants = [name for name, _ in items]
    display_merchants = [_format_merchant_label(name) for name in merchants]
    times = [value for _, value in items]

    _save_horizontal_bar_chart(
        display_merchants,
        times,
        path,
        title="吃饭次数统计",
        xlabel="消费次数（次）",
        integer_values=True,
    )


def build_daily_stats(records: list[dict]) -> dict:
    """按年和日期聚合每天的用餐次数与金额及商户明细。

    返回结构大致为：
    {
        "2025": {
            "2025-03-01": {"count": 3, "amount": 25.5, "merchants": [{"name": "一食堂", "amount": 10.0}, ...]},
            ...
        },
        ...
    }
    """

    stats: dict[str, dict[str, dict]] = {}

    for r in records:
        raw_date = str(r["txdate"])
        # 只保留日期部分（YYYY-MM-DD），忽略具体时间，便于按天聚合
        date_str = raw_date[:10]
        time_str = raw_date[11:19] if len(raw_date) >= 19 else ""
        mername = r["mername"]
        amount = float(r["amount"])

        year = date_str[:4]
        stats.setdefault(year, {})
        day_stats = stats[year].setdefault(
            date_str,
            {"count": 0, "amount": 0.0, "merchants": defaultdict(float), "txs": []},
        )

        day_stats["count"] += 1
        day_stats["amount"] += amount
        day_stats["merchants"][mername] += amount
        day_stats["txs"].append(
            {
                "txdate": raw_date,
                "time": time_str,
                "mername": mername,
                "amount": amount,
            }
        )

    # 将 merchants 从 dict 压平成列表，按金额从高到低排序
    normalized: dict[str, dict[str, dict]] = {}
    for year, days in stats.items():
        normalized[year] = {}
        for date_str, info in days.items():
            merchants_dict: dict[str, float] = info["merchants"]
            merchants_list = [
                {"name": name, "amount": amt}
                for name, amt in sorted(merchants_dict.items(), key=lambda x: x[1], reverse=True)
            ]
            raw_txs: list[dict] = info.get("txs", [])
            sorted_txs = sorted(raw_txs, key=lambda t: t.get("txdate", ""))
            txs = [
                {
                    "time": t.get("time", ""),
                    "mername": t.get("mername", ""),
                    "amount": float(t.get("amount", 0.0)),
                }
                for t in sorted_txs
            ]

            normalized[year][date_str] = {
                "count": info["count"],
                "amount": info["amount"],
                "merchants": merchants_list,
                "txs": txs,
            }

    return normalized


def save_html_report(records: list[dict], path: str, student_id: str | None = None, used_default_password: bool | None = None) -> str:
    """生成包含年度吃饭饭力图的本地 HTML 报告。"""

    daily_stats = build_daily_stats(records)
    ach_state = evaluate_achievements(
        records,
        student_id=student_id,
        used_default_password=used_default_password,
    )

    base_tpl_path = os.path.join("templates", "index.html")
    style_path = os.path.join("templates", "styles.css")
    script_path = os.path.join("templates", "scripts.js")

    with open(base_tpl_path, "r", encoding="utf-8") as f:
        base_tpl = f.read()
    with open(style_path, "r", encoding="utf-8") as f:
        style = f.read()
    with open(script_path, "r", encoding="utf-8") as f:
        script = f.read()

    # 将图片转为 base64 数据 URL
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

    # 转换头像和成就精灵图
    avatar_path = os.path.join("templates", "images", "eatbit.jpg")
    sprite_path = os.path.join("templates", "images", "ach.jpg")

    if os.path.exists(avatar_path):
        script = script.replace(
            'const IMG_AVATAR_DEFAULT = "images/eatbit.jpg";',
            f'const IMG_AVATAR_DEFAULT = "{image_to_base64(avatar_path)}";',
        )
    if os.path.exists(sprite_path):
        script = script.replace(
            'const IMG_ACH_SPRITE = "images/ach.jpg";',
            f'const IMG_ACH_SPRITE = "{image_to_base64(sprite_path)}";',
        )

    data_json = json.dumps(daily_stats, ensure_ascii=False)
    ach_json = json.dumps(ach_state, ensure_ascii=False)
    edit_pw = f"{secrets.randbelow(10000):04d}"

    html = (
        base_tpl
        .replace("/*__INLINE_STYLE__*/", style)
        .replace("//__INLINE_SCRIPT__", script)
        .replace("__EAT_DATA__", data_json)
        .replace("__ACH_STATE__", ach_json)
        .replace("__BARCODE_ID__", "null")  # 本地报告默认不显示条形码
        .replace("__PROFILE__", "{}")  # 本地报告无保存的个人资料
    )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    # 把图片文件夹复制到 output 文件夹
    src_images = os.path.join("templates", "images")
    dst_images = os.path.join(os.path.dirname(path), "images")
    if os.path.exists(src_images):
        if os.path.exists(dst_images):
            try:
                shutil.rmtree(dst_images)
            except OSError:
                pass
        try:
            shutil.copytree(src_images, dst_images)
            # 设为隐藏文件夹（Windows）
            try:
                import ctypes
                FILE_ATTRIBUTE_HIDDEN = 0x02
                ctypes.windll.kernel32.SetFileAttributesW(dst_images, FILE_ATTRIBUTE_HIDDEN)
            except Exception:
                pass
        except OSError as e:
            print(f"Warning: Failed to copy images: {e}")

    return edit_pw


def update_html_barcode(path: str, barcode_id: str) -> None:
    """上传成功后更新本地 HTML 报告中的条形码 ID。"""
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    html = html.replace(
        "const BARCODE_ID = null;",
        f"const BARCODE_ID = {json.dumps(barcode_id)};",
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def upload_report(
    daily_stats: dict,
    ach_state: dict,
    edit_pw: str,
    student_key: str | None = None,
    year_from_id: str | None = None,
    year_from_openid: str | None = None,
) -> str | None:
    """上传报告数据到云端，返回分享链接。

    Args:
        daily_stats: build_daily_stats() 的结果
        ach_state: evaluate_achievements() 的结果
        edit_pw: 编辑密码
        student_key: 学号哈希，用于生成固定的报告 ID
        year_from_id: 学号[2:6]，用于验证
        year_from_openid: openid[94:98]，用于验证
    """
    payload = {
        "daily_stats": daily_stats,
        "ach_state": ach_state,
        "edit_pw": edit_pw,
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": EDGE_UA,
    }
    if student_key:
        headers["X-Eatbit-Student-Key"] = student_key
    if year_from_id:
        headers["X-Year-Id"] = year_from_id
    if year_from_openid:
        headers["X-Year-Oid"] = year_from_openid

    try:
        resp = requests.post(
            "https://r.eatbit.top/api/reports",
            headers=headers,
            json=payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        print(f"上传报告失败: {exc}")
        return None

    if resp.status_code != 200:
        print(f"上传报告失败，HTTP 状态码 {resp.status_code}")
        return None

    try:
        info = resp.json()
    except json.JSONDecodeError:
        print("解析 JSON 失败")
        return None

    url = info.get("url")
    if not url:
        print(f"获取分享链接失败: {info!r}")
        return None

    return url


def upload_with_progress(
    daily_stats: dict,
    ach_state: dict,
    edit_pw: str,
    student_key: str | None = None,
    year_from_id: str | None = None,
    year_from_openid: str | None = None,
) -> str | None:
    """带进度指示器的上传，返回分享链接 URL 或 None。"""

    stop_spinner = threading.Event()
    upload_result: list = [None]

    def do_upload():
        try:
            upload_result[0] = upload_report(
                daily_stats=daily_stats,
                ach_state=ach_state,
                edit_pw=edit_pw,
                student_key=student_key,
                year_from_id=year_from_id,
                year_from_openid=year_from_openid,
            )
        finally:
            stop_spinner.set()

    def show_spinner():
        spinner_chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        start_time = time.time()
        idx = 0
        while not stop_spinner.is_set():
            elapsed = time.time() - start_time
            sys.stdout.write(f"\r正在上传 {spinner_chars[idx]} (已等待 {elapsed:.0f} 秒,一般不超过一分钟)")
            sys.stdout.flush()
            idx = (idx + 1) % len(spinner_chars)
            stop_spinner.wait(0.1)
        final_time = time.time() - start_time
        sys.stdout.write(f"\r上传耗时 {final_time:.1f} 秒" + " " * 30 + "\n")
        sys.stdout.flush()

    upload_thread = threading.Thread(target=do_upload, daemon=True)
    spinner_thread = threading.Thread(target=show_spinner, daemon=True)
    upload_thread.start()
    spinner_thread.start()
    upload_thread.join()
    spinner_thread.join()

    return upload_result[0]


def split_date_range(begin_date: str, end_date: str, max_days: int = 31) -> list[tuple[str, str]]:
    """将总的起止日期拆分为若干不超过 max_days 天的小段，因为查询接口似乎有日期范围限制。

    例如 [2025-01-01, 2025-03-15] 会被拆成：
    - 2025-01-01 ~ 2025-01-31
    - 2025-02-01 ~ 2025-03-03
    - 2025-03-04 ~ 2025-03-15
    """

    start = datetime.strptime(begin_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    if start > end:
        raise ValueError("开始日期不能晚于结束日期")

    ranges: list[tuple[str, str]] = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=max_days - 1), end)
        ranges.append((cur.isoformat(), chunk_end.isoformat()))
        cur = chunk_end + timedelta(days=1)

    return ranges


def main() -> None:
    print("百丽宫大学吃饭年度报告")
    print("-----------------------------")
    print("所有查询在本地进行，查询完成后可选是否上传吃饭数据到云端生成分享链接。无论是否上传都能生成本地报告。")
    print("交流 QQ 群 1015011529\n")

    idserial = input("请输入学号: ").strip()
    year_str = input("请输入年份 (YYYY，回车使用默认值 2025): ").strip() or "2025"

    if not idserial:
        print("输入不完整，已退出。")
        return

    try:
        year = int(year_str)
    except ValueError:
        print("年份格式错误，已退出。")
        return

    begin_date = f"{year:04d}-01-01"
    end_date = f"{year:04d}-12-31"
    output_saved = False

    try:
        print("\n正在尝试获取 JSESSIONID...")
        try:
            jsessionid = extract_jsessionid_from_dingtalk()
        except DecryptError as err:
            print(err.user_message)
            if err.hint:
                print("提示：", err.hint)
            jsessionid = input("请手动抓包并输入 JSESSIONID（32位十六进制，回车退出程序）: ").strip()
            if not jsessionid:
                return

        session = requests.Session()
        session.cookies.set("JSESSIONID", jsessionid, domain="dkykt.info.bit.edu.cn", path="/")

        print("正在推断 openid...")
        openid = get_openid(session, idserial, DINGTALK_UA)

        print("openid 获取成功，正在按时间分段拉取消费记录...")

        all_trades: list[dict] = []
        for sub_begin, sub_end in split_date_range(begin_date, end_date):
            print(f"  查询区间: {sub_begin} ~ {sub_end} ...")
            sub_trades = query_trades(session, openid, sub_begin, sub_end, DINGTALK_UA)
            all_trades.extend(sub_trades)
            time.sleep(0.5)

        records = to_spend_records(all_trades)

        if not records:
            print("在指定时间范围内没有找到任何扣费记录。")
            return

        os.makedirs("output", exist_ok=True)
        csv_path = os.path.join("output", "records.csv")
        img_amount_path = os.path.join("output", "summary_amount.png")
        img_count_path = os.path.join("output", "summary_count.png")

        save_csv(records, csv_path)
        save_bar_chart(records, img_amount_path)
        save_count_chart(records, img_count_path)

        total_amount = sum(r["amount"] for r in records)
        html_report_path = os.path.join("output", "report.html")
        print(f"总消费金额: {total_amount:.2f} 元")

        used_default_password = None
        daily_stats = build_daily_stats(records)
        ach_state = evaluate_achievements(
            records,
            student_id=idserial,
            used_default_password=used_default_password,
        )
        edit_pw = save_html_report(
            records,
            html_report_path,
            student_id=idserial,
            used_default_password=used_default_password,
        )
        print(f"\n{Fore.GREEN}已生成本地网页版报告:{Fore.RESET} {html_report_path}。")
        output_saved = True

        choice = input("\n是否上传吃饭数据到 eatbit.top 生成分享链接？(Y/N): ").strip().lower()
        if choice == "y":
            student_key = make_student_key(idserial)
            url = upload_with_progress(
                daily_stats=daily_stats,
                ach_state=ach_state,
                edit_pw=edit_pw,
                student_key=student_key,
                year_from_id=idserial[2:6],
                year_from_openid=openid[94:98],
            )
            if url:
                print(f"上传成功！\n{Fore.GREEN}分享链接:{Fore.RESET} {url}")
                print(f"{Fore.GREEN}编辑模式链接{Fore.RED}（请勿分享给他人）:{Fore.RESET} {url}#pw={edit_pw}")
                print("链接已保存在 output 文件夹中")
                # 从 URL 中提取报告 ID，更新本地条形码
                report_id = url.rsplit("/", 1)[-1]
                update_html_barcode(html_report_path, report_id)
                # 保存链接到 txt 文件
                links_path = os.path.join("output", "分享链接.txt")
                with open(links_path, "w", encoding="utf-8") as f:
                    f.write(f"分享链接: {url}\n")
                    f.write(f"编辑模式链接（请勿分享给他人）: {url}#pw={edit_pw}\n")
            else:
                print("上传失败，请稍后重试或检查网络连接。")
    except DkyktError as err:
        print("发生错误:", err.user_message)
        if err.hint:
            print("提示：", err.hint)
        # 可以加个 -debug 命令行参数?
        # if err.evidence:
        #     print("调试信息：", err.evidence)
        else:
            print(f"可以打开 {html_report_path} 以本地查看报告。")
    except Exception as exc:  # noqa: BLE001
        print("发生错误:", exc)
    finally:
        # 只在成功时才自动打开 output 文件夹
        if output_saved:
            output_dir = os.path.abspath("output")
            if os.path.isdir(output_dir):
                os.startfile(output_dir)
        input("\n按回车键退出...")


if __name__ == "__main__":
    main()
