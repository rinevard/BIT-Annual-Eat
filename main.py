import csv
import json
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta

import hashlib
import secrets
import requests
from PIL import Image, ImageDraw, ImageFont

from achievements import evaluate_achievements

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

FILTERS = ["浴室", "医院"] # 如果名称包含这些字符串，将被过滤掉


def make_student_key(student_id: str) -> str:
    """根据学号计算本地 SHA-256 哈希十六进制字符串，上传时不暴露明文学号。"""

    h = hashlib.sha256()
    h.update(student_id.encode("utf-8"))
    return h.hexdigest()


def login_with_card(idserial: str, cardpwd: str) -> tuple[requests.Session, str]:
    """使用校园卡证件号 + 六位卡密码登录充值系统，返回 (Session, openid)。"""
    session = requests.Session()

    login_page_url = "https://dkykt.info.bit.edu.cn/cardpay/openCardRechargeLogin?temporaryopen=true"
    session.get(login_page_url, headers={"User-Agent": EDGE_UA}, timeout=10)

    login_url = "https://dkykt.info.bit.edu.cn/cardpay/cardRechargeLogin"

    payload = {
        "cardpwd": cardpwd,
        "idserial": idserial,
    }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://dkykt.info.bit.edu.cn",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://dkykt.info.bit.edu.cn/cardpay/openCardRechargeLogin?temporaryopen=true",
        "User-Agent": EDGE_UA,
    }

    resp = session.post(login_url, json=payload, headers=headers, timeout=10)

    if resp.status_code != 200:
        raise RuntimeError(f"登录请求失败，HTTP 状态码 {resp.status_code}")

    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise RuntimeError("登录接口返回的不是 JSON，可能网站改版或被风控")

    # 预期结构：{"openid": "...", "response": {"success": true, ...}}
    if "openid" not in data:
        msg = data.get("response", {}).get("message") if isinstance(data.get("response"), dict) else None
        raise RuntimeError(f"登录失败，返回内容不含 openid。message={msg!r}, data={data!r}")

    return session, data["openid"]


def fetch_trades(session: requests.Session, openid: str, begin_date: str, end_date: str) -> list[dict]:
    """使用已登录的 Session 和 openid 拉取指定日期范围内的交易记录。"""
    url = "https://dkykt.info.bit.edu.cn/selftrade/queryCardSelfTradeList"

    params = {"openid": openid}

    payload = {
        "beginDate": begin_date,
        "chooseZH": 1,
        "endDate": end_date,
        "idserialOther": "",
        "openid": openid,
        "tradeType": -1,
    }

    headers = {
        "User-Agent": DINGTALK_UA,
    }

    resp = session.post(url, params=params, json=payload, headers=headers, timeout=10)

    if resp.status_code != 200:
        raise RuntimeError(f"查询请求失败，HTTP 状态码 {resp.status_code}")

    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise RuntimeError("查询接口返回的不是 JSON，可能网站改版或被风控")

    if not data.get("success", False):
        raise RuntimeError(f"查询失败：{data}")

    result = data.get("resultData")
    if not isinstance(result, list):
        raise RuntimeError(f"查询结果格式异常：{data}")

    return result


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

    base_tpl_path = os.path.join("templates", "report_base.html")
    style_path = os.path.join("templates", "report_style.css")
    script_path = os.path.join("templates", "report_script.js")

    with open(base_tpl_path, "r", encoding="utf-8") as f:
        base_tpl = f.read()
    with open(style_path, "r", encoding="utf-8") as f:
        style = f.read()
    with open(script_path, "r", encoding="utf-8") as f:
        script = f.read()

    data_json = json.dumps(daily_stats, ensure_ascii=False)
    ach_json = json.dumps(ach_state, ensure_ascii=False)
    edit_pw = f"{secrets.randbelow(10000):04d}"

    html = (
        base_tpl
        .replace("/*__INLINE_STYLE__*/", style)
        .replace("//__INLINE_SCRIPT__", script)
        .replace("__EAT_DATA__", data_json)
        .replace("__ACH_STATE__", ach_json)
        .replace("__EDIT_PW__", edit_pw)
    )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    return edit_pw


def upload_report(html_path: str, student_key: str | None = None) -> str | None:
    try:
        with open(html_path, "rb") as f:
            data = f.read()
    except OSError as exc:
        print(f"读取文件失败: {exc}")
        return None

    headers = {"Content-Type": "text/html"}
    if student_key:
        headers["X-Eatbit-Student-Key"] = student_key

    try:
        resp = requests.post(
            "https://eatbit.top/api/reports",
            headers=headers,
            data=data,
            timeout=30,
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
    print("百丽宫大学校园卡消费分析")
    print("-----------------------------")

    try:
        idserial = input("请输入学号: ").strip()
        cardpwd = input("请输入六位校园卡密码: ").strip()
        begin_date = input("请输入开始日期 (YYYY-MM-DD，回车使用默认值 2025-01-01): ").strip() or "2025-01-01"
        end_date = input("请输入结束日期 (YYYY-MM-DD，回车使用默认值 2025-12-31): ").strip() or "2025-12-31"

        if not idserial or not cardpwd:
            print("输入不完整，已退出。")
            return

        if cardpwd == "123456":
            print("\n检测到你使用的是默认密码 123456，强烈建议尽快修改为只有你自己知道的密码。")

        print("\n正在登录校园卡系统...")
        session, openid = login_with_card(idserial, cardpwd)
        print("登录成功，正在按时间分段拉取消费记录...")

        all_trades: list[dict] = []
        for sub_begin, sub_end in split_date_range(begin_date, end_date):
            print(f"  查询区间: {sub_begin} ~ {sub_end} ...")
            sub_trades = fetch_trades(session, openid, sub_begin, sub_end)
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

        print(f"已保存明细到: {csv_path}")
        print(f"已保存按商户消费金额柱状图到: {img_amount_path}")
        print(f"已保存按商户消费次数柱状图到: {img_count_path}")
        print(f"总消费金额: {total_amount:.2f} 元")

        used_default_password = cardpwd == "123456"
        edit_pw = save_html_report(
            records,
            html_report_path,
            student_id=idserial,
            used_default_password=used_default_password,
        )
        print(f"\n已生成本地网页版报告: {html_report_path}。")

        choice = input("\n是否上传报告到 eatbit.top 生成分享链接？(Y/N): ").strip().lower()
        if choice == "y":
            print("正在上传报告到 eatbit.top，一般不超过半分钟...")
            student_key = make_student_key(idserial)
            url = upload_report(html_report_path, student_key=student_key)
            if url:
                print(f"上传成功！分享链接: {url}")
                print(f"编辑模式链接（请勿分享给他人）: {url}#pw={edit_pw}")
            else:
                print("上传失败，请稍后重试或检查网络连接。")
        else:
            print(f"可以打开 {html_report_path} 以本地查看报告。")
    except Exception as exc:  # noqa: BLE001
        print("发生错误:", exc)
    finally:
        input("\n按回车键退出...")


if __name__ == "__main__":
    main()
