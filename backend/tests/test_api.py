"""Smoke tests for the Grimoire API. Uses a throwaway DB via GRIMOIRE_DB."""
import os
import re
import tempfile
import pathlib
from datetime import datetime

# point the app at a temp DB *before* importing it
_TMP = pathlib.Path(tempfile.mkdtemp()) / "grimoire_test.db"
os.environ["GRIMOIRE_DB"] = str(_TMP)

import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
from constants import MAX_MINOR, MONEY_DECIMALS, money_decimals  # noqa: E402


def test_full_flow():
    with TestClient(main.app) as c:
        # default user seeded with lives
        user = c.get("/user").json()
        assert user["lives"] == 3
        assert user["level"] == 1
        assert user["xp"] == 0

        # quests seeded for the period
        quests = c.get("/quests").json()
        assert any(q["scope"] == "daily" for q in quests)
        assert any(q["scope"] == "weekly" for q in quests)

        # achievements include tiers and the expanded set
        ach = c.get("/achievements").json()
        assert len(ach) >= 18
        assert {a["tier"] for a in ach} >= {"common", "rare", "epic", "legendary"}

        # create + complete a habit grants XP and unlocks "first_blood"
        h = c.post("/habits", json={"name": "Test", "category": "Otro", "xp_reward": 20}).json()
        res = c.post(f"/habits/{h['id']}/complete").json()
        assert res["xp_earned"] == 20
        assert res["new_xp"] == 20
        assert res["streak"] == 1

        first_blood = next(a for a in c.get("/achievements").json() if a["key"] == "first_blood")
        assert first_blood["unlocked"] is True

        # undo reverses the XP
        c.request("DELETE", f"/habits/{h['id']}/complete")
        assert c.get("/user").json()["xp"] == 0


def test_habit_xp_series_is_real_cumulative():
    with TestClient(main.app) as c:
        h = c.post("/habits", json={"name": "XP", "category": "Otro", "xp_reward": 30}).json()
        c.post(f"/habits/{h['id']}/complete")
        series = c.get(f"/habits/{h['id']}/xp-series").json()
        assert series and series[-1]["xp"] == 30
        # undo nets it back to 0 in the cumulative series
        c.request("DELETE", f"/habits/{h['id']}/complete")
        series = c.get(f"/habits/{h['id']}/xp-series").json()
        assert series[-1]["xp"] == 0


def test_evaluate_streaks_idempotent_per_day():
    with TestClient(main.app) as c:
        first = c.post("/user/evaluate-streaks").json()
        lives = first["lives"]
        # second call the same day is a no-op
        second = c.post("/user/evaluate-streaks").json()
        assert second["lives"] == lives
        assert second["life_lost"] is False and second["lives_gained"] == 0


def test_task_checklist_and_kanban():
    with TestClient(main.app) as c:
        t = c.post("/tasks", json={"title": "T", "xp_reward": 15, "tags": "a,b"}).json()
        assert t["status"] == "todo"
        item = c.post(f"/tasks/{t['id']}/checklist", json={"text": "step"}).json()
        c.patch(f"/tasks/checklist/{item['id']}", json={"done": True})
        got = c.get("/tasks").json()[0]
        assert got["checklist_total"] == 1 and got["checklist_done"] == 1
        # moving to done marks completed
        moved = c.patch(f"/tasks/{t['id']}", json={"status": "done"}).json()
        assert moved["completed"] is True
        # tags endpoint aggregates
        assert set(c.get("/tags").json()) >= {"a", "b"}


def test_task_and_project_vault_note_path():
    with TestClient(main.app) as c:
        t = c.post("/tasks", json={"title": "VaultTask", "vault_note_path": "Proyectos/estelar.md"}).json()
        assert t["vault_note_path"] == "Proyectos/estelar.md"
        p = c.post("/projects", json={"name": "P", "vault_note_path": "Proyectos/p.md"}).json()
        assert p["vault_note_path"] == "Proyectos/p.md"
        # editable via PATCH, clearable
        up = c.patch(f"/tasks/{t['id']}", json={"vault_note_path": None}).json()
        assert up["vault_note_path"] is None


SAMPLE_ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Bogota
BEGIN:STANDARD
TZNAME:-05
DTSTART:19141123T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/Bogota:20260805T170000
DTEND;TZID=America/Bogota:20260805T182000
SUMMARY:COLOMBIA: ESPACIO\\, TIEMPO\\, DIFERENCIA CBCC 1177 11
RRULE:FREQ=WEEKLY;UNTIL=20260926T225900;BYDAY=WE,FR
UID:evt-1
LOCATION:Campus: CAMPUS PRINCIPAL
DESCRIPTION:NRC: 33707\\nNivel: PREGRADO
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/Bogota:20260805T093000
DTEND;TZID=America/Bogota:20260805T105000
SUMMARY:ASTROF&Iacute\\;SICA EXTRAGAL&Aacute\\;CTICA FISI 2940 1
RRULE:FREQ=WEEKLY;UNTIL=20261128T225900;BYDAY=WE,FR
UID:evt-2
END:VEVENT
END:VCALENDAR
"""


def test_ics_import_expands_byday_and_decodes_entities():
    with TestClient(main.app) as c:
        r = c.post("/calendar/import-ics", json={"content": SAMPLE_ICS})
        assert r.status_code == 200
        data = r.json()
        assert data["events_in_file"] == 2
        # BYDAY=WE,FR -> Grimoire's model needs one weekly event per weekday
        assert data["created"] == 4
        # HTML entities from the export are decoded
        assert any("ASTROFÍSICA EXTRAGALÁCTICA" in t for t in data["titles"])
        # escaped commas survive
        assert any("ESPACIO, TIEMPO, DIFERENCIA" in t for t in data["titles"])

        evs = c.get("/calendar/events").json()
        mine = [e for e in evs if "ASTROF" in e["title"]]
        assert len(mine) == 2
        weekdays = sorted(datetime.fromisoformat(e["start_dt"]).weekday() for e in mine)
        assert weekdays == [2, 4]  # miércoles y viernes
        for e in mine:
            assert e["recurrence"] == "weekly"
            assert e["recurrence_until"] == "2026-11-28"
        # wall-clock time preserved, no timezone shifting
        assert datetime.fromisoformat(mine[0]["start_dt"]).strftime("%H:%M") == "09:30"


def test_backup_snapshot_export_and_restore():
    """El respaldo sólo vale si se puede restaurar: se prueba el ciclo completo."""
    import backup as svc
    with TestClient(main.app) as c:
        # 1. crear un respaldo del estado actual
        created = c.post("/backup")
        assert created.status_code == 201
        name = created.json()["created"]
        assert name in [b["filename"] for b in c.get("/backup").json()["backups"]]

        # 2. el export JSON es autocontenido y legible
        js = c.get("/backup/export.json")
        assert js.status_code == 200
        payload = js.json()
        assert payload["app"] == "Grimoire"
        assert "users" in payload["data"] and len(payload["data"]["users"]) == 1

        # 3. el .db descargable es una base válida
        db = c.get("/backup/export.db")
        assert db.status_code == 200 and db.content[:15] == b"SQLite format 3"

        # 4. cambiar algo, restaurar, y comprobar que volvió el estado anterior
        c.patch("/user", json={"name": "AntesDelRestore"})
        assert c.get("/user").json()["name"] == "AntesDelRestore"
        snap = c.post("/backup").json()["created"]
        c.patch("/user", json={"name": "DespuesDelRestore"})
        res = c.post(f"/backup/restore/{snap}")
        assert res.status_code == 200 and res.json()["restart_required"] is True
        assert c.get("/user").json()["name"] == "AntesDelRestore"

        # 5. un respaldo inexistente o inválido se rechaza, no rompe
        assert c.post("/backup/restore/no-existe.db").status_code == 400
        bad = svc.BACKUP_DIR / "grimoire-manual-corrupto.db"
        bad.write_bytes(b"esto no es sqlite")
        assert c.post(f"/backup/restore/{bad.name}").status_code == 400
        bad.unlink()


def test_backup_rotation_keeps_only_recent_autos():
    import backup as svc
    svc.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    made = [svc.BACKUP_DIR / f"grimoire-auto-2020010{i}-000000.db" for i in range(1, 8)]
    for p in made:
        p.write_bytes(b"x")
    keep_manual = svc.BACKUP_DIR / "grimoire-manual-20200101-000000.db"
    keep_manual.write_bytes(b"x")
    svc.rotate(keep=3)
    # la rotación mira TODOS los automáticos, no sólo los de esta prueba
    autos = list(svc.BACKUP_DIR.glob("grimoire-auto-*.db"))
    assert len(autos) == 3, "debe conservar sólo los 3 automáticos más recientes"
    # y conserva los más nuevos: los de 2020 más antiguos deben haber caído
    assert not (svc.BACKUP_DIR / "grimoire-auto-20200101-000000.db").exists()
    assert keep_manual.exists(), "los respaldos manuales nunca se rotan"
    for p in autos + [keep_manual]:
        p.unlink()


def test_calendar_accepts_utc_iso_range():
    """El frontend usa toISOString() -> '...Z' (aware). Los eventos se guardan
    naive; compararlos lanzaba TypeError y devolvía 500, pero solo cuando ya
    existían eventos (con la tabla vacía el bucle no llegaba a comparar)."""
    with TestClient(main.app) as c:
        c.post("/calendar/events", json={
            "title": "Clase", "start_dt": "2026-08-05T09:30:00",
            "end_dt": "2026-08-05T10:50:00",
            "recurrence": "weekly", "recurrence_until": "2026-11-28",
        })
        naive = c.get("/calendar/events?start=2026-08-01T00:00:00&end=2026-08-31T23:59:59")
        aware = c.get("/calendar/events?start=2026-08-01T00:00:00.000Z&end=2026-08-31T23:59:59.000Z")
        assert naive.status_code == 200
        assert aware.status_code == 200, aware.text
        assert len(aware.json()) > 0
        # y un datetime con zona tampoco debe entrar a la BD
        made = c.post("/calendar/events", json={
            "title": "ConZona", "start_dt": "2026-08-06T12:00:00+00:00",
        })
        assert made.status_code == 201
        assert c.get("/calendar/events?start=2026-08-01T00:00:00.000Z&end=2026-08-31T23:59:59.000Z").status_code == 200


def test_ics_import_is_idempotent():
    with TestClient(main.app) as c:
        c.post("/calendar/import-ics", json={"content": SAMPLE_ICS})
        before = len(c.get("/calendar/events").json())
        again = c.post("/calendar/import-ics", json={"content": SAMPLE_ICS}).json()
        assert again["created"] == 0 and again["updated"] == 4
        assert len(c.get("/calendar/events").json()) == before


def test_ics_import_rejects_garbage():
    with TestClient(main.app) as c:
        assert c.post("/calendar/import-ics", json={"content": "no soy un ics"}).status_code == 400


# ---------------- regression tests for the bug sweep ----------------

def test_xp_never_goes_negative():
    """Undos/penalties used to drive XP below 0, and xp_to_level() then raised
    ValueError on sqrt() → HTTP 500 (notably on /user/evaluate-streaks at startup)."""
    from constants import xp_to_level
    assert xp_to_level(-480) == 1  # no longer raises

    with TestClient(main.app) as c:
        h = c.post("/habits", json={"name": "ClampMe", "category": "Otro", "xp_reward": 20}).json()
        c.post(f"/habits/{h['id']}/complete")
        before = c.get("/user").json()["xp"]
        # undo repeatedly: XP must floor at 0, never crash
        for _ in range(3):
            c.request("DELETE", f"/habits/{h['id']}/complete")
        after = c.get("/user").json()["xp"]
        assert after >= 0 and after <= before
        assert c.get("/user").status_code == 200


def test_rejects_invalid_enums_and_ranges():
    with TestClient(main.app) as c:
        assert c.post("/habits", json={"name": "", "category": "Otro"}).status_code == 422
        assert c.post("/habits", json={"name": "N", "category": "Otro", "xp_reward": -500}).status_code == 422
        assert c.post("/habits", json={"name": "F", "category": "Otro", "frequency": "cuando sea"}).status_code == 422
        assert c.post("/tasks", json={"title": "P", "priority": "URGENTISIMA"}).status_code == 422
        assert c.post("/tasks", json={"title": "S", "status": "inventado"}).status_code == 422
        assert c.post("/tasks", json={"title": ""}).status_code == 422
        assert c.get("/stats?period=SIGLO").status_code == 422


def test_diary_get_does_not_create_rows():
    """Browsing dates used to persist empty rows (and inflate 'Archivista')."""
    with TestClient(main.app) as c:
        before = len(c.get("/diary/search?q=").json())
        for d in ("1888-01-01", "1888-01-02", "1888-01-03"):
            r = c.get(f"/diary/{d}")
            assert r.status_code == 200 and r.json()["id"] is None
        assert len(c.get("/diary/search?q=").json()) == before


def test_diary_xp_awarded_once_and_search_escapes_wildcards():
    with TestClient(main.app) as c:
        c.put("/diary/2026-04-02", json={"content": "100% concentrado"})
        xp1 = c.get("/user").json()["xp"]
        # clearing and rewriting must NOT grant the XP again
        c.put("/diary/2026-04-02", json={"content": ""})
        c.put("/diary/2026-04-02", json={"content": "otra vez"})
        assert c.get("/user").json()["xp"] == xp1

        # "%" is matched literally, not as a wildcard
        c.put("/diary/2026-04-03", json={"content": "sin simbolos"})
        hits = [e["entry_date"] for e in c.get("/diary/search?q=%25").json()]
        assert "2026-04-03" not in hits


def test_habit_category_is_self_healing():
    """A habit can't reference a category missing from the catalog."""
    with TestClient(main.app) as c:
        c.post("/habits", json={"name": "Nueva", "category": "CategoriaInventada", "xp_reward": 20})
        names = [x["name"] for x in c.get("/habit-categories").json()]
        assert "CategoriaInventada" in names


def test_habit_categories_crud():
    with TestClient(main.app) as c:
        names = [x["name"] for x in c.get("/habit-categories").json()]
        assert {"Físico", "Académico", "Otro"} <= set(names)  # defaults seeded

        # create a custom one
        created = c.post("/habit-categories", json={"name": "Música", "color": "#c47f9b"})
        assert created.status_code == 201
        cat = created.json()
        assert cat["name"] == "Música" and cat["habit_count"] == 0

        # duplicates are rejected (case-insensitive)
        dup = c.post("/habit-categories", json={"name": "música"})
        assert dup.status_code == 400

        # a category in use cannot be deleted
        c.post("/habits", json={"name": "Guitarra", "category": "Música", "xp_reward": 20})
        in_use = c.get("/habit-categories").json()
        assert next(x for x in in_use if x["name"] == "Música")["habit_count"] == 1
        blocked = c.delete(f"/habit-categories/{cat['id']}")
        assert blocked.status_code == 400
        assert "en uso" in blocked.json()["detail"]

        # unused category deletes cleanly
        spare = c.post("/habit-categories", json={"name": "Temporal"}).json()
        assert c.delete(f"/habit-categories/{spare['id']}").status_code == 204
        assert "Temporal" not in [x["name"] for x in c.get("/habit-categories").json()]


def test_diary_export_obsidian_success(tmp_path):
    with TestClient(main.app) as c:
        vault = str(tmp_path)
        c.patch("/user", json={"obsidian_vault_path": vault})
        c.put("/diary/2026-03-15", json={"content": "Hoy fue un buen día.", "tags": "reflexion, foco"})
        r = c.post("/diary/2026-03-15/export-obsidian")
        assert r.status_code == 200
        data = r.json()
        assert data["exported"] is True
        expected = os.path.join(vault, "06-Diario", "2026-03-15.md")
        assert data["path"] == expected
        assert os.path.isfile(expected)
        text = open(expected, encoding="utf-8").read()
        assert "type: diario" in text
        assert "date: 2026-03-15" in text
        assert "tags: [reflexion, foco]" in text
        assert "grimoire_entry_id:" in text
        assert "Hoy fue un buen día." in text
        # idempotent overwrite
        r2 = c.post("/diary/2026-03-15/export-obsidian")
        assert r2.status_code == 200


def test_diary_export_requires_vault_path(tmp_path):
    with TestClient(main.app) as c:
        c.patch("/user", json={"obsidian_vault_path": ""})  # clear config
        r = c.post("/diary/2026-03-16/export-obsidian")
        assert r.status_code == 400
        assert "vault" in r.json()["detail"].lower()


# ---------------- cadencia: días programados y metas semanales ----------------

import sqlite3  # noqa: E402
from datetime import date, timedelta  # noqa: E402
from tz import today as _today  # noqa: E402


def _exec(query: str, *params):
    """Escribir historial directamente: la API sólo sabe marcar «hoy»."""
    con = sqlite3.connect(_TMP)
    try:
        con.execute(query, params)
        con.commit()
    finally:
        con.close()


def _log_on(habit_id: int, day: date):
    _exec("INSERT INTO habit_logs (habit_id, completed_at) VALUES (?, ?)",
          habit_id, f"{day.isoformat()} 12:00:00.000000")


def test_streak_counts_scheduled_days_only():
    """Un hábito que sólo toca un día de la semana no pierde la racha los otros
    seis: su ocasión anterior es hace 7 días, no ayer."""
    today = _today()
    with TestClient(main.app) as c:
        h = c.post("/habits", json={
            "name": "Un día fijo", "category": "Otro", "xp_reward": 20,
            "days": str(today.weekday()),
        }).json()
        assert h["days"] == str(today.weekday())

        _log_on(h["id"], today - timedelta(days=7))
        assert c.get(f"/habits/{h['id']}").json()["streak"] == 1  # antes daba 0

        c.post(f"/habits/{h['id']}/complete")
        assert c.get(f"/habits/{h['id']}").json()["streak"] == 2


def test_unscheduled_days_never_cost_a_life():
    """El fallo que motivó `days`: un hábito L–V cargado como diario perdía una
    vida cada sábado, y con 3 vidas eso son tres semanas hasta la penalización."""
    today = _today()
    with TestClient(main.app) as c:
        h = c.post("/habits", json={
            "name": "Lunes a viernes", "category": "Otro", "xp_reward": 20,
            "days": "0,1,2,3,4",
        }).json()
        _exec("UPDATE habits SET created_at = ? WHERE id = ?",
              f"{(today - timedelta(days=30)).isoformat()} 08:00:00.000000", h["id"])
        # marcado todos los días hábiles de la ventana, ninguno del fin de semana
        for i in range(1, 15):
            day = today - timedelta(days=i)
            if day.weekday() < 5:
                _log_on(h["id"], day)

        _exec("UPDATE users SET last_streak_eval = NULL, lives = 3")
        res = c.post("/user/evaluate-streaks").json()
        assert res["broken_habits"] == []
        assert res["life_lost"] is False
        assert res["xp_penalty"] == 0
        assert res["lives"] == 3


def test_weekly_target_needs_every_mark():
    """«2×/semana» no se da por cumplido con una sola marca, ni se puede cumplir
    dos veces el mismo día."""
    today = _today()
    prev_week = today - timedelta(days=today.weekday() + 7)
    with TestClient(main.app) as c:
        h = c.post("/habits", json={
            "name": "Esgrima", "category": "Otro", "xp_reward": 20,
            "frequency": "weekly", "target_per_week": 2,
        }).json()
        hid = h["id"]
        assert h["target_per_week"] == 2

        _log_on(hid, prev_week)
        assert c.get(f"/habits/{hid}").json()["streak"] == 0  # 1 de 2 no cierra la semana

        _log_on(hid, prev_week + timedelta(days=3))
        assert c.get(f"/habits/{hid}").json()["streak"] == 1

        assert c.post(f"/habits/{hid}/complete").status_code == 200
        assert c.post(f"/habits/{hid}/complete").status_code == 400


def test_undo_removes_only_the_latest_mark():
    """Con varias marcas por semana, deshacer una no puede llevarse el XP de las otras."""
    today = _today()
    with TestClient(main.app) as c:
        h = c.post("/habits", json={
            "name": "Dos por semana", "category": "Otro", "xp_reward": 20,
            "frequency": "weekly", "target_per_week": 2,
        }).json()
        hid = h["id"]
        _log_on(hid, today - timedelta(days=1))  # marca previa, sin XP asociado

        before = c.get("/user").json()["xp"]
        c.post(f"/habits/{hid}/complete")
        c.request("DELETE", f"/habits/{hid}/complete")

        assert c.get("/user").json()["xp"] == before
        logs = c.get(f"/habits/{hid}/logs").json()
        assert len(logs) == 1
        assert logs[0]["completed_at"].startswith((today - timedelta(days=1)).isoformat())


def test_cadence_fields_are_validated_and_normalized():
    with TestClient(main.app) as c:
        for bad in ("9", "-1", "lunes"):
            r = c.post("/habits", json={"name": "D", "category": "Otro", "days": bad})
            assert r.status_code == 422, bad
        assert c.post("/habits", json={"name": "D", "category": "Otro",
                                       "target_per_week": 0}).status_code == 422
        assert c.post("/habits", json={"name": "D", "category": "Otro",
                                       "target_per_week": 8}).status_code == 422

        h = c.post("/habits", json={"name": "Norm", "category": "Otro", "days": "3,0,0"}).json()
        assert h["days"] == "0,3"
        # vacío es «todos los días», no una lista vacía
        h2 = c.post("/habits", json={"name": "Vacío", "category": "Otro", "days": ""}).json()
        assert h2["days"] is None and h2["target_per_week"] == 1


from datetime import timezone  # noqa: E402


def test_partial_pomodoro_is_recorded_but_does_not_score():
    """Saltar o reiniciar a media sesión registraba un bloque completo con XP."""
    with TestClient(main.app) as c:
        before = c.get("/user").json()["xp"]

        done = c.post("/pomodoro/sessions", json={"work_minutes": 25}).json()
        assert done["xp_earned"] == 15
        minutes_after_done = done["total_today_minutes"]
        assert minutes_after_done >= 25

        partial = c.post("/pomodoro/sessions", json={"work_minutes": 7, "completed": False}).json()
        assert partial["xp_earned"] == 0
        assert partial["achievement_unlocked"] is None
        # los siete minutos abandonados no engordan el foco del día
        assert partial["total_today_minutes"] == minutes_after_done
        assert c.get("/user").json()["xp"] == before + 15

        sessions = c.get("/pomodoro/today").json()
        assert [s["completed"] for s in sessions].count(False) == 1


def test_pomodoro_records_the_real_start_time():
    """`started_at` tomaba su default y acababa sellando la hora de fin."""
    with TestClient(main.app) as c:
        started = datetime.now(timezone.utc) - timedelta(minutes=41)
        # ISO con zona, como lo manda el navegador
        c.post("/pomodoro/sessions", json={"work_minutes": 41, "started_at": started.isoformat()})

        s = next(x for x in c.get("/pomodoro/today").json() if x["work_minutes"] == 41)
        span = datetime.fromisoformat(s["finished_at"]) - datetime.fromisoformat(s["started_at"])
        assert timedelta(minutes=40) < span < timedelta(minutes=42)


def test_pomodoro_takes_a_project_with_or_without_a_task():
    with TestClient(main.app) as c:
        p = c.post("/projects", json={"name": "Foco"}).json()
        t = c.post("/tasks", json={"title": "Con proyecto", "project_id": p["id"]}).json()

        c.post("/pomodoro/sessions", json={"work_minutes": 33, "task_id": t["id"]})
        inherited = next(x for x in c.get("/pomodoro/today").json() if x["work_minutes"] == 33)
        assert inherited["project_id"] == p["id"]

        # y sin tarea: el caso que la UI no dejaba producir porque el campo de
        # proyecto sólo se rellenaba heredando
        c.post("/pomodoro/sessions", json={"work_minutes": 34, "project_id": p["id"]})
        direct = next(x for x in c.get("/pomodoro/today").json() if x["work_minutes"] == 34)
        assert direct["project_id"] == p["id"] and direct["task_id"] is None


# ---------------------------------------------------------------------------
# Erario
# ---------------------------------------------------------------------------

def _arca(c, name, **kw):
    return c.post("/ledger/accounts", json={"name": name, **kw}).json()


def _cerco_de(c, month, category_id) -> tuple[int, str | None]:
    """(monto vigente, mes del que viene) de una partida en un mes."""
    line = next(l for l in c.get(f"/ledger/budgets?month={month}").json()["lines"]
                if l["category_id"] == category_id)
    return line["amount_minor"], line["source_month"]


def _cerco(c, month, category_id, amount):
    """Fija el cerco de una partida EN UN MES. Un cero es «sin cerco» explícito."""
    return c.put("/ledger/budgets", json={
        "month": month, "items": [{"category_id": category_id, "amount_minor": amount}],
    })


def test_ledger_seeds_a_first_account_and_categories():
    with TestClient(main.app) as c:
        accounts = c.get("/ledger/accounts").json()
        assert len(accounts) >= 1
        assert accounts[0]["currency"] == "COP"

        cats = c.get("/ledger/categories").json()
        names = {x["name"] for x in cats}
        assert "Alimentación" in names
        assert any(x["kind"] == "income" for x in cats)
        # ninguna partida nace con asignación
        b = c.get("/ledger/budgets?month=2026-08").json()
        assert b["total_minor"] == 0
        assert all(l["amount_minor"] == 0 and l["source_month"] is None for l in b["lines"])


def test_balance_is_derived_from_entries_not_stored():
    with TestClient(main.app) as c:
        a = _arca(c, "Saldo", opening_minor=100000)
        food = next(x for x in c.get("/ledger/categories").json() if x["name"] == "Alimentación")

        c.post("/ledger/entries", json={
            "account_id": a["id"], "category_id": food["id"], "kind": "expense",
            "amount_minor": 18000, "occurred_on": "2026-08-11", "concept": "Almuerzo",
        })
        got = next(x for x in c.get("/ledger/accounts").json() if x["id"] == a["id"])
        assert got["balance_minor"] == 82000

        # borrar el asiento devuelve el saldo: no hay contador que se desincronice
        eid = c.get(f"/ledger/entries?account_id={a['id']}").json()[0]["id"]
        c.delete(f"/ledger/entries/{eid}")
        got = next(x for x in c.get("/ledger/accounts").json() if x["id"] == a["id"])
        assert got["balance_minor"] == 100000


def test_transfer_moves_between_arcas_without_being_spending():
    """Pasar dinero al ahorro no es gastarlo. Si contara como gasto, el resumen
    del mes mentiría cada vez que se ahorra."""
    with TestClient(main.app) as c:
        origin = _arca(c, "Banco", opening_minor=500000)
        dest = _arca(c, "Ahorro", opening_minor=0)

        c.post("/ledger/entries", json={
            "account_id": origin["id"], "kind": "transfer", "counter_account_id": dest["id"],
            "amount_minor": 300000, "occurred_on": "2026-09-10", "concept": "Al ahorro",
        })

        balances = {x["id"]: x["balance_minor"] for x in c.get("/ledger/accounts").json()}
        assert balances[origin["id"]] == 200000
        assert balances[dest["id"]] == 300000

        s = c.get("/ledger/summary?month=2026-09").json()
        assert s["expense_minor"] == 0 and s["income_minor"] == 0
        assert s["entry_count"] == 1
        # un traspaso no lleva partida por diseño, así que no está "sin clasificar"
        assert s["unclassified_count"] == 0


def test_ledger_rejects_what_would_silently_corrupt_the_book():
    with TestClient(main.app) as c:
        a = _arca(c, "Prueba")
        b = _arca(c, "Otra")
        food = next(x for x in c.get("/ledger/categories").json() if x["name"] == "Alimentación")
        base = {"account_id": a["id"], "occurred_on": "2026-08-11", "concept": "X"}

        # el signo lo pone `kind`: un monto <= 0 sumaría donde debe restar
        assert c.post("/ledger/entries", json={**base, "kind": "expense", "amount_minor": 0}).status_code == 422
        assert c.post("/ledger/entries", json={**base, "kind": "expense", "amount_minor": -500}).status_code == 422

        # un traspaso necesita destino, y distinto del origen
        assert c.post("/ledger/entries", json={**base, "kind": "transfer", "amount_minor": 100}).status_code == 400
        assert c.post("/ledger/entries", json={
            **base, "kind": "transfer", "amount_minor": 100, "counter_account_id": a["id"]},
        ).status_code == 400
        # ...y no lleva partida
        assert c.post("/ledger/entries", json={
            **base, "kind": "transfer", "amount_minor": 100,
            "counter_account_id": b["id"], "category_id": food["id"]},
        ).status_code == 400

        # una partida de gasto no clasifica un ingreso
        assert c.post("/ledger/entries", json={
            **base, "kind": "income", "amount_minor": 100, "category_id": food["id"]},
        ).status_code == 400

        # sólo un traspaso lleva arca de destino
        assert c.post("/ledger/entries", json={
            **base, "kind": "expense", "amount_minor": 100, "counter_account_id": b["id"]},
        ).status_code == 400

        # Pasado el entero seguro, el frontend redondea al mostrar: la cifra
        # guardada deja de ser la que se ve, y ninguna suma vuelve a cuadrar.
        # SQLite lo aceptaría tal cual, así que el corte va aquí.
        assert c.post("/ledger/entries", json={
            **base, "kind": "expense", "amount_minor": MAX_MINOR + 1},
        ).status_code == 422
        # el propio techo sí entra: un `lt` en vez de `le` pasaría el caso de
        # arriba y recortaría un peso al mayor monto legítimo
        ok = c.post("/ledger/entries", json={
            **base, "kind": "expense", "amount_minor": MAX_MINOR})
        assert ok.status_code == 201
        # y se retira: la base es compartida y este gasto desfiguraría el mes
        c.delete(f"/ledger/entries/{ok.json()['entry']['id']}")
        # y por las otras tres puertas por donde entra dinero
        assert c.post("/ledger/accounts", json={
            "name": "Desbordada", "opening_minor": MAX_MINOR + 1},
        ).status_code == 422
        assert c.post("/ledger/goals", json={
            "name": "Imposible", "target_minor": MAX_MINOR + 1, "account_id": a["id"]},
        ).status_code == 422
        assert _cerco(c, "2026-08", food["id"], MAX_MINOR + 1).status_code == 422


def test_money_decimals_mirror_matches_the_frontend():
    """MONEY_DECIMALS vive en dos lenguajes y sólo el de JS tenía test.

    El espejo de Python no se usa para convertir —el frontend manda `amount_minor`
    ya en unidades menores—, así que nada lo ejerce y podía separarse del otro sin
    que fallara nada. Y si se separan, uno de los dos reinterpreta por cien todo lo
    ya anotado. Este test es lo único que los mantiene atados.
    """
    utils_ts = (pathlib.Path(__file__).resolve().parents[2]
                / "frontend" / "src" / "utils.ts").read_text(encoding="utf-8")
    block = re.search(r"const MONEY_DECIMALS[^=]*=\s*\{(.*?)\}", utils_ts, re.S)
    assert block, "no se encontró MONEY_DECIMALS en utils.ts"
    js = {m.group(1): int(m.group(2))
          for m in re.finditer(r"(\w{3})\s*:\s*(\d+)", block.group(1))}

    assert js == MONEY_DECIMALS
    # el defecto de las que no están en la tabla también es espejo
    assert "USD" not in js and money_decimals("USD") == 2


def test_ledger_refuses_to_mix_currencies():
    """Sumar dos monedas sin tasas da un total que parece bueno y no lo es."""
    with TestClient(main.app) as c:
        r = c.post("/ledger/accounts", json={"name": "Euros", "currency": "EUR"})
        assert r.status_code == 400
        assert "COP" in r.json()["detail"]


def test_deleting_a_used_category_archives_it_and_keeps_the_entry():
    with TestClient(main.app) as c:
        a = _arca(c, "Arca")
        cat = c.post("/ledger/categories", json={"name": "Efímera", "kind": "expense"}).json()
        e = c.post("/ledger/entries", json={
            "account_id": a["id"], "category_id": cat["id"], "kind": "expense",
            "amount_minor": 5000, "occurred_on": "2026-10-02", "concept": "Gasto",
        }).json()["entry"]

        c.delete(f"/ledger/categories/{cat['id']}")
        assert cat["id"] not in {x["id"] for x in c.get("/ledger/categories").json()}
        archived = next(x for x in c.get("/ledger/categories?include_archived=true").json()
                        if x["id"] == cat["id"])
        assert archived["archived"] is True

        # el movimiento sobrevive: se pierde la clasificación, nunca el dinero
        kept = next(x for x in c.get("/ledger/entries?month=2026-10").json() if x["id"] == e["id"])
        assert kept["amount_minor"] == 5000

        # una partida sin usar sí se borra de verdad
        unused = c.post("/ledger/categories", json={"name": "Sin uso", "kind": "expense"}).json()
        c.delete(f"/ledger/categories/{unused['id']}")
        assert unused["id"] not in {
            x["id"] for x in c.get("/ledger/categories?include_archived=true").json()
        }


def test_summary_counts_unclassified_and_rejects_a_bad_month():
    with TestClient(main.app) as c:
        a = _arca(c, "Suelta")
        c.post("/ledger/entries", json={
            "account_id": a["id"], "kind": "expense", "amount_minor": 12800,
            "occurred_on": "2026-11-08", "concept": "Café",
        })
        s = c.get("/ledger/summary?month=2026-11").json()
        assert s["unclassified_count"] == 1
        assert s["expense_minor"] == 12800
        assert any(x["category_id"] is None and x["name"] == "Sin partida" for x in s["by_category"])

        assert c.get("/ledger/summary?month=noviembre").status_code == 400
        assert c.get("/ledger/entries?month=2026-13").status_code == 400


def test_assignments_drive_available_and_leave_the_leak_visible():
    """El disponible mide lo asignado contra lo gastado DENTRO del cerco.

    Restar también lo que no tiene asignación haría que una partida sin cerco
    comiera del disponible de las demás; no contarlo en absoluto escondería por
    dónde se escapa el dinero. Por eso va aparte, y visible."""
    with TestClient(main.app) as c:
        a = _arca(c, "Mes con cerco")
        cats = c.get("/ledger/categories").json()
        food = next(x for x in cats if x["name"] == "Alimentación")
        fun = next(x for x in cats if x["name"] == "Ocio")

        _cerco(c, "2027-03", food["id"], 500000)
        # Ocio se queda sin cerco a propósito
        entry = {"account_id": a["id"], "occurred_on": "2027-03-04", "kind": "expense"}
        c.post("/ledger/entries", json={**entry, "category_id": food["id"],
                                        "amount_minor": 180000, "concept": "Mercado"})
        c.post("/ledger/entries", json={**entry, "category_id": fun["id"],
                                        "amount_minor": 90000, "concept": "Cine"})
        c.post("/ledger/entries", json={**entry, "amount_minor": 10000, "concept": "Suelto"})

        s = c.get("/ledger/summary?month=2027-03").json()
        assert s["budget_total_minor"] == 500000
        assert s["budgeted_spent_minor"] == 180000
        assert s["available_minor"] == 320000
        # el cine y el suelto son gasto real, pero no contra ningún cerco
        assert s["unbudgeted_spent_minor"] == 100000
        assert s["expense_minor"] == 280000

        # el carril de una partida con cerco existe aunque no se haya gastado, y
        # el cerco de marzo se arrastra a abril sin repetirlo
        _cerco(c, "2027-04", fun["id"], 150000)
        rows = {r["name"]: r for r in c.get("/ledger/summary?month=2027-04").json()["by_category"]}
        assert rows["Alimentación"]["total_minor"] == 0
        assert rows["Alimentación"]["budget_minor"] == 500000

        # un cero corta la herencia: es «este mes, sin cerco»
        _cerco(c, "2027-04", food["id"], 0)
        s = c.get("/ledger/summary?month=2027-04").json()
        assert s["budget_total_minor"] == 150000
        # y marzo sigue diciendo lo que decía
        assert c.get("/ledger/summary?month=2027-03").json()["budget_total_minor"] == 500000


def test_days_left_never_divides_by_zero():
    """El margen diario reparte el disponible entre los días que quedan."""
    with TestClient(main.app) as c:
        from tz import today as _t
        hoy = _t()
        actual = c.get(f"/ledger/summary?month={hoy:%Y-%m}").json()
        assert actual["days_left"] >= 1  # hoy siempre cuenta

        pasado = c.get("/ledger/summary?month=2020-01").json()
        assert pasado["days_left"] == 0  # un mes cerrado no reparte nada

        futuro = c.get("/ledger/summary?month=2099-01").json()
        assert futuro["days_left"] == 31  # el mes entero por delante


def test_budget_rejects_a_negative_cerco():
    with TestClient(main.app) as c:
        cat = c.get("/ledger/categories").json()[0]
        assert _cerco(c, "2027-05", cat["id"], -1).status_code == 422
        assert c.put("/ledger/budgets", json={
            "month": "mayo", "items": [{"category_id": cat["id"], "amount_minor": 1}],
        }).status_code == 400


# ---------------------------------------------------------------------------
# Erario — las cinco prohibiciones de la capa de juego
#
# Todas protegen bugs silenciosos: no rompen nada, sólo inflan el nivel, y no se
# ven hasta revisar el xp_log meses después.
# ---------------------------------------------------------------------------

def _xp(c) -> int:
    return c.get("/user").json()["xp"]


def _query(sql: str, *params):
    """Leer directamente. `_exec` sólo escribe: no devuelve filas."""
    con = sqlite3.connect(_TMP)
    try:
        return con.execute(sql, params).fetchall()
    finally:
        con.close()


def _ledger_day_marks() -> int:
    return _query("SELECT COUNT(*) FROM xp_log WHERE source = 'ledger_day'")[0][0]


def _reset_ledger_day():
    """Todo el archivo comparte una sola base y varios tests anotan hoy, así que
    la marca del día ya puede estar puesta. Estos tests miden el otorgamiento,
    no la herencia: empiezan con el día limpio."""
    _exec("DELETE FROM xp_log WHERE source = 'ledger_day'")


def test_ledger_pays_once_a_day_no_matter_how_many_entries():
    """Premia el acto de llevar el libro, no el número de renglones."""
    with TestClient(main.app) as c:
        _reset_ledger_day()
        a = _arca(c, "Goteo")
        base = {"account_id": a["id"], "kind": "expense", "amount_minor": 1000}
        antes = _xp(c)

        r1 = c.post("/ledger/entries", json={**base, "occurred_on": "2026-08-11", "concept": "Uno"}).json()
        assert r1["xp"]["xp_earned"] == 5
        assert _xp(c) == antes + 5

        # el segundo asiento del mismo día no paga otra vez
        r2 = c.post("/ledger/entries", json={**base, "occurred_on": "2026-08-11", "concept": "Dos"}).json()
        assert r2["xp"] is None
        r3 = c.post("/ledger/entries", json={**base, "occurred_on": "2026-08-12", "concept": "Tres"}).json()
        assert r3["xp"] is None
        assert _xp(c) == antes + 5


def test_ledger_xp_is_not_retroactive():
    """Rellenar el mes entero de una sentada es un día de constancia, no treinta.

    El XP se sella contra el día del ACTO (earned_at), nunca contra la fecha del
    gasto: es la misma regla que "no registrar tiempo que nadie vio correr".
    """
    with TestClient(main.app) as c:
        _reset_ledger_day()
        a = _arca(c, "Retroactivo")
        antes = _xp(c)
        marcas_antes = _ledger_day_marks()
        for day in range(1, 16):
            c.post("/ledger/entries", json={
                "account_id": a["id"], "kind": "expense", "amount_minor": 1000,
                "occurred_on": f"2026-05-{day:02d}", "concept": f"Dia {day}",
            })
        # quince días de gastos anotados hoy = un solo día pagado
        assert _xp(c) - antes == 5
        assert _ledger_day_marks() == marcas_antes + 1


def test_ledger_xp_cannot_be_farmed_by_deleting_and_reposting():
    """La marca vive en xp_log, no en el número de asientos."""
    with TestClient(main.app) as c:
        _reset_ledger_day()
        a = _arca(c, "Farmeo")
        payload = {"account_id": a["id"], "kind": "expense", "amount_minor": 1000,
                   "occurred_on": "2026-08-11", "concept": "Ciclo"}
        antes = _xp(c)
        eid = c.post("/ledger/entries", json=payload).json()["entry"]["id"]
        assert _xp(c) == antes + 5

        for _ in range(5):
            c.delete(f"/ledger/entries/{eid}")
            eid = c.post("/ledger/entries", json=payload).json()["entry"]["id"]
        assert _xp(c) == antes + 5


def test_ledger_never_penalises_and_never_touches_lives():
    """Gastarse la asignación no cuesta nada en el juego; ya cuesta en la vida."""
    with TestClient(main.app) as c:
        a = _arca(c, "Sin castigo")
        cat = next(x for x in c.get("/ledger/categories").json() if x["name"] == "Ocio")
        _cerco(c, "2026-08", cat["id"], 10000)
        vidas_antes = c.get("/user").json()["lives"]
        xp_antes = _xp(c)

        # pasarse del cerco diez veces
        for i in range(10):
            c.post("/ledger/entries", json={
                "account_id": a["id"], "category_id": cat["id"], "kind": "expense",
                "amount_minor": 99000, "occurred_on": "2026-08-11", "concept": f"Exceso {i}",
            })
        s = c.get("/ledger/summary?month=2026-08").json()
        assert s["available_minor"] < 0                 # el cerco reventado
        assert c.get("/user").json()["lives"] == vidas_antes
        assert _xp(c) >= xp_antes                       # nunca resta
        # y ni un solo apunte negativo con origen en el erario
        negativos = _query(
            "SELECT COUNT(*) FROM xp_log WHERE amount < 0 AND source LIKE 'ledger%'"
        )[0][0]
        assert negativos == 0


def test_ledger_xp_carries_no_streak_multiplier():
    """streak_multiplier() es de hábitos: un mes de gimnasio no puede inflar el
    XP de apuntar el almuerzo."""
    with TestClient(main.app) as c:
        h = c.post("/habits", json={"name": "Racha larga", "category": "Otro"}).json()
        for offset in range(40):
            _log_on(h["id"], date.today() - timedelta(days=offset))
        assert c.get(f"/habits/{h['id']}").json()["streak"] >= 30

        _reset_ledger_day()
        a = _arca(c, "Multiplicador")
        antes = _xp(c)
        r = c.post("/ledger/entries", json={
            "account_id": a["id"], "kind": "expense", "amount_minor": 1000,
            "occurred_on": "2026-08-11", "concept": "Plano",
        }).json()
        assert r["xp"]["xp_earned"] == 5      # cinco pelados, no 5 x 1,35
        assert _xp(c) - antes == 5


def test_closing_a_month_pays_once_and_freezes_its_figures():
    with TestClient(main.app) as c:
        a = _arca(c, "Cierre")
        cat = next(x for x in c.get("/ledger/categories").json() if x["name"] == "Salud")
        _cerco(c, "2026-06", cat["id"], 200000)
        c.post("/ledger/entries", json={
            "account_id": a["id"], "category_id": cat["id"], "kind": "expense",
            "amount_minor": 50000, "occurred_on": "2026-06-10", "concept": "Consulta",
        })
        antes = _xp(c)
        vigente = c.get("/ledger/summary?month=2026-06").json()

        r = c.post("/ledger/reviews", json={
            "month_key": "2026-06", "what_leaked": "El ocio",
            "next_change": "Cerco al ocio", "rating": 3,
        }).json()
        assert r["xp_earned"] == 30
        assert _xp(c) == antes + 30

        # editar la reflexión NO vuelve a pagar
        r2 = c.post("/ledger/reviews", json={"month_key": "2026-06", "what_leaked": "Otra cosa"}).json()
        assert r2["xp_earned"] == 0
        assert _xp(c) == antes + 30
        assert c.get("/ledger/reviews/2026-06").json()["what_leaked"] == "Otra cosa"

        # las cifras quedaron congeladas
        rev = c.get("/ledger/reviews/2026-06").json()
        assert rev["budget_total_minor"] == vigente["budget_total_minor"]
        assert rev["spent_minor"] == vigente["expense_minor"]

        # Y ahora la parte que antes NO se cumplía: subir el cerco en diciembre
        # ya no reescribe lo que decía junio, ni en la vista ni en la revisión.
        # Con el cerco como columna única de la partida, la vista de junio pasaba
        # a enseñar 900.000 y sólo el snapshot salvaba la revisión.
        _cerco(c, "2026-12", cat["id"], 900000)
        assert c.get("/ledger/summary?month=2026-06").json()["budget_total_minor"] \
            == vigente["budget_total_minor"]
        assert c.get("/ledger/reviews/2026-06").json()["budget_total_minor"] \
            == vigente["budget_total_minor"]
        # diciembre sí lo ve
        assert c.get("/ledger/summary?month=2026-12").json()["budget_total_minor"] >= 900000

        assert c.post("/ledger/reviews", json={"month_key": "2099-01"}).status_code == 400


def test_ledger_quests_count_the_act_not_the_expense_date():
    with TestClient(main.app) as c:
        a = _arca(c, "Misiones")
        antes = _query(
            "SELECT COUNT(*) FROM ledger_entries WHERE date(created_at) = date('now','localtime')"
        )[0][0]

        # un gasto de hace meses, anotado HOY, cuenta para la misión de hoy: la
        # métrica mira `created_at`, el día del acto, no la fecha del gasto
        c.post("/ledger/entries", json={
            "account_id": a["id"], "kind": "expense", "amount_minor": 1000,
            "occurred_on": "2026-01-15", "concept": "Viejo",
        })
        diaria = next(q for q in c.get("/quests").json() if q["title"] == "Asienta el día")
        assert diaria["progress"] >= 1 and diaria["completed"] is True

        # ...y por `occurred_on` no habría contado: el gasto es de enero
        assert _query(
            "SELECT COUNT(*) FROM ledger_entries WHERE date(created_at) = date('now','localtime')"
        )[0][0] == antes + 1


def test_ledger_achievements_track_practice_not_money():
    with TestClient(main.app) as c:
        a = _arca(c, "Logros")
        c.post("/ledger/entries", json={
            "account_id": a["id"], "kind": "expense", "amount_minor": 999999999,
            "occurred_on": "2026-08-11", "concept": "Fortuna",
        })
        ach = {x["key"]: x for x in c.get("/achievements").json()}
        assert ach["first_entry"]["unlocked"] is True
        # anotar una fortuna no desbloquea nada más: el logro mide la práctica
        assert ach["ledger_30"]["unlocked"] is False
        assert ach["closed_books"]["unlocked"] is False


# ---------------------------------------------------------------------------
# Erario — reliquias
# ---------------------------------------------------------------------------

def _relic(c, name, target, account_id):
    return c.post("/ledger/goals", json={
        "name": name, "target_minor": target, "account_id": account_id,
    }).json()


def _aporte(c, origen, destino, monto, goal_id, dia="2026-08-11"):
    return c.post("/ledger/entries", json={
        "account_id": origen, "counter_account_id": destino, "kind": "transfer",
        "amount_minor": monto, "occurred_on": dia, "concept": "Aporte",
        "goal_id": goal_id,
    })


def test_relic_progress_is_derived_and_per_goal():
    """Dos reliquias sobre la misma arca llevan cada una su cuenta.

    Si el progreso fuera el saldo del arca, las dos mostrarían lo mismo y la
    segunda parecería casi cumplida sin haber recibido nada."""
    with TestClient(main.app) as c:
        origen = _arca(c, "Corriente", opening_minor=5000000)
        hucha = _arca(c, "Hucha")
        sable = _relic(c, "Sable nuevo", 1200000, hucha["id"])
        colchon = _relic(c, "Colchón", 1400000, hucha["id"])

        _aporte(c, origen["id"], hucha["id"], 740000, sable["id"])
        metas = {g["name"]: g for g in c.get("/ledger/goals").json()}
        assert metas["Sable nuevo"]["saved_minor"] == 740000
        assert metas["Colchón"]["saved_minor"] == 0

        # sacar dinero de la hucha marcado con la meta descuenta
        c.post("/ledger/entries", json={
            "account_id": hucha["id"], "counter_account_id": origen["id"],
            "kind": "transfer", "amount_minor": 140000, "occurred_on": "2026-08-12",
            "concept": "Saqué de la hucha", "goal_id": sable["id"],
        })
        metas = {g["name"]: g for g in c.get("/ledger/goals").json()}
        assert metas["Sable nuevo"]["saved_minor"] == 600000


def test_relic_pays_a_flat_fifty_no_matter_the_amount():
    """Proporcional al monto sería premiar la renta, no la constancia."""
    with TestClient(main.app) as c:
        _reset_ledger_day()
        origen = _arca(c, "Origen grande", opening_minor=99000000)
        h1 = _arca(c, "Hucha modesta")
        h2 = _arca(c, "Hucha enorme")
        chica = _relic(c, "Meta chica", 10000, h1["id"])
        grande = _relic(c, "Meta enorme", 50000000, h2["id"])

        antes = _xp(c)
        r1 = _aporte(c, origen["id"], h1["id"], 10000, chica["id"]).json()
        # 5 del día + 50 de la reliquia, en un solo evento
        assert r1["xp"]["xp_earned"] == 55
        assert _xp(c) == antes + 55

        antes = _xp(c)
        r2 = _aporte(c, origen["id"], h2["id"], 50000000, grande["id"]).json()
        assert r2["xp"]["xp_earned"] == 50   # el día ya estaba pagado
        assert _xp(c) == antes + 50          # cinco mil veces más dinero, mismo XP


def test_relic_seals_once_and_cannot_be_recharged():
    with TestClient(main.app) as c:
        origen = _arca(c, "Fuente", opening_minor=9000000)
        hucha = _arca(c, "Sellada")
        meta = _relic(c, "Sellada", 100000, hucha["id"])

        _aporte(c, origen["id"], hucha["id"], 100000, meta["id"])
        g = next(x for x in c.get("/ledger/goals").json() if x["id"] == meta["id"])
        assert g["achieved_at"] is not None
        sellado = g["achieved_at"]
        xp_tras_sellar = _xp(c)

        # más aportes no vuelven a pagar
        _aporte(c, origen["id"], hucha["id"], 500000, meta["id"])
        assert _xp(c) == xp_tras_sellar
        g = next(x for x in c.get("/ledger/goals").json() if x["id"] == meta["id"])
        assert g["achieved_at"] == sellado

        # y sólo hay un apunte de reliquia en el registro
        assert _query(
            "SELECT COUNT(*) FROM xp_log WHERE source = 'relic' AND source_id = ?", meta["id"]
        )[0][0] == 1


def test_lowering_the_target_does_not_award_the_relic():
    """Bajar la meta por debajo de lo ahorrado no es haber ahorrado.

    Si sellara al editar, cambiar la cifra sería la forma más barata de cobrar
    50 XP: poner 10 millones, ahorrar mil, y bajar la meta a mil."""
    with TestClient(main.app) as c:
        origen = _arca(c, "Tramposa", opening_minor=9000000)
        hucha = _arca(c, "Hucha tramposa")
        meta = _relic(c, "Inalcanzable", 5000000, hucha["id"])
        _aporte(c, origen["id"], hucha["id"], 30000, meta["id"])

        antes = _xp(c)
        bajada = c.patch(f"/ledger/goals/{meta['id']}", json={"target_minor": 20000}).json()
        assert bajada["saved_minor"] == 30000        # ya sobra para la meta nueva
        assert bajada["achieved_at"] is None         # pero no se sella sola
        assert _xp(c) == antes

        # hace falta un aporte posterior, que es lo que de verdad la alcanza
        r = _aporte(c, origen["id"], hucha["id"], 1000, meta["id"]).json()
        assert r["xp"]["xp_earned"] >= 50
        g = next(x for x in c.get("/ledger/goals").json() if x["id"] == meta["id"])
        assert g["achieved_at"] is not None


def test_only_a_transfer_can_feed_a_relic():
    with TestClient(main.app) as c:
        origen = _arca(c, "Gastadora", opening_minor=900000)
        hucha = _arca(c, "Hucha ajena")
        otra = _arca(c, "Arca ajena")
        meta = _relic(c, "Con arca", 100000, hucha["id"])

        # un gasto marcado como aporte inflaría la reliquia sin mover el dinero
        assert c.post("/ledger/entries", json={
            "account_id": origen["id"], "kind": "expense", "amount_minor": 5000,
            "occurred_on": "2026-08-11", "concept": "Trampa", "goal_id": meta["id"],
        }).status_code == 400

        # y un traspaso que no toca el arca de la reliquia tampoco cuenta
        assert c.post("/ledger/entries", json={
            "account_id": origen["id"], "counter_account_id": otra["id"],
            "kind": "transfer", "amount_minor": 5000, "occurred_on": "2026-08-11",
            "concept": "Ni fu ni fa", "goal_id": meta["id"],
        }).status_code == 400


def test_ledger_stats_leave_transfers_out():
    """Pasar dinero al ahorro no es gasto: pintarlo como tal haría que ahorrar se
    viera igual de rojo que derrochar."""
    with TestClient(main.app) as c:
        a = _arca(c, "Stats", opening_minor=900000)
        b = _arca(c, "Stats destino")
        cat = next(x for x in c.get("/ledger/categories").json() if x["name"] == "Hogar")
        hoy = date.today().isoformat()
        c.post("/ledger/entries", json={
            "account_id": a["id"], "category_id": cat["id"], "kind": "expense",
            "amount_minor": 30000, "occurred_on": hoy, "concept": "Gasto de hoy",
        })
        c.post("/ledger/entries", json={
            "account_id": a["id"], "counter_account_id": b["id"], "kind": "transfer",
            "amount_minor": 400000, "occurred_on": hoy, "concept": "Al ahorro",
        })

        s = c.get("/ledger/stats?months=3").json()
        dia = next((d for d in s["daily"] if d["date"] == hoy), None)
        assert dia is not None
        assert dia["expense_minor"] >= 30000
        # el traspaso de 400.000 no puede estar dentro
        assert dia["expense_minor"] < 400000

        hogar = [x for x in s["series"] if x["name"] == "Hogar"]
        assert hogar and all(x["total_minor"] >= 30000 for x in hogar)
        assert s["currency"] == "COP"


# ---------------------------------------------------------------------------
# Erario — el cerco es de un mes, no de la partida
# ---------------------------------------------------------------------------

def test_a_budget_belongs_to_a_month_and_carries_forward():
    """Fijarlo una vez vale para los meses siguientes, sin repetirlo."""
    with TestClient(main.app) as c:
        cat = c.post("/ledger/categories", json={"name": "Arrastre", "kind": "expense"}).json()

        # antes de fijarlo no hay cerco: no se inventa hacia atrás
        assert _cerco_de(c, "2028-01", cat["id"]) == (0, None)

        _cerco(c, "2028-02", cat["id"], 400000)
        assert _cerco_de(c, "2028-01", cat["id"]) == (0, None)          # enero sigue sin cerco
        assert _cerco_de(c, "2028-02", cat["id"]) == (400000, "2028-02")  # propio
        assert _cerco_de(c, "2028-05", cat["id"]) == (400000, "2028-02")  # heredado


def test_changing_a_budget_later_never_rewrites_the_past():
    """Era el defecto de fondo del cerco como columna única: cambiarlo en
    noviembre hacía que agosto enseñara el número de noviembre."""
    with TestClient(main.app) as c:
        a = _arca(c, "Historia", opening_minor=9000000)
        cat = c.post("/ledger/categories", json={"name": "Historia", "kind": "expense"}).json()
        _cerco(c, "2028-08", cat["id"], 500000)
        c.post("/ledger/entries", json={
            "account_id": a["id"], "category_id": cat["id"], "kind": "expense",
            "amount_minor": 450000, "occurred_on": "2028-08-15", "concept": "Agosto",
        })

        # en deltas: el archivo comparte una base y otros cercos se arrastran hasta aquí
        agosto = c.get("/ledger/summary?month=2028-08").json()
        assert _cerco_de(c, "2028-08", cat["id"]) == (500000, "2028-08")

        # tres meses después se recorta el presupuesto
        _cerco(c, "2028-11", cat["id"], 200000)

        # agosto sigue diciendo exactamente lo mismo, al céntimo
        otra_vez = c.get("/ledger/summary?month=2028-08").json()
        assert otra_vez["budget_total_minor"] == agosto["budget_total_minor"]
        assert otra_vez["available_minor"] == agosto["available_minor"]
        assert _cerco_de(c, "2028-08", cat["id"]) == (500000, "2028-08")
        # y noviembre ve el recorte
        assert _cerco_de(c, "2028-11", cat["id"]) == (200000, "2028-11")
        # los meses de en medio heredan del más reciente anterior, que es agosto
        assert _cerco_de(c, "2028-09", cat["id"]) == (500000, "2028-08")


def test_a_zero_budget_cuts_the_inheritance_on_purpose():
    """Poner cero es «este mes, sin cerco», y no es lo mismo que no tocar nada."""
    with TestClient(main.app) as c:
        cat = c.post("/ledger/categories", json={"name": "Corte", "kind": "expense"}).json()
        _cerco(c, "2029-01", cat["id"], 300000)
        assert _cerco_de(c, "2029-03", cat["id"]) == (300000, "2029-01")

        _cerco(c, "2029-02", cat["id"], 0)
        assert _cerco_de(c, "2029-02", cat["id"]) == (0, None)   # sin cerco
        assert _cerco_de(c, "2029-03", cat["id"]) == (0, None)   # y deja de heredar
        assert _cerco_de(c, "2029-01", cat["id"]) == (300000, "2029-01")  # enero intacto


def test_setting_a_budget_twice_in_a_month_updates_instead_of_duplicating():
    with TestClient(main.app) as c:
        cat = c.post("/ledger/categories", json={"name": "Idempotente", "kind": "expense"}).json()
        _cerco(c, "2029-06", cat["id"], 100000)
        _cerco(c, "2029-06", cat["id"], 250000)
        assert _cerco_de(c, "2029-06", cat["id"]) == (250000, "2029-06")
        assert _query(
            "SELECT COUNT(*) FROM category_budgets WHERE category_id = ? AND month_key = '2029-06'",
            cat["id"],
        )[0][0] == 1


def test_archived_category_budget_does_not_inflate_the_total():
    """Un cerco de una partida archivada sumaría al asignado sin que nadie pueda
    gastarlo, y el disponible saldría más alto de lo que es."""
    with TestClient(main.app) as c:
        cat = c.post("/ledger/categories", json={"name": "Efímera cerco", "kind": "expense"}).json()
        _cerco(c, "2029-09", cat["id"], 700000)
        antes = c.get("/ledger/summary?month=2029-09").json()["budget_total_minor"]
        assert antes >= 700000

        c.patch(f"/ledger/categories/{cat['id']}", json={"archived": True})
        despues = c.get("/ledger/summary?month=2029-09").json()["budget_total_minor"]
        assert despues == antes - 700000
