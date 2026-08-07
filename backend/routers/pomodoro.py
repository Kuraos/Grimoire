from datetime import datetime, date
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import PomodoroSession, Task
from schemas import PomodoroCreate, PomodoroOut, XPEventResponse, AchievementOut
from services import get_user, award_xp
from constants import BASE_XP
from achievements import check_achievements

router = APIRouter(prefix="/pomodoro", tags=["pomodoro"])


async def _today_minutes(db: AsyncSession) -> int:
    return (await db.execute(
        select(func.coalesce(func.sum(PomodoroSession.work_minutes), 0)).where(
            PomodoroSession.completed == True,
            func.date(PomodoroSession.finished_at) == _today().isoformat(),
        )
    )).scalar_one()


@router.post("/sessions", response_model=XPEventResponse)
async def create_session(payload: PomodoroCreate, db: AsyncSession = Depends(get_db)):
    project_id = payload.project_id
    # inherit project from task if not given
    if project_id is None and payload.task_id is not None:
        task = await db.get(Task, payload.task_id)
        if task:
            project_id = task.project_id

    session = PomodoroSession(
        task_id=payload.task_id,
        project_id=project_id,
        work_minutes=payload.work_minutes,
        completed=True,
        finished_at=_now(),
    )
    db.add(session)
    await db.flush()

    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["pomodoro_session"], "pomodoro", session.id)
    ach = await check_achievements(db, user, "pomodoro_complete")

    await db.commit()
    return XPEventResponse(
        **result,
        total_today_minutes=await _today_minutes(db),
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )


async def _serialize(db: AsyncSession, rows) -> list[PomodoroOut]:
    out: list[PomodoroOut] = []
    for s in rows:
        o = PomodoroOut.model_validate(s)
        if s.task_id:
            task = await db.get(Task, s.task_id)
            o.task_title = task.title if task else None
        out.append(o)
    return out


@router.get("/today", response_model=list[PomodoroOut])
async def today_sessions(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(PomodoroSession).where(
            func.date(PomodoroSession.started_at) == _today().isoformat()
        ).order_by(PomodoroSession.started_at.desc())
    )).scalars().all()
    return await _serialize(db, rows)


@router.get("/range", response_model=list[PomodoroOut])
async def sessions_in_range(start: date, end: date, db: AsyncSession = Depends(get_db)):
    """Completed sessions whose start date falls within [start, end] — used by the week calendar."""
    rows = (await db.execute(
        select(PomodoroSession).where(
            func.date(PomodoroSession.started_at) >= start.isoformat(),
            func.date(PomodoroSession.started_at) <= end.isoformat(),
        ).order_by(PomodoroSession.started_at)
    )).scalars().all()
    return await _serialize(db, rows)
