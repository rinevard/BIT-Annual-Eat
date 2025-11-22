from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Any


@dataclass
class AchContext:
    """预处理后的成就计算上下文。"""

    records: list[dict]
    records_sorted_by_time: list[dict]
    dates: set[str]
    daily_amount: dict[str, float]
    student_id_suffix: int | None = None


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


def build_context(records: list[dict], student_id: str | None = None) -> AchContext:
    """从扣费记录构建成就计算所需的上下文。"""

    records_with_dt: list[dict] = []
    dates: set[str] = set()
    daily_amount: dict[str, float] = defaultdict(float)

    student_id_suffix: int | None = None
    if student_id:
        s = student_id.strip()
        if len(s) >= 4 and s[-4:].isdigit():
            student_id_suffix = int(s[-4:])

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
        student_id_suffix=student_id_suffix,
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
    """凑单领域大神：存在某日消费总金额 >= 20 且为 10 的倍数。"""

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
    """全勤奖：就餐天数 >= 200 天。"""

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


def ach_default_setting(ctx: AchContext) -> AchievementResult:
    """默认设置：在同一个商家消费次数 > 20 次。"""

    counts: dict[str, int] = defaultdict(int)
    unlock_dt: datetime | None = None
    target_mer: str | None = None

    for rec in ctx.records_sorted_by_time:
        mer = str(rec.get("mername", ""))
        counts[mer] += 1
        if counts[mer] == 21:
            unlock_dt = rec["__dt"]
            target_mer = mer
            break

    return AchievementResult(
        id="default_setting",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"merchant": target_mer, "count": counts.get(target_mer, 0)}
        if unlock_dt is not None and target_mer is not None
        else None,
    )


def ach_story_start(ctx: AchContext) -> AchievementResult:
    """故事的开始：在本年第一天吃饭。"""

    if not ctx.records_sorted_by_time:
        return AchievementResult(id="story_start", unlocked=False)

    first_year = ctx.records_sorted_by_time[0]["__dt"].year
    target_date_str = f"{first_year:04d}-01-01"

    if target_date_str not in ctx.dates:
        return AchievementResult(id="story_start", unlocked=False)

    unlock_dt: datetime | None = None
    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        if dt.date().isoformat() == target_date_str:
            unlock_dt = dt
            break

    return AchievementResult(
        id="story_start",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"date": target_date_str} if unlock_dt is not None else None,
    )


def ach_another_year(ctx: AchContext) -> AchievementResult:
    """又一年：在本年最后一天吃饭。"""

    if not ctx.records_sorted_by_time:
        return AchievementResult(id="another_year", unlocked=False)

    last_year = ctx.records_sorted_by_time[-1]["__dt"].year
    target_date_str = f"{last_year:04d}-12-31"

    if target_date_str not in ctx.dates:
        return AchievementResult(id="another_year", unlocked=False)

    unlock_dt: datetime | None = None
    for rec in reversed(ctx.records_sorted_by_time):
        dt: datetime = rec["__dt"]
        if dt.date().isoformat() == target_date_str:
            unlock_dt = dt
            break

    return AchievementResult(
        id="another_year",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"date": target_date_str} if unlock_dt is not None else None,
    )


def ach_missing_breakfast(ctx: AchContext) -> AchievementResult:
    """消失的早餐：全年 9 点前消费次数 < 10 次。"""

    early_count = 0
    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        if dt.hour < 9:
            early_count += 1

    unlocked = bool(ctx.records_sorted_by_time) and early_count < 10
    last_dt: datetime | None = (
        ctx.records_sorted_by_time[-1]["__dt"] if unlocked and ctx.records_sorted_by_time else None
    )

    return AchievementResult(
        id="missing_breakfast",
        unlocked=unlocked,
        unlocked_at=_format_dt(last_dt) if last_dt is not None else None,
        extra={"count": early_count},
    )


def ach_good_meals(ctx: AchContext) -> AchievementResult:
    """好好吃饭：单日内同时有早、中、晚三餐记录。"""

    meals_by_date: dict[str, set[str]] = defaultdict(set)
    unlock_dt: datetime | None = None
    target_date: str | None = None

    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        date_str = dt.date().isoformat()
        h = dt.hour
        if h < 10:
            meals_by_date[date_str].add("breakfast")
        elif h < 15:
            meals_by_date[date_str].add("lunch")
        elif h < 22:
            meals_by_date[date_str].add("dinner")

        if len(meals_by_date[date_str]) == 3:
            unlock_dt = dt
            target_date = date_str
            break

    return AchievementResult(
        id="good_meals",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"date": target_date} if unlock_dt is not None and target_date is not None else None,
    )


def ach_perfect_week(ctx: AchContext) -> AchievementResult:
    """完美一周：连续七天一日三餐。"""
    meals_by_date: dict[str, set[str]] = defaultdict(set)

    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        date_str = dt.date().isoformat()
        h = dt.hour
        if h < 10:
            meals_by_date[date_str].add("breakfast")
        elif h < 15:
            meals_by_date[date_str].add("lunch")
        elif h < 22:
            meals_by_date[date_str].add("dinner")

    if not meals_by_date:
        return AchievementResult(id="perfect_week", unlocked=False)

    date_keys = sorted(meals_by_date.keys())
    first_date = datetime.fromisoformat(date_keys[0]).date()
    last_date = datetime.fromisoformat(date_keys[-1]).date()

    unlock_dt: datetime | None = None
    span_start: str | None = None
    span_end: str | None = None

    cur = first_date
    streak = 0
    while cur <= last_date:
        date_str = cur.isoformat()
        meals = meals_by_date.get(date_str)
        if meals is not None and len(meals) >= 3:
            if streak == 0:
                span_start = date_str
            streak += 1
            if streak >= 7:
                span_end = date_str
                for rec in reversed(ctx.records_sorted_by_time):
                    dt = rec["__dt"]
                    if dt.date().isoformat() == date_str:
                        unlock_dt = dt
                        break
                break
        else:
            streak = 0
        cur += timedelta(days=1)

    return AchievementResult(
        id="perfect_week",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"start_date": span_start, "end_date": span_end}
        if unlock_dt is not None and span_start is not None and span_end is not None
        else None,
    )


def ach_cosmic_meal(ctx: AchContext) -> AchievementResult:
    """宇宙饭：连续五天每天在不一样的商家吃饭"""
    merchants_by_date: dict[str, list[str]] = defaultdict(list)

    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        date_str = dt.date().isoformat()
        mer = str(rec.get("mername", ""))
        if mer:
            merchants_by_date[date_str].append(mer)

    if not merchants_by_date:
        return AchievementResult(id="cosmic_meal", unlocked=False)

    date_keys = sorted(merchants_by_date.keys())
    first_date = datetime.fromisoformat(date_keys[0]).date()
    last_date = datetime.fromisoformat(date_keys[-1]).date()

    window: list[Any] = []
    unlock_dt: datetime | None = None
    span_start: str | None = None
    span_end: str | None = None

    cur = first_date
    while cur <= last_date:
        window.append(cur)
        if len(window) > 5:
            window.pop(0)

        if len(window) == 5:
            used_merchants: set[str] = set()
            valid = True
            for d in window:
                ds = d.isoformat()
                todays_merchants = merchants_by_date.get(ds, [])
                if not todays_merchants:
                    valid = False
                    break
                for mer in todays_merchants:
                    if mer in used_merchants:
                        valid = False
                        break
                    used_merchants.add(mer)
                if not valid:
                    break

            if valid:
                span_start = window[0].isoformat()
                span_end = window[-1].isoformat()
                for rec in reversed(ctx.records_sorted_by_time):
                    dt = rec["__dt"]
                    if dt.date().isoformat() == span_end:
                        unlock_dt = dt
                        break
                break

        cur += timedelta(days=1)

    return AchievementResult(
        id="cosmic_meal",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"start_date": span_start, "end_date": span_end}
        if unlock_dt is not None and span_start is not None and span_end is not None
        else None,
    )


def ach_my_turn(ctx: AchContext) -> AchievementResult:
    """我的回合：2 分钟内连续刷卡 2 次。"""

    unlock_dt: datetime | None = None
    interval_seconds: float | None = None

    prev_dt: datetime | None = None
    for rec in ctx.records_sorted_by_time:
        dt: datetime = rec["__dt"]
        if prev_dt is not None:
            delta = (dt - prev_dt).total_seconds()
            if 0 < delta <= 120:
                unlock_dt = dt
                interval_seconds = delta
                break
        prev_dt = dt

    return AchievementResult(
        id="my_turn",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"interval_seconds": interval_seconds} if unlock_dt is not None else None,
    )


def ach_error_404(ctx: AchContext) -> AchievementResult:
    """Error 404：单笔消费金额恰为 404 元（含 4.04 / 40.4 / 404）。"""

    unlock_dt: datetime | None = None
    amount_value: float | None = None

    targets = {404, 4040, 40400}

    for rec in ctx.records_sorted_by_time:
        amount = float(rec.get("amount", 0.0))
        cents = int(round(amount * 100))
        if cents in targets:
            unlock_dt = rec["__dt"]
            amount_value = amount
            break

    return AchievementResult(
        id="error_404",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"amount": amount_value} if unlock_dt is not None else None,
    )


def ach_hello_world(ctx: AchContext) -> AchievementResult:
    """Hello World：本年有消费过（记录时间为第一笔消费）。"""

    if not ctx.records_sorted_by_time:
        return AchievementResult(id="hello_world", unlocked=False)

    first_dt: datetime = ctx.records_sorted_by_time[0]["__dt"]

    return AchievementResult(
        id="hello_world",
        unlocked=True,
        unlocked_at=_format_dt(first_dt),
        extra={"first_date": first_dt.date().isoformat()},
    )


def ach_pi(ctx: AchContext) -> AchievementResult:
    """PI：单笔消费金额恰为 314 元（含 3.14 / 31.4 / 314）。"""

    unlock_dt: datetime | None = None
    amount_value: float | None = None

    targets = {314, 3140, 31400}

    for rec in ctx.records_sorted_by_time:
        amount = float(rec.get("amount", 0.0))
        cents = int(round(amount * 100))
        if cents in targets:
            unlock_dt = rec["__dt"]
            amount_value = amount
            break

    return AchievementResult(
        id="pi",
        unlocked=unlock_dt is not None,
        unlocked_at=_format_dt(unlock_dt),
        extra={"amount": amount_value} if unlock_dt is not None else None,
    )


def ach_noticed(ctx: AchContext) -> AchievementResult:
    """注意到：全年消费总金额恰为学号后四位的倍数。"""

    suffix = ctx.student_id_suffix
    if not suffix:
        return AchievementResult(id="noticed", unlocked=False)

    total_amount = 0.0
    for rec in ctx.records:
        try:
            total_amount += float(rec.get("amount", 0.0))
        except (TypeError, ValueError):
            continue

    total_cents = int(round(total_amount * 100))
    unit_cents = suffix * 100

    unlocked = total_cents > 0 and unit_cents > 0 and total_cents % unit_cents == 0

    last_dt: datetime | None = (
        ctx.records_sorted_by_time[-1]["__dt"] if unlocked and ctx.records_sorted_by_time else None
    )

    return AchievementResult(
        id="noticed",
        unlocked=unlocked,
        unlocked_at=_format_dt(last_dt) if last_dt is not None else None,
        extra={"total_amount": total_amount, "id_suffix": suffix},
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
    ach_default_setting,
    ach_story_start,
    ach_another_year,
    ach_missing_breakfast,
    ach_good_meals,
    ach_perfect_week,
    ach_cosmic_meal,
    ach_my_turn,
    ach_error_404,
    ach_hello_world,
    ach_pi,
    ach_noticed,
]


def evaluate_achievements(records: list[dict], student_id: str | None = None) -> dict[str, dict[str, Any]]:
    """对给定记录计算所有成就状态，返回适合注入前端的字典。"""

    ctx = build_context(records, student_id=student_id)
    result: dict[str, dict[str, Any]] = {}

    for checker in CHECKERS:
        ach = checker(ctx)
        result[ach.id] = {
            "unlocked": ach.unlocked,
            "unlocked_at": ach.unlocked_at,
            "extra": ach.extra or {},
        }

    return result
