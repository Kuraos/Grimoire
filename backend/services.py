"""Shared domain logic: XP awarding, level recalculation, streak computation."""
from collections import Counter
from datetime import datetime, date, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, XPLog, HabitLog, Habit
from constants import xp_to_level, title_for_level
from tz import today as _today


def _week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ---------- cadencia ----------
# Un hábito "diario" puede tocar sólo ciertos días (`habits.days`). Los días en que
# no toca son transparentes: no suman racha, no la rompen y no cuestan una vida.
# Un hábito "semanal" puede pedir varias marcas por semana (`target_per_week`);
# la semana cuenta como hecha sólo al alcanzar la meta.

def parse_days(raw: str | None) -> set[int] | None:
    """"0,1,5" -> {0,1,5} (0 = lunes). None o vacío -> None = todos los días."""
    if not raw:
        return None
    days = {int(p) for p in str(raw).split(",") if p.strip()}
    return days or None


def scheduled_on(days: set[int] | None, d: date) -> bool:
    return days is None or d.weekday() in days


def last_scheduled(days: set[int] | None, d: date) -> date | None:
    """El día programado más reciente dentro de (d-6 … d]."""
    for _ in range(7):
        if scheduled_on(days, d):
            return d
        d -= timedelta(days=1)
    return None


def prev_scheduled(days: set[int] | None, d: date) -> date | None:
    return last_scheduled(days, d - timedelta(days=1))


def next_scheduled(days: set[int] | None, d: date) -> date | None:
    for _ in range(7):
        d += timedelta(days=1)
        if scheduled_on(days, d):
            return d
    return None


async def habit_cadence(db: AsyncSession, habit_id: int) -> tuple[str, set[int] | None, int]:
    """(frecuencia, días programados, marcas por semana) de un hábito."""
    row = (await db.execute(
        select(Habit.frequency, Habit.days, Habit.target_per_week).where(Habit.id == habit_id)
    )).first()
    if row is None:
        return "daily", None, 1
    freq, days, target = row
    return freq, parse_days(days), max(1, target or 1)


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


async def completed_dates(db: AsyncSession, habit_id: int) -> list[date]:
    """Días distintos con marca, ordenados. Distintos a propósito: una fila
    duplicada heredada no debe contar dos veces contra una meta semanal."""
    rows = (await db.execute(
        select(HabitLog.completed_at).where(HabitLog.habit_id == habit_id)
    )).scalars().all()
    return sorted({r.date() for r in rows})


async def habit_streak(db: AsyncSession, habit_id: int) -> int:
    """Racha consecutiva actual, contada en unidades de la cadencia del hábito:
    días programados si es diario, semanas ISO que alcanzaron la meta si es semanal."""
    dates = await completed_dates(db, habit_id)
    if not dates:
        return 0
    freq, days, target = await habit_cadence(db, habit_id)

    if freq == "weekly":
        counts = Counter(_week_monday(d) for d in dates)
        units = {w for w, n in counts.items() if n >= target}
        anchor = _week_monday(_today())
        back = lambda u: u - timedelta(weeks=1)  # noqa: E731
    else:
        units = set(dates)
        anchor = last_scheduled(days, _today())
        back = lambda u: prev_scheduled(days, u)  # noqa: E731

    if anchor is None:
        return 0
    if anchor in units:
        cursor = anchor
    else:
        # margen: la unidad en curso todavía se puede cumplir, así que la racha
        # se ancla en la anterior en vez de darse por rota.
        cursor = back(anchor)
        if cursor is None or cursor not in units:
            return 0
    streak = 0
    while cursor is not None and cursor in units:
        streak += 1
        cursor = back(cursor)
    return streak


async def best_streak(db: AsyncSession, habit_id: int) -> int:
    dates = await completed_dates(db, habit_id)
    if not dates:
        return 0
    freq, days, target = await habit_cadence(db, habit_id)

    if freq == "weekly":
        counts = Counter(_week_monday(d) for d in dates)
        units = sorted(w for w, n in counts.items() if n >= target)
        nxt = lambda u: u + timedelta(weeks=1)  # noqa: E731
    else:
        # las marcas fuera de los días programados no cuentan como unidad: si no
        # se filtraran, un extra en sábado partiría la racha de un hábito L–V.
        units = sorted(d for d in set(dates) if scheduled_on(days, d))
        nxt = lambda u: next_scheduled(days, u)  # noqa: E731

    if not units:
        return 0
    best = run = 1
    for i in range(1, len(units)):
        run = run + 1 if nxt(units[i - 1]) == units[i] else 1
        best = max(best, run)
    return best


async def remove_xp(db: AsyncSession, user: User, amount: int, source: str, source_id: int | None = None) -> dict:
    """Reverse previously granted XP (logs a negative audit entry, recomputes level/title)."""
    return await award_xp(db, user, -abs(int(amount)), source, source_id)
