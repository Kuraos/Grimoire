from datetime import date, datetime, timedelta
from typing import Literal
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    XPLog, HabitLog, Habit, PomodoroSession, Task, DailyCheckin, Project,
)
from services import habit_streak, scheduled_occasions

router = APIRouter(prefix="/stats", tags=["stats"])


Period = Literal["week", "month", "year"]


def _period_start(period: str) -> date:
    today = _today()
    if period == "week":
        return today - timedelta(days=6)
    if period == "year":
        return today - timedelta(days=364)
    return today - timedelta(days=29)  # month default (30 days)


@router.get("")
async def stats(period: Period = Query("week"), db: AsyncSession = Depends(get_db)):
    start = _period_start(period)
    today = _today()
    start_iso = start.isoformat()

    # XP total + per day
    xp_total = (await db.execute(
        select(func.coalesce(func.sum(XPLog.amount), 0)).where(func.date(XPLog.earned_at) >= start_iso)
    )).scalar_one()
    xp_rows = (await db.execute(
        select(func.date(XPLog.earned_at), func.sum(XPLog.amount))
        .where(func.date(XPLog.earned_at) >= start_iso)
        .group_by(func.date(XPLog.earned_at))
    )).all()
    xp_map = {str(r[0]): r[1] for r in xp_rows}

    # fill every day in the range
    xp_by_day = []
    cursor = start
    while cursor <= today:
        iso = cursor.isoformat()
        xp_by_day.append({"date": iso, "xp": int(xp_map.get(iso, 0))})
        cursor += timedelta(days=1)

    habits_completed = (await db.execute(
        select(func.count(HabitLog.id)).where(func.date(HabitLog.completed_at) >= start_iso)
    )).scalar_one()
    # las ocasiones que los hábitos pidieron, no los días del calendario por
    # hábito: un L–V no falla los sábados y un 2×/semana no falla cinco veces
    habits_possible = await scheduled_occasions(db, start, today)

    pomo = (await db.execute(
        select(func.count(PomodoroSession.id), func.coalesce(func.sum(PomodoroSession.work_minutes), 0))
        .where(PomodoroSession.completed == True, func.date(PomodoroSession.finished_at) >= start_iso)
    )).one()

    tasks_closed = (await db.execute(
        select(func.count(Task.id)).where(
            Task.completed == True, func.date(Task.completed_at) >= start_iso
        )
    )).scalar_one()

    checkins = (await db.execute(
        select(func.avg(DailyCheckin.energy), func.avg(DailyCheckin.mood))
        .where(DailyCheckin.checkin_date >= start)
    )).one()

    # XP by habit category
    cat_rows = (await db.execute(
        select(Habit.category, func.coalesce(func.sum(XPLog.amount), 0))
        .join(XPLog, (XPLog.source == "habit") & (XPLog.source_id == Habit.id))
        .where(func.date(XPLog.earned_at) >= start_iso)
        .group_by(Habit.category)
    )).all()
    xp_by_category = [{"category": r[0], "xp": int(r[1])} for r in cat_rows]

    # energy / mood time series with XP overlay
    checkin_rows = (await db.execute(
        select(DailyCheckin.checkin_date, DailyCheckin.energy, DailyCheckin.mood)
        .where(DailyCheckin.checkin_date >= start).order_by(DailyCheckin.checkin_date)
    )).all()
    mood_energy = [
        {"date": r[0].isoformat(), "energy": r[1], "mood": r[2],
         "xp": int(xp_map.get(r[0].isoformat(), 0))}
        for r in checkin_rows
    ]

    # top streaks (current) per active habit
    habits = (await db.execute(select(Habit).where(Habit.active == True))).scalars().all()
    streaks = []
    for h in habits:
        # la frecuencia viaja con la racha: un hábito semanal la cuenta en
        # semanas, y sin este campo la vista sólo podía rotularlas todas "días"
        streaks.append({"name": h.name, "color": h.color, "frequency": h.frequency,
                        "streak": await habit_streak(db, h.id)})
    streaks.sort(key=lambda x: x["streak"], reverse=True)
    top_streaks = streaks[:5]

    # hours by project (all-time pomodoro)
    proj_rows = (await db.execute(
        select(Project.name, Project.color, func.coalesce(func.sum(PomodoroSession.work_minutes), 0))
        .join(PomodoroSession, PomodoroSession.project_id == Project.id)
        .where(PomodoroSession.completed == True)
        .group_by(Project.id)
    )).all()
    hours_by_project = [
        {"project": r[0], "color": r[1], "hours": round(r[2] / 60, 1)} for r in proj_rows
    ]
    hours_by_project.sort(key=lambda x: x["hours"], reverse=True)

    # habit heatmap (last 365 days) — completions per day
    heat_rows = (await db.execute(
        select(func.date(HabitLog.completed_at), func.count(HabitLog.id))
        .where(func.date(HabitLog.completed_at) >= (today - timedelta(days=364)).isoformat())
        .group_by(func.date(HabitLog.completed_at))
    )).all()
    heatmap = [{"date": str(r[0]), "count": int(r[1])} for r in heat_rows]

    return {
        "period": period,
        "xp_total": int(xp_total),
        "xp_by_day": xp_by_day,
        "habits_completed": int(habits_completed),
        "habits_possible": int(habits_possible),
        "habits_rate": round(habits_completed / habits_possible * 100, 1) if habits_possible else 0,
        "pomodoro_sessions": int(pomo[0]),
        "pomodoro_minutes_total": int(pomo[1]),
        "tasks_closed": int(tasks_closed),
        "avg_energy": round(checkins[0], 1) if checkins[0] else None,
        "avg_mood": round(checkins[1], 1) if checkins[1] else None,
        "xp_by_category": xp_by_category,
        "mood_energy": mood_energy,
        "top_streaks": top_streaks,
        "hours_by_project": hours_by_project,
        "heatmap": heatmap,
    }
