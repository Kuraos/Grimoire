from datetime import date, datetime, timedelta
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Quest, HabitLog, PomodoroSession, Task, DiaryEntry
from schemas import QuestOut, XPEventResponse, AchievementOut
from services import get_user, award_xp
from constants import QUEST_TEMPLATES
from achievements import check_achievements

router = APIRouter(prefix="/quests", tags=["quests"])


def _period_key(scope: str, today: date) -> str:
    if scope == "weekly":
        y, w, _ = today.isocalendar()
        return f"{y}-W{w:02d}"
    return today.isoformat()


def _window(scope: str, today: date) -> tuple[date, date]:
    if scope == "weekly":
        monday = today - timedelta(days=today.weekday())
        return monday, monday + timedelta(days=6)
    return today, today


async def _progress(db: AsyncSession, metric: str, start: date, end: date) -> int:
    s, e = start.isoformat(), end.isoformat()
    if metric == "habits_completed":
        return (await db.execute(select(func.count(HabitLog.id)).where(
            func.date(HabitLog.completed_at) >= s, func.date(HabitLog.completed_at) <= e))).scalar_one()
    if metric == "focus_minutes":
        return (await db.execute(select(func.coalesce(func.sum(PomodoroSession.work_minutes), 0)).where(
            PomodoroSession.completed == True,
            func.date(PomodoroSession.finished_at) >= s, func.date(PomodoroSession.finished_at) <= e))).scalar_one()
    if metric == "tasks_completed":
        return (await db.execute(select(func.count(Task.id)).where(
            Task.completed == True,
            func.date(Task.completed_at) >= s, func.date(Task.completed_at) <= e))).scalar_one()
    if metric == "diary_entries":
        return (await db.execute(select(func.count(DiaryEntry.id)).where(
            DiaryEntry.entry_date >= start, DiaryEntry.entry_date <= end, DiaryEntry.content != ""))).scalar_one()
    return 0


_RETENTION_DAYS = 60


async def _purge_old(db: AsyncSession, today: date) -> None:
    """Quests are seeded per period and were never cleaned up, growing forever."""
    cutoff = today - timedelta(days=_RETENTION_DAYS)
    cy, cw, _ = cutoff.isocalendar()
    await db.execute(delete(Quest).where(
        Quest.scope == "daily", Quest.period_key < cutoff.isoformat()
    ))
    await db.execute(delete(Quest).where(
        Quest.scope == "weekly", Quest.period_key < f"{cy}-W{cw:02d}"
    ))


async def _ensure_period(db: AsyncSession, today: date) -> list[Quest]:
    await _purge_old(db, today)
    quests: list[Quest] = []
    for tkey, scope, metric, target, title, icon, xp in QUEST_TEMPLATES:
        pkey = _period_key(scope, today)
        q = (await db.execute(select(Quest).where(
            Quest.template_key == tkey, Quest.period_key == pkey))).scalar_one_or_none()
        if q is None:
            q = Quest(scope=scope, period_key=pkey, template_key=tkey, metric=metric,
                      target=target, title=title, icon=icon, xp_reward=xp)
            db.add(q)
            await db.flush()
        quests.append(q)
    return quests


async def _serialize(db: AsyncSession, q: Quest, today: date) -> QuestOut:
    start, end = _window(q.scope, today)
    prog = await _progress(db, q.metric, start, end)
    out = QuestOut.model_validate(q)
    out.progress = min(prog, q.target)
    out.completed = prog >= q.target
    return out


@router.get("", response_model=list[QuestOut])
async def list_quests(db: AsyncSession = Depends(get_db)):
    today = _today()
    quests = await _ensure_period(db, today)
    await db.commit()
    return [await _serialize(db, q, today) for q in quests]


@router.post("/{quest_id}/claim", response_model=XPEventResponse)
async def claim_quest(quest_id: int, db: AsyncSession = Depends(get_db)):
    today = _today()
    q = await db.get(Quest, quest_id)
    if not q:
        raise HTTPException(404, "Misión no encontrada")
    if q.claimed:
        raise HTTPException(400, "Misión ya reclamada")
    start, end = _window(q.scope, today)
    if await _progress(db, q.metric, start, end) < q.target:
        raise HTTPException(400, "Misión aún no completada")

    q.claimed = True
    q.claimed_at = _now()
    user = await get_user(db)
    result = await award_xp(db, user, q.xp_reward, "quest", q.id)
    ach = await check_achievements(db, user, "quest_claim")
    await db.commit()
    return XPEventResponse(
        **result,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )
