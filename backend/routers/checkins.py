from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import DailyCheckin
from schemas import CheckinCreate, CheckinOut, XPEventResponse, AchievementOut
from services import get_user, award_xp
from constants import BASE_XP
from achievements import check_achievements

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.get("/{checkin_date}", response_model=CheckinOut | None)
async def get_checkin(checkin_date: date, db: AsyncSession = Depends(get_db)):
    return (await db.execute(
        select(DailyCheckin).where(DailyCheckin.checkin_date == checkin_date)
    )).scalar_one_or_none()


@router.post("/{checkin_date}", response_model=XPEventResponse)
async def save_checkin(checkin_date: date, payload: CheckinCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(DailyCheckin).where(DailyCheckin.checkin_date == checkin_date)
    )).scalar_one_or_none()

    if existing:
        existing.energy = payload.energy
        existing.mood = payload.mood
        existing.note = payload.note
        await db.commit()
        return XPEventResponse(new_xp=(await get_user(db)).xp)

    db.add(DailyCheckin(checkin_date=checkin_date, **payload.model_dump()))
    await db.flush()
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["daily_checkin"], "checkin", None)
    ach = await check_achievements(db, user, "daily_checkin")
    await db.commit()
    return XPEventResponse(
        **result,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )
