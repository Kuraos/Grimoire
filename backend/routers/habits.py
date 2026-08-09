from collections import Counter
from datetime import date, datetime, timedelta
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Habit, HabitLog, XPLog, HabitCategory
from schemas import HabitCreate, HabitUpdate, HabitOut, HabitLogOut, XPEventResponse, AchievementOut
from services import (
    get_user, award_xp, remove_xp, habit_streak, best_streak, like_escape,
    habit_cadence, parse_days, scheduled_on, _week_monday,
)
from constants import streak_multiplier
from achievements import check_achievements


def _completion_period(habit: Habit) -> tuple[date, date, str]:
    """Return (start, end, noun) for the dedup window: this day, or this ISO week if weekly."""
    today = _today()
    if habit.frequency == "weekly":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6), "esta semana"
    return today, today, "hoy"

router = APIRouter(prefix="/habits", tags=["habits"])


async def _enrich(db: AsyncSession, habit: Habit) -> HabitOut:
    out = HabitOut.model_validate(habit)
    out.streak = await habit_streak(db, habit.id)
    out.best_streak = await best_streak(db, habit.id)
    out.total_xp = (await db.execute(
        select(func.coalesce(func.sum(XPLog.amount), 0)).where(
            XPLog.source == "habit", XPLog.source_id == habit.id
        )
    )).scalar_one()
    logs = (await db.execute(
        select(HabitLog.completed_at).where(HabitLog.habit_id == habit.id)
    )).scalars().all()
    distinct_days = {l.date() for l in logs}
    # El ritmo se mide contra las ocasiones que el hábito realmente pedía: los días
    # programados, o las semanas transcurridas si es semanal. Medirlo contra días
    # naturales daba un techo de 14% a cualquier hábito semanal.
    days = parse_days(habit.days)
    target = max(1, habit.target_per_week or 1)
    start, today = habit.created_at.date(), _today()
    if habit.frequency == "weekly":
        counts = Counter(_week_monday(d) for d in distinct_days)
        done_units = sum(1 for n in counts.values() if n >= target)
        total_units = max(1, (_week_monday(today) - _week_monday(start)).days // 7 + 1)
    else:
        done_units = sum(1 for d in distinct_days if scheduled_on(days, d))
        total_units = max(1, sum(
            1 for i in range((today - start).days + 1) if scheduled_on(days, start + timedelta(days=i))
        ))
    out.completion_rate = round(min(done_units, total_units) / total_units * 100, 1)
    out.done_today = today in distinct_days
    out.last_completed = max(logs) if logs else None
    return out


@router.get("", response_model=list[HabitOut])
async def list_habits(include_archived: bool = False, tag: str | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Habit)
    if not include_archived:
        q = q.where(Habit.active == True)
    if tag:
        q = q.where(Habit.tags.ilike(f"%{like_escape(tag)}%", escape="\\"))
    habits = (await db.execute(q.order_by(Habit.category, Habit.name))).scalars().all()
    return [await _enrich(db, h) for h in habits]


async def _ensure_category(db: AsyncSession, name: str | None, color: str | None = None) -> None:
    """Keep the category catalog self-healing: a habit can never reference a
    category that isn't listed (that used to leave orphans)."""
    if not name:
        return
    exists = (await db.execute(
        select(HabitCategory).where(HabitCategory.name == name)
    )).scalar_one_or_none()
    if exists is None:
        db.add(HabitCategory(name=name, color=color or "#9b7fc4"))


@router.post("", response_model=HabitOut, status_code=201)
async def create_habit(payload: HabitCreate, db: AsyncSession = Depends(get_db)):
    habit = Habit(**payload.model_dump())
    db.add(habit)
    await _ensure_category(db, habit.category, habit.color)
    await db.commit()
    await db.refresh(habit)
    return await _enrich(db, habit)


@router.get("/{habit_id}", response_model=HabitOut)
async def get_habit(habit_id: int, db: AsyncSession = Depends(get_db)):
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Hábito no encontrado")
    return await _enrich(db, habit)


@router.get("/{habit_id}/logs", response_model=list[HabitLogOut])
async def habit_history(habit_id: int, db: AsyncSession = Depends(get_db)):
    logs = (await db.execute(
        select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.completed_at.desc())
    )).scalars().all()
    return logs


@router.get("/{habit_id}/xp-series")
async def habit_xp_series(habit_id: int, db: AsyncSession = Depends(get_db)):
    """Real cumulative XP over time from xp_log (exact amounts incl. streak
    multipliers and undo reversals) — not an approximation."""
    rows = (await db.execute(
        select(XPLog.amount, XPLog.earned_at)
        .where(XPLog.source == "habit", XPLog.source_id == habit_id)
        .order_by(XPLog.earned_at)
    )).all()
    series = []
    cum = 0
    for amount, earned in rows:
        cum += amount
        series.append({"date": earned.date().isoformat(), "xp": cum})
    return series


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(habit_id: int, payload: HabitUpdate, db: AsyncSession = Depends(get_db)):
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Hábito no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(habit, k, v)
    await _ensure_category(db, habit.category, habit.color)
    await db.commit()
    await db.refresh(habit)
    return await _enrich(db, habit)


@router.delete("/{habit_id}", status_code=204)
async def archive_habit(habit_id: int, db: AsyncSession = Depends(get_db)):
    """Soft delete: active = False, keep history."""
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Hábito no encontrado")
    habit.active = False
    await db.commit()


@router.post("/{habit_id}/complete", response_model=XPEventResponse)
async def complete_habit(habit_id: int, db: AsyncSession = Depends(get_db)):
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Hábito no encontrado")

    # 1. límites de cadencia: nunca dos veces el mismo día — y si es semanal,
    #    nunca más marcas que la meta, para que "2×/semana" no se cumpla de un tirón.
    today = _today()
    if (await db.execute(
        select(func.count(HabitLog.id)).where(
            HabitLog.habit_id == habit_id,
            func.date(HabitLog.completed_at) == today.isoformat(),
        )
    )).scalar_one():
        raise HTTPException(400, "Este hábito ya fue completado hoy")

    target = max(1, habit.target_per_week or 1)
    if habit.frequency == "weekly":
        wstart = _week_monday(today)
        week_count = (await db.execute(
            select(func.count(HabitLog.id)).where(
                HabitLog.habit_id == habit_id,
                func.date(HabitLog.completed_at) >= wstart.isoformat(),
                func.date(HabitLog.completed_at) <= (wstart + timedelta(days=6)).isoformat(),
            )
        )).scalar_one()
        if week_count >= target:
            raise HTTPException(400, (
                f"Este hábito ya alcanzó su meta de {target}× esta semana" if target > 1
                else "Este hábito ya fue completado esta semana"
            ))

    # 2. current streak BEFORE inserting (will become streak+1)
    prior = await habit_streak(db, habit_id)
    new_streak = prior + 1

    # 3. streak multiplier
    mult = streak_multiplier(new_streak)
    amount = round(habit.xp_reward * mult)

    # 4. insert log
    db.add(HabitLog(habit_id=habit_id))
    await db.flush()

    # 5-6. award xp + level recalc
    user = await get_user(db)
    result = await award_xp(db, user, amount, "habit", habit_id)

    # 7. achievements
    ach = await check_achievements(db, user, "habit_complete", habit_id=habit_id)

    await db.commit()
    return XPEventResponse(
        **result,
        streak=new_streak,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )


@router.delete("/{habit_id}/complete", response_model=XPEventResponse)
async def uncomplete_habit(habit_id: int, db: AsyncSession = Depends(get_db)):
    """Undo the latest completion of this period: remove the log and reverse its XP."""
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Hábito no encontrado")
    start, end, noun = _completion_period(habit)

    log = (await db.execute(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            func.date(HabitLog.completed_at) >= start.isoformat(),
            func.date(HabitLog.completed_at) <= end.isoformat(),
        ).order_by(HabitLog.completed_at.desc(), HabitLog.id.desc()).limit(1)
    )).scalar_one_or_none()
    if log is None:
        raise HTTPException(400, f"Este hábito no fue completado {noun}")

    # Sólo la concesión más reciente: con una meta de varias marcas por semana,
    # deshacer una no puede llevarse el XP de las otras.
    granted = (await db.execute(
        select(XPLog.amount).where(
            XPLog.source == "habit", XPLog.source_id == habit_id,
            XPLog.amount > 0,
            func.date(XPLog.earned_at) >= start.isoformat(),
            func.date(XPLog.earned_at) <= end.isoformat(),
        ).order_by(XPLog.earned_at.desc(), XPLog.id.desc()).limit(1)
    )).scalar_one_or_none() or 0

    await db.delete(log)

    user = await get_user(db)
    result = await remove_xp(db, user, granted, "habit", habit_id)
    await db.commit()
    return XPEventResponse(**result, streak=await habit_streak(db, habit_id))
