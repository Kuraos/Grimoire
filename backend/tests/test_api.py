"""Smoke tests for the Grimoire API. Uses a throwaway DB via GRIMOIRE_DB."""
import os
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
