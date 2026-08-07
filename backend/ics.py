"""Minimal RFC 5545 (iCalendar) reader for the VEVENT subset Grimoire needs.

Deliberately dependency-free: the spec for this project avoids adding libraries
when stdlib suffices.

Timezone policy: times are imported as WALL CLOCK, exactly as written in the
file. A class at 17:00 in a Bogotá-issued schedule stays 17:00 in Grimoire.
Converting to the local zone would silently shift a timetable the user reads
literally, which is worse than ignoring the offset.
"""
import html
import re
from datetime import datetime, date, timedelta

# RRULE BYDAY tokens -> Python weekday() (Mon=0)
_BYDAY = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def unfold(text: str) -> list[str]:
    """RFC 5545 §3.1: a line break followed by a space/tab is a continuation."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for raw in text.split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return [l for l in lines if l.strip()]


def unescape(value: str) -> str:
    """RFC 5545 §3.3.11 TEXT escaping, then HTML entities.

    Exports in the wild (e.g. Ellucian) double-encode: `&Oacute\\;` needs the
    iCalendar unescape first, then the HTML entity decode.
    """
    out = []
    i = 0
    while i < len(value):
        c = value[i]
        if c == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            out.append({"n": "\n", "N": "\n"}.get(nxt, nxt))
            i += 2
        else:
            out.append(c)
            i += 1
    return html.unescape("".join(out))


def _split_prop(line: str) -> tuple[str, dict[str, str], str]:
    """`DTSTART;TZID=America/Bogota:20260805T170000` -> (name, params, value)."""
    in_quotes = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == ":" and not in_quotes:
            head, value = line[:i], line[i + 1:]
            break
    else:
        return line.upper(), {}, ""
    parts = head.split(";")
    name = parts[0].upper()
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v.strip('"')
    return name, params, value


def parse_dt(value: str) -> datetime | None:
    """Accepts 20260805T170000, ...Z, or a date-only 20260805."""
    v = value.strip().rstrip("Z")
    for fmt in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M", "%Y%m%d"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def parse_rrule(value: str) -> dict:
    rule = {}
    for part in value.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            rule[k.upper()] = v
    return rule


def parse_events(text: str) -> list[dict]:
    """Return the raw VEVENT blocks as dicts (no expansion yet)."""
    events: list[dict] = []
    current: dict | None = None
    depth_other = 0  # ignore nested components such as VTIMEZONE/VALARM

    for line in unfold(text):
        name, params, value = _split_prop(line)
        if name == "BEGIN":
            comp = value.strip().upper()
            if comp == "VEVENT":
                current = {}
            elif current is None:
                depth_other += 1
            continue
        if name == "END":
            comp = value.strip().upper()
            if comp == "VEVENT" and current is not None:
                events.append(current)
                current = None
            elif depth_other:
                depth_other -= 1
            continue
        if current is None:
            continue

        if name == "DTSTART":
            current["dtstart"] = parse_dt(value)
            current["tzid"] = params.get("TZID")
            current["all_day"] = params.get("VALUE", "").upper() == "DATE" or len(value.strip()) == 8
        elif name == "DTEND":
            current["dtend"] = parse_dt(value)
        elif name == "SUMMARY":
            current["summary"] = unescape(value).strip()
        elif name == "LOCATION":
            current["location"] = unescape(value).strip()
        elif name == "DESCRIPTION":
            current["description"] = unescape(value).strip()
        elif name == "RRULE":
            current["rrule"] = parse_rrule(value)
        elif name == "UID":
            current["uid"] = value.strip()
    return events


def _first_on_weekday(anchor: datetime, weekday: int) -> datetime:
    """First datetime on `weekday` at or after `anchor`, keeping time of day."""
    delta = (weekday - anchor.weekday()) % 7
    return anchor + timedelta(days=delta)


def expand(ev: dict) -> tuple[list[dict], str | None]:
    """Map one VEVENT onto Grimoire's recurrence model.

    Grimoire stores recurrence as none|daily|weekly anchored to start_dt, so a
    weekly rule with several BYDAY values becomes one event per weekday.
    Returns (occurrences, warning).
    """
    start: datetime | None = ev.get("dtstart")
    if start is None or not ev.get("summary"):
        return [], None

    end: datetime | None = ev.get("dtend")
    duration = (end - start) if (end and end > start) else None
    rrule = ev.get("rrule") or {}
    freq = (rrule.get("FREQ") or "").upper()
    uid = ev.get("uid") or ""
    warning = None

    until_dt = parse_dt(rrule["UNTIL"]) if rrule.get("UNTIL") else None
    until: date | None = until_dt.date() if until_dt else None

    def make(anchor: datetime, recurrence: str, suffix: str = "") -> dict:
        return {
            "title": ev["summary"],
            "start_dt": anchor,
            "end_dt": (anchor + duration) if duration else None,
            "location": ev.get("location"),
            "description": ev.get("description"),
            "recurrence": recurrence,
            "recurrence_until": until if recurrence != "none" else None,
            "ics_uid": f"{uid}#{suffix}" if suffix else uid,
        }

    if not freq:
        return [make(start, "none")], None

    interval = rrule.get("INTERVAL")
    if interval and interval != "1":
        warning = f"«{ev['summary']}»: INTERVAL={interval} no soportado, se importó como cada período."

    if freq == "WEEKLY":
        days = [d[-2:].upper() for d in rrule.get("BYDAY", "").split(",") if d.strip()]
        weekdays = [_BYDAY[d] for d in days if d in _BYDAY]
        if not weekdays:
            return [make(start, "weekly")], warning
        out = []
        for d in sorted(set(weekdays)):
            anchor = _first_on_weekday(start, d)
            if until and anchor.date() > until:
                continue
            out.append(make(anchor, "weekly", suffix=days[weekdays.index(d)] if d in weekdays else str(d)))
        # keep suffixes stable and unique
        for o, d in zip(out, sorted(set(weekdays))):
            o["ics_uid"] = f"{uid}#{d}"
        return out, warning

    if freq == "DAILY":
        return [make(start, "daily")], warning

    return [make(start, "none")], (
        f"«{ev['summary']}»: FREQ={freq} no soportado, se importó como evento único."
    )
