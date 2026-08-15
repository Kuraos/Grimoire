"""Grimoire FastAPI application: DB init, seeding, CORS, router mounting.

Obsidian integration note: the vault cross-reference (projects/tasks.vault_note_path)
and the diary export (POST /diary/{date}/export-obsidian) assume Grimoire and the
Obsidian vault live on the SAME machine — the backend sidecar writes to the vault via
direct filesystem access, with no network layer in between.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from database import engine, Base, SessionLocal
import models  # noqa: F401  (register models on Base)
from models import User, Achievement, Habit, HabitCategory, LedgerCategory, Account
from constants import (
    PREDEFINED_ACHIEVEMENTS, HABIT_CATEGORY_DEFAULTS, LEDGER_CATEGORY_DEFAULTS,
    DEFAULT_CURRENCY,
)


def _ensure_columns(sync_conn):
    """Lightweight migration: add new columns to existing tables (no Alembic)."""
    from sqlalchemy import inspect
    from datetime import date
    insp = inspect(sync_conn)
    tables = set(insp.get_table_names())
    wanted = {
        "users": [("lives", "INTEGER DEFAULT 3"), ("last_streak_eval", "DATE"),
                  ("obsidian_vault_path", "VARCHAR")],
        "achievements": [("tier", "VARCHAR DEFAULT 'common'")],
        "habits": [("tags", "VARCHAR"), ("days", "VARCHAR"),
                   ("target_per_week", "INTEGER DEFAULT 1")],
        "tasks": [
            ("status", "VARCHAR DEFAULT 'todo'"), ("position", "INTEGER DEFAULT 0"),
            ("remind_at", "DATETIME"), ("tags", "VARCHAR"), ("vault_note_path", "VARCHAR"),
        ],
        "diary_entries": [("tags", "VARCHAR")],
        "calendar_events": [("recurrence", "VARCHAR DEFAULT 'none'"), ("recurrence_until", "DATE"),
                            ("ics_uid", "VARCHAR")],
        "projects": [("vault_note_path", "VARCHAR")],
        # `ledger_entries` nació en la fase del libro, antes que las reliquias:
        # create_all no toca una tabla que ya existe, así que la columna entra por aquí.
        "ledger_entries": [("goal_id", "INTEGER")],
    }
    for table, cols in wanted.items():
        if table not in tables:
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols:
            if name not in have:
                sync_conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    if "tasks" in tables:
        sync_conn.exec_driver_sql(
            "UPDATE tasks SET status='done' WHERE completed=1 AND (status IS NULL OR status='todo')"
        )

    # El cerco pasó de columna única en `ledger_categories` a fila con mes en
    # `category_budgets`. Los valores que hubiera se mudan al mes en curso —que
    # es desde cuándo se sabe que valían— y sólo entonces se tira la columna.
    if "ledger_categories" in tables and "category_budgets" in tables:
        legacy = {c["name"] for c in insp.get_columns("ledger_categories")}
        if "budget_minor" in legacy:
            month = date.today().strftime("%Y-%m")
            sync_conn.exec_driver_sql(
                "INSERT OR IGNORE INTO category_budgets (category_id, month_key, amount_minor) "
                "SELECT id, ?, budget_minor FROM ledger_categories WHERE budget_minor IS NOT NULL",
                (month,),
            )
            # SQLite admite DROP COLUMN desde 3.35; si la versión fuera anterior
            # la columna se queda muerta pero nadie la lee, y no rompe nada.
            try:
                sync_conn.exec_driver_sql("ALTER TABLE ledger_categories DROP COLUMN budget_minor")
            except Exception as e:  # noqa: BLE001
                print(f"[migración] budget_minor no se pudo eliminar, queda inerte: {e}")


async def seed():
    async with SessionLocal() as db:
        # default user
        user = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if user is None:
            db.add(User())

        # predefined achievements (locked); also backfill tier on existing rows
        existing = {a.key: a for a in (await db.execute(select(Achievement))).scalars().all()}
        for key, name, desc, icon, tier in PREDEFINED_ACHIEVEMENTS:
            if key not in existing:
                db.add(Achievement(key=key, name=name, description=desc, icon=icon, tier=tier))
            elif not existing[key].tier:
                existing[key].tier = tier

        # default habit categories (idempotent by name); users can add/remove their own
        known_cats = set((await db.execute(select(HabitCategory.name))).scalars().all())
        for cat_name, cat_color in HABIT_CATEGORY_DEFAULTS:
            if cat_name not in known_cats:
                db.add(HabitCategory(name=cat_name, color=cat_color))

        # heal any habit whose category isn't in the catalog (legacy/imported rows)
        known_cats = set((await db.execute(select(HabitCategory.name))).scalars().all())
        used = set((await db.execute(select(Habit.category).distinct())).scalars().all())
        for orphan in used - known_cats:
            if orphan:
                db.add(HabitCategory(name=orphan, color="#9b7fc4"))

        # example habits on a truly empty database
        habit_count = (await db.execute(select(Habit))).scalars().first()
        if habit_count is None:
            samples = [
                ("Correr 5 km", "Físico", "#6a9b7f", 30),
                ("Alemán — 30 min", "Idioma", "#7f8fc4", 25),
                ("Derivadas — 1 set", "Académico", "#9b7fc4", 20),
                ("Stellar Classifier", "Proyecto", "#c47f9b", 35),
            ]
            for name, cat, color, xp in samples:
                db.add(Habit(name=name, category=cat, color=color, xp_reward=xp))

        # partidas del erario (idempotente por nombre+tipo, como las de hábitos)
        known_parts = {
            (n, k) for n, k in
            (await db.execute(select(LedgerCategory.name, LedgerCategory.kind))).all()
        }
        for name, kind, color, icon in LEDGER_CATEGORY_DEFAULTS:
            if (name, kind) not in known_parts:
                db.add(LedgerCategory(name=name, kind=kind, color=color, icon=icon))

        # un arca para poder anotar desde el primer minuto. Sólo si no hay
        # ninguna: crear una segunda "Efectivo" en cada arranque sería un desastre
        # silencioso, porque los saldos se reparten entre las dos.
        has_account = (await db.execute(select(Account))).scalars().first()
        if has_account is None:
            db.add(Account(name="Efectivo", kind="cash", currency=DEFAULT_CURRENCY,
                           color="#5aa885"))

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_columns)
    await seed()
    # respaldo automático diario (rota 7). Silencioso: nunca debe impedir arrancar.
    try:
        import backup as _bk
        made = _bk.daily_backup_if_needed()
        if made:
            print(f"[backup] respaldo automático creado: {made.name}")
    except Exception as e:  # noqa: BLE001
        print(f"[backup] no se pudo crear el respaldo automático: {e}")
    yield


app = FastAPI(title="Grimoire", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # dev: Vite on :5173 — desktop: Tauri webview (tauri://localhost /
    # http://tauri.localhost) and direct 127.0.0.1 calls. Local single-user app.
    allow_origin_regex=r"^(https?://localhost(:\d+)?|https?://127\.0\.0\.1(:\d+)?|tauri://localhost|https?://tauri\.localhost)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import (  # noqa: E402
    user, habits, tasks, projects, pomodoro, calendar, diary, checkins,
    stats, achievements, reviews, quests, tags, habit_categories, backup, ledger,
)

for r in (user, habits, tasks, projects, pomodoro, calendar, diary, checkins,
          stats, achievements, reviews, quests, tags, habit_categories, backup,
          ledger):
    app.include_router(r.router)


@app.get("/")
async def root():
    return {"app": "Grimoire", "status": "ok"}
