"""Achievement evaluator. check_achievements is called after XP-earning events."""
from datetime import datetime, date, timedelta
from tz import now as _now, today as _today
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Achievement, Habit, HabitLog, Task, PomodoroSession, DiaryEntry,
    DailyCheckin, WeeklyReview, Project, User, Quest,
)
from services import habit_streak


async def _unlock(db: AsyncSession, key: str) -> Achievement | None:
    ach = (await db.execute(select(Achievement).where(Achievement.key == key))).scalar_one_or_none()
    if ach and not ach.unlocked:
        ach.unlocked = True
        ach.unlocked_at = _now()
        return ach
    return None


async def _max_current_streak(db: AsyncSession) -> int:
    habit_ids = (await db.execute(select(Habit.id).where(Habit.active == True))).scalars().all()
    best = 0
    for hid in habit_ids:
        best = max(best, await habit_streak(db, hid))
    return best


async def _consecutive_days_count(days: set[date]) -> int:
    """Length of consecutive-day streak ending today or yesterday within `days`."""
    if not days:
        return 0
    today = _today()
    if today in days:
        cursor = today
    elif (today - timedelta(days=1)) in days:
        cursor = today - timedelta(days=1)
    else:
        return 0
    n = 0
    while cursor in days:
        n += 1
        cursor -= timedelta(days=1)
    return n


async def check_achievements(db: AsyncSession, user: User, event: str, **kwargs) -> Achievement | None:
    """Evaluate all relevant achievements; return the first newly unlocked one (for the toast)."""
    unlocked: list[Achievement] = []

    # Level based
    if user.level >= 5:
        if (a := await _unlock(db, "ascension")):
            unlocked.append(a)
    if user.level >= 10:
        if (a := await _unlock(db, "contemplator")):
            unlocked.append(a)
    if user.level >= 15:
        if (a := await _unlock(db, "archon")):
            unlocked.append(a)
    if user.level >= 20:
        if (a := await _unlock(db, "ether_being")):
            unlocked.append(a)

    if event == "habit_complete":
        total_logs = (await db.execute(select(func.count(HabitLog.id)))).scalar_one()
        if total_logs >= 1:
            if (a := await _unlock(db, "first_blood")):
                unlocked.append(a)
        max_streak = await _max_current_streak(db)
        if max_streak >= 7:
            if (a := await _unlock(db, "iron_constancy")):
                unlocked.append(a)
        if max_streak >= 30:
            if (a := await _unlock(db, "iron_month")):
                unlocked.append(a)
        if max_streak >= 60:
            if (a := await _unlock(db, "streak_60")):
                unlocked.append(a)
        if max_streak >= 100:
            if (a := await _unlock(db, "streak_centurion")):
                unlocked.append(a)
        # Polymath: active habits across >= 4 categories
        cats = (await db.execute(
            select(func.count(distinct(Habit.category))).where(Habit.active == True)
        )).scalar_one()
        if cats >= 4:
            if (a := await _unlock(db, "polymath")):
                unlocked.append(a)
        # Total discipline: all active habits done for 7 consecutive days
        if await _check_total_discipline(db):
            if (a := await _unlock(db, "total_discipline")):
                unlocked.append(a)

    if event == "task_complete":
        # Project master: a project where all tasks are completed (and it has tasks)
        projects = (await db.execute(select(Project))).scalars().all()
        for p in projects:
            total = (await db.execute(
                select(func.count(Task.id)).where(Task.project_id == p.id)
            )).scalar_one()
            done = (await db.execute(
                select(func.count(Task.id)).where(Task.project_id == p.id, Task.completed == True)
            )).scalar_one()
            if total > 0 and done == total:
                if (a := await _unlock(db, "project_master")):
                    unlocked.append(a)
                break
        total_done = (await db.execute(
            select(func.count(Task.id)).where(Task.completed == True)
        )).scalar_one()
        if total_done >= 100:
            if (a := await _unlock(db, "task_centurion")):
                unlocked.append(a)

    if event == "pomodoro_complete":
        count = (await db.execute(
            select(func.count(PomodoroSession.id)).where(PomodoroSession.completed == True)
        )).scalar_one()
        if count >= 100:
            if (a := await _unlock(db, "focus_centurion")):
                unlocked.append(a)
        if count >= 250:
            if (a := await _unlock(db, "focus_legend")):
                unlocked.append(a)

    if event == "diary_entry":
        # only entries with actual content count (empty rows must not unlock this)
        count = (await db.execute(
            select(func.count(DiaryEntry.id)).where(DiaryEntry.content != "")
        )).scalar_one()
        if count >= 30:
            if (a := await _unlock(db, "archivist")):
                unlocked.append(a)
        if count >= 100:
            if (a := await _unlock(db, "diary_century")):
                unlocked.append(a)

    if event == "quest_claim":
        n = (await db.execute(select(func.count(Quest.id)).where(Quest.claimed == True))).scalar_one()
        if n >= 10:
            if (a := await _unlock(db, "quest_devotee")):
                unlocked.append(a)

    if event == "daily_checkin":
        rows = (await db.execute(select(DailyCheckin.checkin_date))).scalars().all()
        if await _consecutive_days_count(set(rows)) >= 14:
            if (a := await _unlock(db, "introspection")):
                unlocked.append(a)

    if event == "weekly_review":
        count = (await db.execute(select(func.count(WeeklyReview.id)))).scalar_one()
        if count >= 4:
            if (a := await _unlock(db, "great_review")):
                unlocked.append(a)

    return unlocked[0] if unlocked else None


async def _check_total_discipline(db: AsyncSession) -> bool:
    """True if, for 7 consecutive days ending today, every active daily habit was logged."""
    active = (await db.execute(
        select(Habit).where(Habit.active == True, Habit.frequency == "daily")
    )).scalars().all()
    if not active:
        return False
    today = _today()
    for offset in range(7):
        day = today - timedelta(days=offset)
        for h in active:
            # only count habits that existed on that day
            if h.created_at.date() > day:
                continue
            logged = (await db.execute(
                select(func.count(HabitLog.id)).where(
                    HabitLog.habit_id == h.id,
                    func.date(HabitLog.completed_at) == day.isoformat(),
                )
            )).scalar_one()
            if logged == 0:
                return False
    return True
