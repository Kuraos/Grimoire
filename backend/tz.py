"""Explicit timezone handling.

By default Grimoire uses the machine's local timezone (correct for a personal
desktop app). Set GRIMOIRE_TZ (e.g. "America/Santiago") to pin a specific zone —
useful if you travel or run the backend on a server in another region.

Returns naive `date`/`datetime` so values stay comparable with the naive
timestamps SQLite stores.
"""
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

_TZ_NAME = os.environ.get("GRIMOIRE_TZ")
_ZONE = ZoneInfo(_TZ_NAME) if _TZ_NAME else None


def now() -> datetime:
    if _ZONE is None:
        return datetime.now()
    return datetime.now(_ZONE).replace(tzinfo=None)


def to_naive(dt: datetime | None) -> datetime | None:
    """Coerce a possibly timezone-aware datetime to naive local wall clock.

    Clients may send UTC ISO strings (JS `toISOString()` ends in `Z`), but every
    timestamp in the DB is naive. Comparing the two raises
    `TypeError: can't compare offset-naive and offset-aware datetimes`.
    """
    if dt is None or dt.tzinfo is None:
        return dt
    local = dt.astimezone(_ZONE) if _ZONE is not None else dt.astimezone()
    return local.replace(tzinfo=None)


def today() -> date:
    return now().date()
