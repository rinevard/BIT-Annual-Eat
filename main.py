import csv
import json
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta

import requests
from urllib3.exceptions import InsecureRequestWarning
import urllib3

# 关闭 verify=False 带来的警告
urllib3.disable_warnings(InsecureRequestWarning)

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


def login_with_card(idserial: str, cardpwd: str) -> tuple[requests.Session, str]:
    """使用校园卡证件号 + 六位卡密码登录充值系统，返回 (Session, openid)。"""
    session = requests.Session()

    login_page_url = "https://dkykt.info.bit.edu.cn/cardpay/openCardRechargeLogin?temporaryopen=true"
    session.get(login_page_url, headers={"User-Agent": EDGE_UA}, timeout=10, verify=False)

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

    resp = session.post(login_url, json=payload, headers=headers, timeout=10, verify=False)

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

    resp = session.post(url, params=params, json=payload, headers=headers, timeout=10, verify=False)

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
        mername = item.get("mername")
        txdate = item.get("txdate")

        if txamt is None or mername is None or txdate is None:
            continue

        try:
            amt = float(txamt)
        except (TypeError, ValueError):
            continue

        # 只保留金额为负的扣费记录
        if amt >= 0:
            continue

        records.append(
            {
                "txdate": str(txdate),
                "mername": str(mername).strip(),
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
    if "一" in name:
        return name + "（南）"
    if "二" in name:
        return name + "（北）"
    if "七" in name:
        return name + "（清真）"
    if "四" in name:
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

    idserial = input("请输入学号: ").strip()
    cardpwd = input("请输入六位校园卡密码（回车使用默认值 123456）: ").strip() or "123456"
    begin_date = input("请输入开始日期 (YYYY-MM-DD，回车使用默认值 2025-01-01): ").strip() or "2025-01-01"
    end_date = input("请输入结束日期 (YYYY-MM-DD，回车使用默认值 2025-12-31): ").strip() or "2025-12-31"

    if not idserial:
        print("输入不完整，已退出。")
        return

    try:
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
        print(f"已保存明细到: {csv_path}")
        print(f"已保存按商户消费金额柱状图到: {img_amount_path}")
        print(f"已保存按商户消费次数柱状图到: {img_count_path}")
        print(f"总消费金额: {total_amount:.2f} 元")
    except Exception as exc:  # noqa: BLE001
        print("发生错误:", exc)


if __name__ == "__main__":
    main()
