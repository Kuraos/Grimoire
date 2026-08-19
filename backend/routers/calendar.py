from datetime import datetime, timedelta
from tz import to_naive
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CalendarEvent
from schemas import EventCreate, EventUpdate, EventOut, IcsImportRequest, IcsImportResult
import ics

router = APIRouter(prefix="/calendar", tags=["calendar"])

_STEP = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1)}


def _occurrences(ev: CalendarEvent, start: datetime, end: datetime) -> list[EventOut]:
    """Expand a recurring master into the occurrences that fall in [start, end]."""
    step = _STEP.get(ev.recurrence)
    if step is None:
        base = EventOut.model_validate(ev)
        return [base] if (start <= ev.start_dt <= end) else []
    duration = (ev.end_dt - ev.start_dt) if ev.end_dt else None
    out: list[EventOut] = []
    cur = ev.start_dt
    limit = end
    if ev.recurrence_until:
        until = datetime.combine(ev.recurrence_until, datetime.max.time())
        limit = min(limit, until)
    while cur <= limit:
        if cur >= start:
            o = EventOut.model_validate(ev)
            o.start_dt = cur
            o.end_dt = (cur + duration) if duration else None
            o.is_occurrence = cur != ev.start_dt
            out.append(o)
        cur += step
    return out


@router.get("/events", response_model=list[EventOut])
async def list_events(
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    # el cliente puede mandar ISO en UTC (…Z); todo en la BD es naive
    start, end = to_naive(start), to_naive(end)
    if start is None or end is None:
        rows = (await db.execute(select(CalendarEvent).order_by(CalendarEvent.start_dt))).scalars().all()
        return rows
    # masters that could have an occurrence in the window: started on/before `end`
    rows = (await db.execute(
        select(CalendarEvent).where(CalendarEvent.start_dt <= end).order_by(CalendarEvent.start_dt)
    )).scalars().all()
    out: list[EventOut] = []
    for ev in rows:
        out.extend(_occurrences(ev, start, end))
    out.sort(key=lambda e: e.start_dt)
    return out


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    """El evento tal cual está guardado, sin expandir.

    La lista devuelve ocurrencias: todas llevan el id del maestro pero la fecha
    de su repetición. Editar una desde la lista guardaba esa fecha en el maestro
    y desplazaba la serie entera —la clase de los martes pasaba a ser de los
    jueves—, así que el formulario pide aquí la fila real antes de abrirse.
    """
    e = await db.get(CalendarEvent, event_id)
    if not e:
        raise HTTPException(404, "Evento no encontrado")
    return e


@router.post("/import-ics", response_model=IcsImportResult)
async def import_ics(payload: IcsImportRequest, db: AsyncSession = Depends(get_db)):
    """Import VEVENTs from an .ics file. Idempotent: re-importing the same file
    updates the existing rows (matched on ics_uid) instead of duplicating."""
    try:
        raw_events = ics.parse_events(payload.content)
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo .ics: {e}")
    if not raw_events:
        raise HTTPException(400, "El archivo no contiene eventos (VEVENT).")

    created = updated = 0
    titles: list[str] = []
    warnings: list[str] = []

    for raw in raw_events:
        occurrences, warn = ics.expand(raw)
        if warn:
            warnings.append(warn)
        for occ in occurrences:
            notes_parts = [p for p in (occ.get("location"), occ.get("description")) if p]
            notes = "\n".join(notes_parts) or None

            existing = None
            if occ.get("ics_uid"):
                existing = (await db.execute(
                    select(CalendarEvent).where(CalendarEvent.ics_uid == occ["ics_uid"])
                )).scalar_one_or_none()

            if existing:
                existing.title = occ["title"]
                existing.start_dt = occ["start_dt"]
                existing.end_dt = occ["end_dt"]
                existing.notes = notes
                existing.recurrence = occ["recurrence"]
                existing.recurrence_until = occ["recurrence_until"]
                existing.color = payload.color
                existing.category = payload.category
                updated += 1
            else:
                db.add(CalendarEvent(
                    title=occ["title"],
                    start_dt=occ["start_dt"],
                    end_dt=occ["end_dt"],
                    notes=notes,
                    recurrence=occ["recurrence"],
                    recurrence_until=occ["recurrence_until"],
                    color=payload.color,
                    category=payload.category,
                    ics_uid=occ.get("ics_uid"),
                ))
                created += 1
            if occ["title"] not in titles:
                titles.append(occ["title"])

    await db.commit()
    return IcsImportResult(
        created=created, updated=updated, events_in_file=len(raw_events),
        titles=titles, warnings=warnings,
    )


def _naive_dts(data: dict) -> dict:
    """Nunca dejar entrar un datetime con zona a columnas naive."""
    for k in ("start_dt", "end_dt"):
        if k in data:
            data[k] = to_naive(data[k])
    return data


@router.post("/events", response_model=EventOut, status_code=201)
async def create_event(payload: EventCreate, db: AsyncSession = Depends(get_db)):
    e = CalendarEvent(**_naive_dts(payload.model_dump()))
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: int, payload: EventUpdate, db: AsyncSession = Depends(get_db)):
    e = await db.get(CalendarEvent, event_id)
    if not e:
        raise HTTPException(404, "Evento no encontrado")
    for k, v in _naive_dts(payload.model_dump(exclude_unset=True)).items():
        setattr(e, k, v)
    await db.commit()
    await db.refresh(e)
    return e


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: int, db: AsyncSession = Depends(get_db)):
    e = await db.get(CalendarEvent, event_id)
    if not e:
        raise HTTPException(404, "Evento no encontrado")
    await db.delete(e)
    await db.commit()
