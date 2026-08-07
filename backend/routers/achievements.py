from sqlalchemy import select, func
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    Achievement, HabitLog, PomodoroSession, DiaryEntry, WeeklyReview, User,
)
from schemas import AchievementOut
from services import get_user

router = APIRouter(prefix="/achievements", tags=["achievements"])


# how to compute a 0..1 progress hint for locked achievements
async def _progress(db: AsyncSession, key: str, user: User) -> float:
    try:
        if key == "ascension":
            return min(1.0, user.level / 5)
        if key == "contemplator":
            return min(1.0, user.level / 10)
        if key == "focus_centurion":
            n = (await db.execute(select(func.count(PomodoroSession.id)).where(PomodoroSession.completed == True))).scalar_one()
            return min(1.0, n / 100)
        if key == "archivist":
            n = (await db.execute(
                select(func.count(DiaryEntry.id)).where(DiaryEntry.content != "")
            )).scalar_one()
            return min(1.0, n / 30)
        if key == "great_review":
            n = (await db.execute(select(func.count(WeeklyReview.id)))).scalar_one()
            return min(1.0, n / 4)
        if key == "first_blood":
            n = (await db.execute(select(func.count(HabitLog.id)))).scalar_one()
            return min(1.0, n / 1)
    except Exception:
        return 0.0
    return 0.0


@router.get("", response_model=list[AchievementOut])
async def list_achievements(db: AsyncSession = Depends(get_db)):
    user = await get_user(db)
    rows = (await db.execute(select(Achievement).order_by(Achievement.id))).scalars().all()
    out = []
    for a in rows:
        o = AchievementOut.model_validate(a)
        o.progress = 1.0 if a.unlocked else await _progress(db, a.key, user)
        out.append(o)
    return out
