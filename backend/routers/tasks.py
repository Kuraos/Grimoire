from datetime import datetime
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Task, XPLog, ChecklistItem
from schemas import (
    TaskCreate, TaskUpdate, TaskOut, XPEventResponse, AchievementOut,
    ChecklistItemCreate, ChecklistItemUpdate, ChecklistItemOut,
)
from services import get_user, award_xp, remove_xp, like_escape
from achievements import check_achievements

router = APIRouter(prefix="/tasks", tags=["tasks"])

_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


async def _serialize(db: AsyncSession, t: Task) -> TaskOut:
    items = (await db.execute(
        select(ChecklistItem).where(ChecklistItem.task_id == t.id).order_by(ChecklistItem.position)
    )).scalars().all()
    # Build explicitly: model_validate(t) would lazy-load t.checklist and blow up
    # under async SQLAlchemy (MissingGreenlet).
    return TaskOut(
        id=t.id, title=t.title, description=t.description, category=t.category,
        priority=t.priority, project_id=t.project_id, due_date=t.due_date,
        xp_reward=t.xp_reward, completed=t.completed, completed_at=t.completed_at,
        status=t.status, position=t.position, remind_at=t.remind_at, tags=t.tags,
        vault_note_path=t.vault_note_path,
        created_at=t.created_at,
        checklist=[ChecklistItemOut.model_validate(i) for i in items],
        checklist_total=len(items),
        checklist_done=sum(1 for i in items if i.done),
    )


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: int | None = None,
    priority: str | None = None,
    completed: bool | None = None,
    category: str | None = None,
    tag: str | None = None,
    sort: str = "priority",
    db: AsyncSession = Depends(get_db),
):
    q = select(Task)
    if project_id is not None:
        q = q.where(Task.project_id == project_id)
    if priority is not None:
        q = q.where(Task.priority == priority)
    if completed is not None:
        q = q.where(Task.completed == completed)
    if category is not None:
        q = q.where(Task.category == category)
    if tag:
        q = q.where(Task.tags.ilike(f"%{like_escape(tag)}%", escape="\\"))
    tasks = (await db.execute(q)).scalars().all()
    if sort == "due_date":
        tasks = sorted(tasks, key=lambda t: (t.due_date is None, t.due_date or datetime.max.date()))
    else:
        tasks = sorted(tasks, key=lambda t: (_PRIORITY_ORDER.get(t.priority, 1),
                                             t.due_date is None, t.due_date or datetime.max.date()))
    return [await _serialize(db, t) for t in tasks]


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_db)):
    t = Task(**payload.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return await _serialize(db, t)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, payload: TaskUpdate, db: AsyncSession = Depends(get_db)):
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Tarea no encontrada")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    # keep completed/status coherent when one changes
    if "status" in data:
        if data["status"] == "done" and not t.completed:
            t.completed = True
            t.completed_at = _now()
        elif data["status"] != "done" and t.completed:
            t.completed = False
            t.completed_at = None
    await db.commit()
    await db.refresh(t)
    return await _serialize(db, t)


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Tarea no encontrada")
    await db.delete(t)
    await db.commit()


@router.post("/{task_id}/complete", response_model=XPEventResponse)
async def complete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Tarea no encontrada")
    if t.completed:
        raise HTTPException(400, "La tarea ya está completada")
    t.completed = True
    t.completed_at = _now()
    t.status = "done"

    user = await get_user(db)
    result = await award_xp(db, user, t.xp_reward, "task", t.id)
    ach = await check_achievements(db, user, "task_complete", task_id=t.id)

    await db.commit()
    return XPEventResponse(
        **result,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )


@router.post("/{task_id}/uncomplete", response_model=XPEventResponse)
async def uncomplete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Reopen a task and reverse the XP it granted."""
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Tarea no encontrada")
    if not t.completed:
        raise HTTPException(400, "La tarea no está completada")
    granted = (await db.execute(
        select(func.coalesce(func.sum(XPLog.amount), 0)).where(
            XPLog.source == "task", XPLog.source_id == task_id, XPLog.amount > 0
        )
    )).scalar_one()
    t.completed = False
    t.completed_at = None
    t.status = "todo"
    user = await get_user(db)
    result = await remove_xp(db, user, granted, "task", task_id)
    await db.commit()
    return XPEventResponse(**result)


# ---------------- Checklist (subtasks) ----------------

@router.get("/{task_id}/checklist", response_model=list[ChecklistItemOut])
async def list_checklist(task_id: int, db: AsyncSession = Depends(get_db)):
    return (await db.execute(
        select(ChecklistItem).where(ChecklistItem.task_id == task_id).order_by(ChecklistItem.position)
    )).scalars().all()


@router.post("/{task_id}/checklist", response_model=ChecklistItemOut, status_code=201)
async def add_checklist_item(task_id: int, payload: ChecklistItemCreate, db: AsyncSession = Depends(get_db)):
    if not await db.get(Task, task_id):
        raise HTTPException(404, "Tarea no encontrada")
    maxpos = (await db.execute(
        select(func.coalesce(func.max(ChecklistItem.position), -1)).where(ChecklistItem.task_id == task_id)
    )).scalar_one()
    item = ChecklistItem(task_id=task_id, text=payload.text, position=maxpos + 1)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/checklist/{item_id}", response_model=ChecklistItemOut)
async def update_checklist_item(item_id: int, payload: ChecklistItemUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404, "Ítem no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/checklist/{item_id}", status_code=204)
async def delete_checklist_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404, "Ítem no encontrado")
    await db.delete(item)
    await db.commit()
