from datetime import datetime, date, timedelta
from tz import now as _now, today as _today, to_naive
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

    finished = _now()
    session = PomodoroSession(
        task_id=payload.task_id,
        project_id=project_id,
        work_minutes=payload.work_minutes,
        completed=payload.completed,
        # El cliente es el único que sabe cuándo se pulsó Iniciar. Si no lo dice,
        # se deduce del final: sigue siendo mejor que sellar la hora de fin.
        started_at=to_naive(payload.started_at) or finished - timedelta(minutes=payload.work_minutes),
        finished_at=finished,
    )
    db.add(session)
    await db.flush()

    user = await get_user(db)
    if payload.completed:
        result = await award_xp(db, user, BASE_XP["pomodoro_session"], "pomodoro", session.id)
        ach = await check_achievements(db, user, "pomodoro_complete")
    else:
        # Un bloque abandonado no puntúa: se devuelve el estado tal cual está.
        result = {
            "xp_earned": 0,
            "new_xp": user.xp,
            "new_level": user.level,
            "title": user.title,
            "leveled_up": False,
        }
        ach = None

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
            func.date(PomodoroSession.finished_at) == _today().isoformat()
        ).order_by(PomodoroSession.started_at.desc())
    )).scalars().all()
    return await _serialize(db, rows)


@router.get("/range", response_model=list[PomodoroOut])
async def sessions_in_range(start: date, end: date, db: AsyncSession = Depends(get_db)):
    """Sesiones que terminaron dentro de [start, end] — las pinta el calendario semanal.

    Por fecha de fin, no de inicio: es el criterio que ya usan estadísticas,
    misiones y la propia rejilla semanal. Mientras `started_at` guardaba la hora
    de fin daba lo mismo; ahora que es real, un bloque que cruza la medianoche
    se contaría en un día aquí y en el otro allá.
    """
    rows = (await db.execute(
        select(PomodoroSession).where(
            func.date(PomodoroSession.finished_at) >= start.isoformat(),
            func.date(PomodoroSession.finished_at) <= end.isoformat(),
        ).order_by(PomodoroSession.started_at)
    )).scalars().all()
    return await _serialize(db, rows)
