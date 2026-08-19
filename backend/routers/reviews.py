from datetime import date, datetime, timedelta
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    WeeklyReview, HabitLog, PomodoroSession, Task, XPLog, DailyCheckin,
)
from schemas import ReviewCreate, ReviewOut, XPEventResponse, AchievementOut
from services import get_user, award_xp, scheduled_occasions
from constants import BASE_XP
from achievements import check_achievements

router = APIRouter(prefix="/weekly-reviews", tags=["reviews"])


def _iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _week_bounds(d: date) -> tuple[date, date]:
    monday = d - timedelta(days=d.weekday())
    return monday, monday + timedelta(days=6)


async def _period_xp(db: AsyncSession, start: date, end: date) -> int:
    return (await db.execute(
        select(func.coalesce(func.sum(XPLog.amount), 0)).where(
            func.date(XPLog.earned_at) >= start.isoformat(),
            func.date(XPLog.earned_at) <= end.isoformat(),
        )
    )).scalar_one()


@router.get("/summary")
async def week_summary(db: AsyncSession = Depends(get_db)):
    today = _today()
    start, end = _week_bounds(today)
    prev_start, prev_end = start - timedelta(days=7), end - timedelta(days=7)

    xp_total = await _period_xp(db, start, end)
    xp_prev = await _period_xp(db, prev_start, prev_end)
    delta_pct = round((xp_total - xp_prev) / xp_prev * 100, 1) if xp_prev else None

    # Lo que la semana ha pedido HASTA HOY. Contaba `hábitos diarios × días
    # transcurridos`, que ignoraba la cadencia y dejaba fuera a los semanales
    # —cuyas marcas sí sumaban arriba—, así que el cociente podía pasar del 100%.
    habits_possible = await scheduled_occasions(db, start, today)
    habits_completed = (await db.execute(
        select(func.count(HabitLog.id)).where(
            func.date(HabitLog.completed_at) >= start.isoformat(),
            func.date(HabitLog.completed_at) <= end.isoformat(),
        )
    )).scalar_one()

    pomo = (await db.execute(
        select(func.count(PomodoroSession.id), func.coalesce(func.sum(PomodoroSession.work_minutes), 0))
        .where(
            PomodoroSession.completed == True,
            func.date(PomodoroSession.finished_at) >= start.isoformat(),
            func.date(PomodoroSession.finished_at) <= end.isoformat(),
        )
    )).one()

    tasks_closed = (await db.execute(
        select(func.count(Task.id)).where(
            Task.completed == True,
            func.date(Task.completed_at) >= start.isoformat(),
            func.date(Task.completed_at) <= end.isoformat(),
        )
    )).scalar_one()
    tasks_open = (await db.execute(
        select(func.count(Task.id)).where(Task.completed == False)
    )).scalar_one()

    checkins = (await db.execute(
        select(func.avg(DailyCheckin.energy), func.avg(DailyCheckin.mood)).where(
            DailyCheckin.checkin_date >= start, DailyCheckin.checkin_date <= end
        )
    )).one()

    return {
        "week_iso": _iso_week(today),
        "xp_total": xp_total,
        "xp_prev": xp_prev,
        "xp_delta_pct": delta_pct,
        "habits_completed": habits_completed,
        "habits_possible": habits_possible,
        "pomodoro_sessions": pomo[0],
        "pomodoro_minutes": pomo[1],
        "tasks_closed": tasks_closed,
        "tasks_open": tasks_open,
        "avg_energy": round(checkins[0], 1) if checkins[0] else None,
        "avg_mood": round(checkins[1], 1) if checkins[1] else None,
    }


@router.get("", response_model=list[ReviewOut])
async def list_reviews(db: AsyncSession = Depends(get_db)):
    return (await db.execute(
        select(WeeklyReview).order_by(WeeklyReview.created_at.desc())
    )).scalars().all()


@router.post("", response_model=XPEventResponse)
async def create_review(payload: ReviewCreate, db: AsyncSession = Depends(get_db)):
    week = payload.week_iso or _iso_week(_today())
    existing = (await db.execute(
        select(WeeklyReview).where(WeeklyReview.week_iso == week)
    )).scalar_one_or_none()

    if existing:
        existing.what_worked = payload.what_worked
        existing.what_failed = payload.what_failed
        existing.next_change = payload.next_change
        existing.rating = payload.rating
        await db.commit()
        return XPEventResponse(new_xp=(await get_user(db)).xp)

    db.add(WeeklyReview(
        week_iso=week,
        what_worked=payload.what_worked,
        what_failed=payload.what_failed,
        next_change=payload.next_change,
        rating=payload.rating,
    ))
    await db.flush()
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["weekly_review"], "weekly_review", None)
    ach = await check_achievements(db, user, "weekly_review")
    await db.commit()
    return XPEventResponse(
        **result,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )
