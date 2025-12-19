import csv
import json
import os
import shutil
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Callable, Optional

import hashlib
import requests

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

FILTERS = ["浴室", "医院"] # 如果名称包含这些字符串，将被过滤掉


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


def save_bar_chart(records: list[dict], path: str) -> None:
    import matplotlib.pyplot as plt

    # 设置中文字体和负号显示
    plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "SimSun"]
    plt.rcParams["axes.unicode_minus"] = False

    if not records:
        return

    totals: dict[str, float] = defaultdict(float)
    for r in records:
        totals[r["mername"]] += r["amount"]

    items = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    merchants = [name for name, _ in items]
    display_merchants = [_format_merchant_label(name) for name in merchants]
    amounts = [value for _, value in items]

    os.makedirs(os.path.dirname(path), exist_ok=True)

    plt.figure(figsize=(10, max(4, len(display_merchants) * 0.4)))
    plt.barh(display_merchants, amounts)
    plt.xlabel("消费金额（元）")
    plt.title("吃饭消费总结")

    # 在每个柱子右侧标注具体金额
    max_amount = max(amounts or [0])
    for idx, value in enumerate(amounts):
        plt.text(
            value + 0.01 * max_amount,
            idx,
            f"{value:.2f}",
            va="center",
        )

    # 为了给右侧标注留出空间，适当放大 x 轴范围
    plt.xlim(0, 1.2 * max_amount if max_amount > 0 else 1)

    plt.gca().invert_yaxis()
    plt.savefig(path, dpi=150, bbox_inches="tight")


def save_count_chart(records: list[dict], path: str) -> None:
    import matplotlib.pyplot as plt

    # 设置中文字体和负号显示
    plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "SimSun"]
    plt.rcParams["axes.unicode_minus"] = False

    if not records:
        return

    counts: dict[str, int] = defaultdict(int)
    for r in records:
        counts[r["mername"]] += 1

    # 按次数从高到低排序
    items = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    merchants = [name for name, _ in items]
    display_merchants = [_format_merchant_label(name) for name in merchants]
    times = [value for _, value in items]

    os.makedirs(os.path.dirname(path), exist_ok=True)

    plt.figure(figsize=(10, max(4, len(display_merchants) * 0.4)))
    plt.barh(display_merchants, times)
    plt.xlabel("消费次数（次）")
    plt.title("吃饭次数统计")

    max_times = max(times or [0])
    for idx, value in enumerate(times):
        plt.text(
            value + 0.01 * max_times,
            idx,
            str(value),
            va="center",
        )

    plt.xlim(0, 1.2 * max_times if max_times > 0 else 1)

    plt.gca().invert_yaxis()
    plt.savefig(path, dpi=150, bbox_inches="tight")


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


def save_html_report(records: list[dict], path: str, student_id: str | None = None, used_default_password: bool | None = None) -> None:
    """生成包含年度吃饭饭力图的本地 HTML 报告。"""

    daily_stats = build_daily_stats(records)
    ach_state = evaluate_achievements(
        records,
        student_id=student_id,
        used_default_password=used_default_password,
    )

    base_tpl_path = os.path.join("templates", "visual", "index.html")
    style_path = os.path.join("templates", "visual", "styles.css")
    script_path = os.path.join("templates", "visual", "scripts.js")

    with open(base_tpl_path, "r", encoding="utf-8") as f:
        base_tpl = f.read()
    with open(style_path, "r", encoding="utf-8") as f:
        style = f.read()
    with open(script_path, "r", encoding="utf-8") as f:
        script = f.read()

    data_json = json.dumps(daily_stats, ensure_ascii=False)
    ach_json = json.dumps(ach_state, ensure_ascii=False)

    html = (
        base_tpl
        .replace("/*__INLINE_STYLE__*/", style)
        .replace("//__INLINE_SCRIPT__", script)
        .replace("__EAT_DATA__", data_json)
        .replace("__ACH_STATE__", ach_json)
    )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    # Copy images folder to output directory
    src_images = os.path.join("templates", "visual", "images")
    dst_images = os.path.join(os.path.dirname(path), "images")
    if os.path.exists(src_images):
        if os.path.exists(dst_images):
            try:
                shutil.rmtree(dst_images)
            except OSError:
                pass
        try:
            shutil.copytree(src_images, dst_images)
        except OSError as e:
            print(f"Warning: Failed to copy images: {e}")


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
    print("百丽宫大学校园卡年度报告")
    print("-----------------------------")
    print("所有查询在本地进行，查询完成后可选是否上传吃饭数据到云端生成分享链接。")

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

    try:
        print("\n正在尝试获取 JSESSIONID...")
        try:
            jsessionid = extract_jsessionid_from_dingtalk()
        except DecryptError as err:
            print(err.user_message)
            if err.hint:
                print("提示：", err.hint)
            jsessionid = input("请输入 JSESSIONID（32位十六进制，回车退出程序）: ").strip()
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

        print(f"已保存明细到: {csv_path}")
        print(f"已保存按商户消费金额柱状图到: {img_amount_path}")
        print(f"已保存按商户消费次数柱状图到: {img_count_path}")
        print(f"总消费金额: {total_amount:.2f} 元")

        used_default_password = None
        save_html_report(
            records,
            html_report_path,
            student_id=idserial,
            used_default_password=used_default_password,
        )
        print(f"已生成吃饭报告: {html_report_path}")

        choice = input("\n是否上传吃饭数据到 eatbit.top 生成分享链接？(Y/N): ").strip().lower()
        if choice == "y":
            print("正在上传报告到 eatbit.top，一般不超过半分钟...")
            student_key = make_student_key(idserial)
            url = upload_report(html_report_path, student_key=student_key)
            if url:
                print(f"上传成功！分享链接: {url}")
            else:
                print("上传失败，请稍后重试或检查网络连接。")
    except DkyktError as err:
        print("发生错误:", err.user_message)
        if err.hint:
            print("提示：", err.hint)
        if err.evidence:
            print("调试信息：", err.evidence)
    except Exception as exc:  # noqa: BLE001
        print("发生错误:", exc)


if __name__ == "__main__":
    main()
