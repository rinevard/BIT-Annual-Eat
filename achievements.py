from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from collections import defaultdict
from typing import Any


@dataclass
class AchContext:
    """预处理后的成就计算上下文。"""

    records: list[dict]
    records_sorted_by_time: list[dict]
    dates: set[str]
    daily_amount: dict[str, float]


@dataclass
class AchievementResult:
    id: str
    unlocked: bool
    unlocked_at: str | None = None
    extra: dict[str, Any] | None = None


def _parse_dt(raw: str) -> datetime:
    """将 txdate 字符串解析为 datetime"""

    raw = raw.strip()
    if not raw:
        raise ValueError("Empty datetime string")

    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw, fmt)
            except ValueError:
                continue
    raise ValueError(f"Unrecognized datetime format: {raw!r}")


def _format_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%d %H:%M")


def build_context(records: list[dict]) -> AchContext:
    """从扣费记录构建成就计算所需的上下文。"""

    records_with_dt: list[dict] = []
    dates: set[str] = set()
    daily_amount: dict[str, float] = defaultdict(float)

    for r in records:
        raw_date = str(r.get("txdate", ""))
        try:
            dt = _parse_dt(raw_date)
        except ValueError:
            continue

        amount = float(r.get("amount", 0.0))
        date_str = dt.date().isoformat()

        dates.add(date_str)
        daily_amount[date_str] += amount

        new_r = dict(r)
        new_r["__dt"] = dt
        records_with_dt.append(new_r)

    records_sorted_by_time = sorted(records_with_dt, key=lambda rec: rec["__dt"])

    return AchContext(
        records=records_with_dt,
        records_sorted_by_time=records_sorted_by_time,
        dates=dates,
        daily_amount=daily_amount,
    )


def ach_early_bird(ctx: AchContext) -> AchievementResult:
    """早八人：06:00-08:00 间消费 >= 5 次。"""

    count = 0
    unlock_dt: datetime | None = None

    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        if 6 <= dt.hour < 8:
            count += 1
            if count == 5:
                unlock_dt = dt
                break

    return AchievementResult(
        id="early_bird",
        unlocked=count >= 5,
        unlocked_at=_format_dt(unlock_dt),
        extra={"count": count},
    )


def ach_night_owl(ctx: AchContext) -> AchievementResult:
    """守夜人：21:00 以后消费 >= 5 次。"""

    count = 0
    unlock_dt: datetime | None = None

    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        if dt.hour >= 21:
            count += 1
            if count == 5:
                unlock_dt = dt
                break

    return AchievementResult(
        id="night_owl",
        unlocked=count >= 5,
        unlocked_at=_format_dt(unlock_dt),
        extra={"count": count},
    )


def ach_make_it_round(ctx: AchContext) -> AchievementResult:
    """凑单王：存在某日消费总金额 >= 20 且为 10 的倍数。"""

    # 找出最早总金额 >=20 且为 10 的倍数的日期
    candidate_date: str | None = None
    for date_str, total in ctx.daily_amount.items():
        if total >= 20:
            ratio = total / 10.0
            if abs(ratio - round(ratio)) < 1e-5:
                if candidate_date is None or date_str < candidate_date:
                    candidate_date = date_str

    unlock_dt: datetime | None = None
    if candidate_date is not None:
        # 将该日最后一笔消费时间作为解锁时间
        for rec in reversed(ctx.records_sorted_by_time):
            dt: datetime = rec["__dt"]
            if dt.date().isoformat() == candidate_date:
                unlock_dt = dt
                break

    return AchievementResult(
        id="make_it_round",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra=None,
    )


def ach_big_meal(ctx: AchContext) -> AchievementResult:
    """加个鸡腿：单笔消费金额 > 25 元。"""

    threshold = 25.0
    unlock_dt: datetime | None = None
    max_amount = 0.0

    for rec in ctx.records_sorted_by_time:
        amount = float(rec.get("amount", 0.0))
        if amount > threshold:
            unlock_dt = rec["__dt"]
            max_amount = amount
            break

    return AchievementResult(
        id="big_meal",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"amount": max_amount} if unlock_dt is not None else None,
    )


def ach_minimalist(ctx: AchContext) -> AchievementResult:
    """极限生存：单笔消费金额 < 1 元。"""

    threshold = 1.0
    unlock_dt: datetime | None = None
    min_amount = None

    for rec in ctx.records_sorted_by_time:
        amount = float(rec.get("amount", 0.0))
        if amount < threshold:
            unlock_dt = rec["__dt"]
            min_amount = amount
            break

    return AchievementResult(
        id="minimalist",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"amount": min_amount} if unlock_dt is not None else None,
    )


def ach_lost_kid(ctx: AchContext) -> AchievementResult:
    """迷途之子：全年就餐天数 < 50 天。"""

    days_count = len(ctx.dates)
    unlock = days_count < 50
    # 使用最后一笔消费的时间作为解锁时间（如果有）
    last_dt: datetime | None = (
        ctx.records_sorted_by_time[-1]["__dt"] if ctx.records_sorted_by_time else None
    )

    return AchievementResult(
        id="lost_kid",
        unlocked=unlock,
        unlocked_at=_format_dt(last_dt) if unlock else None,
        extra={"days": days_count},
    )


def ach_eater(ctx: AchContext) -> AchievementResult:
    """干饭人：全年就餐天数 >= 1 天。"""

    days_count = len(ctx.dates)
    unlocked = days_count >= 1

    first_dt: datetime | None = (
        ctx.records_sorted_by_time[0]["__dt"] if ctx.records_sorted_by_time else None
    )

    return AchievementResult(
        id="eater",
        unlocked=unlocked,
        unlocked_at=_format_dt(first_dt),
        extra={"days": days_count},
    )


def ach_hundred_days(ctx: AchContext) -> AchievementResult:
    """百日烟火：就餐天数 >= 100 天。"""

    days_count = len(ctx.dates)
    unlocked = days_count >= 100

    unlock_dt: datetime | None = None
    if unlocked:
        seen: set[str] = set()
        for rec in ctx.records_sorted_by_time:
            dt: datetime = rec["__dt"]
            date_str = dt.date().isoformat()
            if date_str not in seen:
                seen.add(date_str)
                if len(seen) == 100:
                    unlock_dt = dt
                    break

    return AchievementResult(
        id="hundred_days",
        unlocked=unlocked,
        unlocked_at=_format_dt(unlock_dt) if unlocked else None,
        extra={"days": days_count},
    )


def ach_regular(ctx: AchContext) -> AchievementResult:
    """老主顾：就餐天数 >= 150 天。"""

    days_count = len(ctx.dates)
    unlocked = days_count >= 150

    unlock_dt: datetime | None = None
    if unlocked:
        seen: set[str] = set()
        for rec in ctx.records_sorted_by_time:
            dt: datetime = rec["__dt"]
            date_str = dt.date().isoformat()
            if date_str not in seen:
                seen.add(date_str)
                if len(seen) == 150:
                    unlock_dt = dt
                    break

    return AchievementResult(
        id="regular",
        unlocked=unlocked,
        unlocked_at=_format_dt(unlock_dt) if unlocked else None,
        extra={"days": days_count},
    )


def ach_full_timer(ctx: AchContext) -> AchievementResult:
    """编外人员：就餐天数 >= 200 天。"""

    days_count = len(ctx.dates)
    unlocked = days_count >= 200

    unlock_dt: datetime | None = None
    if unlocked:
        seen: set[str] = set()
        for rec in ctx.records_sorted_by_time:
            dt: datetime = rec["__dt"]
            date_str = dt.date().isoformat()
            if date_str not in seen:
                seen.add(date_str)
                if len(seen) == 200:
                    unlock_dt = dt
                    break

    return AchievementResult(
        id="full_timer",
        unlocked=unlocked,
        unlocked_at=_format_dt(unlock_dt) if unlocked else None,
        extra={"days": days_count},
    )


CHECKERS = [
    ach_early_bird,
    ach_night_owl,
    ach_make_it_round,
    ach_big_meal,
    ach_minimalist,
    ach_lost_kid,
    ach_eater,
    ach_hundred_days,
    ach_regular,
    ach_full_timer,
]


def evaluate_achievements(records: list[dict]) -> dict[str, dict[str, Any]]:
    """对给定记录计算所有成就状态，返回适合注入前端的字典。"""

    ctx = build_context(records)
    result: dict[str, dict[str, Any]] = {}

    for checker in CHECKERS:
        ach = checker(ctx)
        result[ach.id] = {
            "unlocked": ach.unlocked,
            "unlocked_at": ach.unlocked_at,
            "extra": ach.extra or {},
        }

    return result
