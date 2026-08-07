"""Shared domain logic: XP awarding, level recalculation, streak computation."""
from datetime import datetime, date, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, XPLog, HabitLog, Habit
from constants import xp_to_level, title_for_level
from tz import today as _today


def _week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def like_escape(term: str) -> str:
    """Escape LIKE/ILIKE wildcards so user input is matched literally.
    Use together with `.ilike(f"%{like_escape(q)}%", escape="\\\\")`."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def get_user(db: AsyncSession) -> User:
    user = (await db.execute(select(User).limit(1))).scalar_one_or_none()
    if user is None:
        user = User()
        db.add(user)
        await db.flush()
    return user


async def award_xp(db: AsyncSession, user: User, amount: int, source: str, source_id: int | None = None) -> dict:
    """Add XP, log it, recalc level/title. Returns dict with new state + leveled_up flag.

    XP is floored at 0: undos and streak penalties can subtract more than the user
    has. The audit entry records the amount actually applied so xp_log stays
    consistent with users.xp.
    """
    amount = int(round(amount))
    prev_level = user.level
    prev_xp = user.xp
    user.xp = max(0, prev_xp + amount)
    applied = user.xp - prev_xp
    new_level = xp_to_level(user.xp)
    user.level = new_level
    user.title = title_for_level(new_level)
    if applied:
        db.add(XPLog(source=source, source_id=source_id, amount=applied))
    return {
        "xp_earned": applied,
        "new_xp": user.xp,
        "new_level": new_level,
        "title": user.title,
        "leveled_up": new_level > prev_level,
    }


async def _habit_is_weekly(db: AsyncSession, habit_id: int) -> bool:
    freq = (await db.execute(select(Habit.frequency).where(Habit.id == habit_id))).scalar_one_or_none()
    return freq == "weekly"


async def habit_streak(db: AsyncSession, habit_id: int) -> int:
    """Current consecutive streak. Counts in days for daily habits, in ISO weeks for weekly ones."""
    rows = (await db.execute(
        select(HabitLog.completed_at).where(HabitLog.habit_id == habit_id)
    )).scalars().all()
    if not rows:
        return 0
    weekly = await _habit_is_weekly(db, habit_id)
    step = timedelta(weeks=1) if weekly else timedelta(days=1)
    units = {_week_monday(r.date()) if weekly else r.date() for r in rows}

    current = _week_monday(_today()) if weekly else _today()
    if current in units:
        cursor = current
    elif (current - step) in units:
        cursor = current - step
    else:
        return 0
    streak = 0
    while cursor in units:
        streak += 1
        cursor -= step
    return streak


async def best_streak(db: AsyncSession, habit_id: int) -> int:
    rows = (await db.execute(
        select(HabitLog.completed_at).where(HabitLog.habit_id == habit_id)
    )).scalars().all()
    if not rows:
        return 0
    weekly = await _habit_is_weekly(db, habit_id)
    step_days = 7 if weekly else 1
    units = sorted({_week_monday(r.date()) if weekly else r.date() for r in rows})
    best = run = 1
    for i in range(1, len(units)):
        if (units[i] - units[i - 1]).days == step_days:
            run += 1
        else:
            run = 1
        best = max(best, run)
    return best


async def remove_xp(db: AsyncSession, user: User, amount: int, source: str, source_id: int | None = None) -> dict:
    """Reverse previously granted XP (logs a negative audit entry, recomputes level/title)."""
    return await award_xp(db, user, -abs(int(amount)), source, source_id)
