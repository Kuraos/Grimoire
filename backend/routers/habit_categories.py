from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import HabitCategory, Habit
from schemas import HabitCategoryCreate, HabitCategoryOut

router = APIRouter(prefix="/habit-categories", tags=["habit-categories"])


async def _usage(db: AsyncSession, name: str) -> int:
    """How many habits (active or archived) still use this category name."""
    return (await db.execute(
        select(func.count(Habit.id)).where(Habit.category == name)
    )).scalar_one()


@router.get("", response_model=list[HabitCategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(HabitCategory).order_by(HabitCategory.name))).scalars().all()
    out = []
    for c in rows:
        o = HabitCategoryOut.model_validate(c)
        o.habit_count = await _usage(db, c.name)
        out.append(o)
    return out


@router.post("", response_model=HabitCategoryOut, status_code=201)
async def create_category(payload: HabitCategoryCreate, db: AsyncSession = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "El nombre de la categoría no puede estar vacío.")
    existing = (await db.execute(
        select(HabitCategory).where(func.lower(HabitCategory.name) == name.lower())
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"Ya existe una categoría llamada «{existing.name}».")
    cat = HabitCategory(name=name, color=payload.color or "#9b7fc4")
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    out = HabitCategoryOut.model_validate(cat)
    out.habit_count = 0
    return out


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    cat = await db.get(HabitCategory, category_id)
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    used = await _usage(db, cat.name)
    if used:
        # never silently reassign habits — make the user move them first
        raise HTTPException(
            400,
            f"«{cat.name}» está en uso por {used} hábito(s). Cambia su categoría antes de eliminarla.",
        )
    await db.delete(cat)
    await db.commit()
