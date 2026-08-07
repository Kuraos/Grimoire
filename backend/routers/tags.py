from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Habit, Task, DiaryEntry

router = APIRouter(prefix="/tags", tags=["tags"])


def _split(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


@router.get("", response_model=list[str])
async def list_tags(db: AsyncSession = Depends(get_db)):
    """Distinct tags used across habits, tasks and diary entries."""
    tags: set[str] = set()
    for model in (Habit, Task, DiaryEntry):
        rows = (await db.execute(select(model.tags).where(model.tags.is_not(None)))).scalars().all()
        for raw in rows:
            tags.update(_split(raw))
    return sorted(tags, key=str.lower)
