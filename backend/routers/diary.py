import os
import re
from datetime import datetime, date
from tz import now as _now, today as _today
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import DiaryEntry, HabitLog, Habit, PomodoroSession, Task, XPLog, DailyCheckin
from schemas import (
    DiaryOut, DiaryUpdate, DiarySearchResult, DiaryVolumePoint, CheckinOut, PomodoroOut,
)
from services import get_user, award_xp, like_escape
from constants import BASE_XP
from achievements import check_achievements

router = APIRouter(prefix="/diary", tags=["diary"])


@router.get("/search", response_model=list[DiarySearchResult])
async def search_diary(q: str = Query(""), db: AsyncSession = Depends(get_db)):
    # only entries with content are searchable; wildcards are escaped so a query
    # like "%" matches literally instead of returning everything
    query = select(DiaryEntry).where(DiaryEntry.content != "").order_by(DiaryEntry.entry_date.desc())
    if q:
        query = query.where(DiaryEntry.content.ilike(f"%{like_escape(q)}%", escape="\\"))
    rows = (await db.execute(query)).scalars().all()
    return rows


@router.get("/dates", response_model=list[date])
async def entry_dates(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(DiaryEntry.entry_date).where(DiaryEntry.content != "")
    )).scalars().all()
    return rows


@router.get("/volume", response_model=list[DiaryVolumePoint])
async def entry_volume(db: AsyncSession = Depends(get_db)):
    """Fecha y longitud de cada entrada escrita, para «el volumen».

    Va aparte de `/dates` y no como un campo más: `/dates` alimenta las marcas
    del minicalendario, que sólo necesitan saber si el día tiene entrada, y
    cambiarle la forma habría obligado a tocar sus dos consumidores para nada.

    Devuelve la longitud, no el texto: el volumen sólo gradúa el brillo de una
    estrella, y mandar el diario entero al frontend para contar caracteres es
    caro y —tratándose de un diario— innecesariamente indiscreto.
    """
    rows = (await db.execute(
        select(DiaryEntry.entry_date, func.length(DiaryEntry.content))
        .where(DiaryEntry.content != "")
        .order_by(DiaryEntry.entry_date)
    )).all()
    return [DiaryVolumePoint(entry_date=d, length=n) for d, n in rows]


@router.get("/{entry_date}", response_model=DiaryOut)
async def get_entry(entry_date: date, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(DiaryEntry).where(DiaryEntry.entry_date == entry_date)
    )).scalar_one_or_none()
    if entry is None:
        # read-only: browsing dates must not persist empty rows (they polluted the
        # DB and inflated the "Archivista" achievement). The row is created on save.
        return DiaryOut(id=None, entry_date=entry_date, content="", tags=None, updated_at=_now())
    return entry


@router.put("/{entry_date}", response_model=DiaryOut)
@router.patch("/{entry_date}", response_model=DiaryOut)
async def save_entry(entry_date: date, payload: DiaryUpdate, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(DiaryEntry).where(DiaryEntry.entry_date == entry_date)
    )).scalar_one_or_none()
    if entry is None:
        entry = DiaryEntry(entry_date=entry_date)
        db.add(entry)
    entry.content = payload.content
    if payload.tags is not None:
        entry.tags = payload.tags
    entry.updated_at = _now()
    await db.flush()  # need entry.id to check whether it was already rewarded

    # award XP at most ONCE per entry: previously, clearing and rewriting an entry
    # granted the XP again. xp_log is the source of truth.
    if payload.content.strip():
        already = (await db.execute(
            select(func.count(XPLog.id)).where(
                XPLog.source == "diary", XPLog.source_id == entry.id
            )
        )).scalar_one()
        if not already:
            user = await get_user(db)
            await award_xp(db, user, BASE_XP["diary_entry"], "diary", entry.id)
            await check_achievements(db, user, "diary_entry")

    await db.commit()
    await db.refresh(entry)
    return entry


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DIARY_SUBDIR = "06-Diario"


@router.post("/{entry_date}/export-obsidian")
async def export_obsidian(entry_date: date, db: AsyncSession = Depends(get_db)):
    """One-way export (Grimoire → vault). Overwrites the target file idempotently.
    Frontmatter must match _Templates/Diario.md so exported and manual notes share
    the same schema."""
    user = await get_user(db)
    vault = (user.obsidian_vault_path or "").strip()
    if not vault:
        raise HTTPException(400, "Configura la ruta del vault de Obsidian antes de exportar.")

    entry = (await db.execute(
        select(DiaryEntry).where(DiaryEntry.entry_date == entry_date)
    )).scalar_one_or_none()
    if entry is None:
        raise HTTPException(404, "No existe una entrada de diario para esa fecha.")

    # entry_date is already a validated `date`; re-check the ISO string as
    # defense-in-depth before building a filesystem path (anti path-traversal).
    iso = entry_date.isoformat()
    if not _DATE_RE.match(iso):
        raise HTTPException(400, "Fecha inválida.")

    if not os.path.isdir(vault):
        raise HTTPException(400, f"La ruta del vault no existe: {vault}")

    checkin = (await db.execute(
        select(DailyCheckin).where(DailyCheckin.checkin_date == entry_date)
    )).scalar_one_or_none()
    mood = checkin.mood if checkin else ""
    energia = checkin.energy if checkin else ""

    # "hora" derived from the entry timestamp via tz (updated_at is stored local);
    # diary_entries has no dedicated creation time.
    hora = (entry.updated_at or _now()).strftime("%H:%M")
    tags = [t.strip() for t in (entry.tags or "").split(",") if t.strip()]
    tags_yaml = "[" + ", ".join(tags) + "]"

    frontmatter = (
        "---\n"
        "type: diario\n"
        f"date: {iso}\n"
        f"hora: {hora}\n"
        f"mood: {mood}\n"
        f"energia: {energia}\n"
        f"tags: {tags_yaml}\n"
        f"grimoire_entry_id: {entry.id}\n"
        "---\n"
    )
    body = frontmatter + "\n" + (entry.content or "")

    subdir = os.path.join(vault, _DIARY_SUBDIR)
    dest = os.path.join(subdir, f"{iso}.md")
    try:
        os.makedirs(subdir, exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(body)
    except OSError as e:
        raise HTTPException(500, f"No se pudo escribir en el vault: {e.strerror or e}")

    return {"exported": True, "path": dest}


@router.get("/{entry_date}/summary")
async def day_summary(entry_date: date, db: AsyncSession = Depends(get_db)):
    iso = entry_date.isoformat()

    habit_rows = (await db.execute(
        select(Habit.name, Habit.color, Habit.category)
        .join(HabitLog, HabitLog.habit_id == Habit.id)
        .where(func.date(HabitLog.completed_at) == iso)
    )).all()
    habits_done = [{"name": r[0], "color": r[1], "category": r[2]} for r in habit_rows]

    pomo_rows = (await db.execute(
        select(PomodoroSession).where(
            PomodoroSession.completed == True,
            func.date(PomodoroSession.finished_at) == iso,
        )
    )).scalars().all()
    pomodoro = []
    pomo_minutes = 0
    for s in pomo_rows:
        pomo_minutes += s.work_minutes
        title = None
        if s.task_id:
            task = await db.get(Task, s.task_id)
            title = task.title if task else None
        pomodoro.append({"work_minutes": s.work_minutes, "task_title": title,
                         "finished_at": s.finished_at.isoformat() if s.finished_at else None})

    xp_earned = (await db.execute(
        select(func.coalesce(func.sum(XPLog.amount), 0)).where(func.date(XPLog.earned_at) == iso)
    )).scalar_one()

    checkin = (await db.execute(
        select(DailyCheckin).where(DailyCheckin.checkin_date == entry_date)
    )).scalar_one_or_none()

    return {
        "habits_done": habits_done,
        "pomodoro_sessions": pomodoro,
        "pomodoro_minutes": pomo_minutes,
        "xp_earned": xp_earned,
        "checkin": CheckinOut.model_validate(checkin).model_dump() if checkin else None,
    }
