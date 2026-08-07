from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Project, Task, PomodoroSession
from schemas import ProjectCreate, ProjectUpdate, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


async def _enrich(db: AsyncSession, p: Project) -> ProjectOut:
    out = ProjectOut.model_validate(p)
    out.tasks_total = (await db.execute(
        select(func.count(Task.id)).where(Task.project_id == p.id)
    )).scalar_one()
    out.tasks_pending = (await db.execute(
        select(func.count(Task.id)).where(Task.project_id == p.id, Task.completed == False)
    )).scalar_one()
    minutes = (await db.execute(
        select(func.coalesce(func.sum(PomodoroSession.work_minutes), 0)).where(
            PomodoroSession.project_id == p.id, PomodoroSession.completed == True
        )
    )).scalar_one()
    out.pomodoro_hours = round(minutes / 60, 1)
    return out


@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    projects = (await db.execute(select(Project).order_by(Project.created_at.desc()))).scalars().all()
    return [await _enrich(db, p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    p = Project(**payload.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return await _enrich(db, p)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return await _enrich(db, p)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    await db.delete(p)
    await db.commit()
