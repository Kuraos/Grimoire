"""SQLAlchemy async engine, session factory and declarative Base."""
import os
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base


def _resolve_db_path() -> Path:
    """Pick a writable location for grimoire.db.

    - GRIMOIRE_DB env var always wins (explicit override).
    - Packaged desktop build (PyInstaller sidecar): %APPDATA%/Grimoire so the DB
      lives in a writable user folder, not next to a read-only .exe.
    - Dev: alongside this file (backend/grimoire.db), keeping existing data.
    """
    override = os.environ.get("GRIMOIRE_DB")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):  # running from a PyInstaller bundle
        base = Path(os.environ.get("APPDATA", Path.home())) / "Grimoire"
        base.mkdir(parents=True, exist_ok=True)
        return base / "grimoire.db"
    return Path(__file__).resolve().parent / "grimoire.db"


DB_PATH = _resolve_db_path()
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
