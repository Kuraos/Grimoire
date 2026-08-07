from datetime import date, timedelta
from tz import today as _today
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Habit, HabitLog
from services import get_user, award_xp
from constants import xp_for_level, MAX_LIVES, STREAK_BREAK_XP_PENALTY
from schemas import UserOut, UserUpdate, StreakEvalResponse

router = APIRouter(prefix="/user", tags=["user"])


def _enrich(user) -> UserOut:
    # level 1 begins at 0 XP (the formula's clamp), every higher level at level²·100
    cur = 0 if user.level <= 1 else xp_for_level(user.level)
    nxt = xp_for_level(user.level + 1)
    out = UserOut.model_validate(user)
    out.xp_for_current_level = cur
    out.xp_for_next_level = nxt
    out.xp_into_level = max(0, user.xp - cur)
    out.xp_span = max(1, nxt - cur)
    return out


@router.get("", response_model=UserOut)
@router.get("/", response_model=UserOut)
async def read_user(db: AsyncSession = Depends(get_db)):
    user = await get_user(db)
    await db.commit()
    return _enrich(user)


@router.patch("", response_model=UserOut)
@router.patch("/", response_model=UserOut)
async def update_user(payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await get_user(db)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] and data["name"].strip():
        user.name = data["name"].strip()
    if "obsidian_vault_path" in data:
        # allow empty string to clear the configured path
        vp = (data["obsidian_vault_path"] or "").strip()
        user.obsidian_vault_path = vp or None
    await db.commit()
    return _enrich(user)


_SCAN_WINDOW_DAYS = 14  # bound the catch-up so a long absence can't do huge work


@router.post("/evaluate-streaks", response_model=StreakEvalResponse)
async def evaluate_streaks(db: AsyncSession = Depends(get_db)):
    """Catch up on every unevaluated day since last_streak_eval (bounded to the
    last 14 days). Each day with a broken daily-habit streak costs a life (or XP
    if none left); each "perfect day" (all active daily habits done) regains one,
    up to MAX_LIVES. Idempotent per day via last_streak_eval."""
    user = await get_user(db)
    today = _today()
    if user.last_streak_eval is not None and user.last_streak_eval >= today:
        return StreakEvalResponse(lives=user.lives, new_xp=user.xp)

    # days to evaluate: strictly before today, within the scan window
    start = today - timedelta(days=_SCAN_WINDOW_DAYS)
    if user.last_streak_eval is not None:
        start = max(start, user.last_streak_eval + timedelta(days=1))

    habits = (await db.execute(
        select(Habit).where(Habit.active == True, Habit.frequency == "daily")
    )).scalars().all()
    # precompute each habit's completed-day set (one query per habit)
    day_sets: dict[int, set[date]] = {}
    for h in habits:
        rows = (await db.execute(
            select(HabitLog.completed_at).where(HabitLog.habit_id == h.id)
        )).scalars().all()
        day_sets[h.id] = {r.date() for r in rows}

    broken: list[str] = []
    lives_lost = 0
    lives_gained = 0
    penalty = 0

    day = start
    while day <= today - timedelta(days=1):
        relevant = [h for h in habits if h.created_at.date() <= day]
        if relevant:
            day_broken = [h.name for h in relevant
                          if day not in day_sets[h.id] and (day - timedelta(days=1)) in day_sets[h.id]]
            if day_broken:
                broken.extend(day_broken)
                if user.lives > 0:
                    user.lives -= 1
                    lives_lost += 1
                else:
                    penalty += STREAK_BREAK_XP_PENALTY
            elif all(day in day_sets[h.id] for h in relevant):
                if user.lives < MAX_LIVES:
                    user.lives += 1
                    lives_gained += 1
        day += timedelta(days=1)

    if penalty:
        await award_xp(db, user, -penalty, "streak_penalty", None)

    user.last_streak_eval = today
    await db.commit()
    return StreakEvalResponse(
        lives=user.lives, life_lost=lives_lost > 0, lives_gained=lives_gained,
        broken_habits=list(dict.fromkeys(broken)), xp_penalty=penalty, new_xp=user.xp,
    )
