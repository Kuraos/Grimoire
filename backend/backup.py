"""Respaldo y exportación de datos.

Grimoire guarda toda la vida del usuario en un único archivo SQLite. Sin copias,
un disco con fallos o una reinstalación mal hecha lo pierde todo. Este módulo:

  - hace snapshots con la API `Connection.backup()` de SQLite, que es segura
    en caliente (no depende de copiar el archivo mientras hay conexiones vivas,
    ni deja fuera los `-wal`);
  - rota los automáticos para no crecer sin límite;
  - exporta a JSON como formato de rescate independiente del esquema: si un día
    el .db no se puede abrir, el JSON sigue siendo legible.
"""
import json
import shutil
import sqlite3
from datetime import date, datetime
from pathlib import Path

from database import DB_PATH
from tz import now as _now

BACKUP_DIR = Path(DB_PATH).parent / "backups"
KEEP_AUTO = 7  # una semana de respaldos automáticos


def _ts() -> str:
    return _now().strftime("%Y%m%d-%H%M%S")


def snapshot(tag: str = "manual") -> Path:
    """Copia consistente de la base, aunque haya conexiones abiertas."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dest = BACKUP_DIR / f"grimoire-{tag}-{_ts()}.db"
    src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)  # snapshot atómico
        finally:
            dst.close()
    finally:
        src.close()
    return dest


def rotate(keep: int = KEEP_AUTO) -> int:
    """Conserva los `keep` automáticos más recientes. Los manuales no se tocan."""
    if not BACKUP_DIR.exists():
        return 0
    autos = sorted(BACKUP_DIR.glob("grimoire-auto-*.db"), key=lambda p: p.name, reverse=True)
    removed = 0
    for old in autos[keep:]:
        try:
            old.unlink()
            removed += 1
        except OSError:
            pass
    return removed


def daily_backup_if_needed() -> Path | None:
    """Un respaldo automático por día, al arrancar. Sin intervención del usuario."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    today = _now().strftime("%Y%m%d")
    if any(p.name.startswith(f"grimoire-auto-{today}") for p in BACKUP_DIR.glob("*.db")):
        return None
    path = snapshot("auto")
    rotate()
    return path


def list_backups() -> list[dict]:
    if not BACKUP_DIR.exists():
        return []
    out = []
    for p in sorted(BACKUP_DIR.glob("grimoire-*.db"), key=lambda x: x.name, reverse=True):
        st = p.stat()
        out.append({
            "filename": p.name,
            "kind": "auto" if "-auto-" in p.name else "manual",
            "size_kb": round(st.st_size / 1024, 1),
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        })
    return out


def export_json() -> dict:
    """Vuelca todas las tablas. Formato de rescate legible sin la app."""
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        tables = [r[0] for r in con.execute(
            "select name from sqlite_master where type='table' and name not like 'sqlite_%'"
        )]
        data = {t: [dict(r) for r in con.execute(f"select * from {t}")] for t in tables}
    finally:
        con.close()
    return {
        "app": "Grimoire",
        "exported_at": _now().isoformat(timespec="seconds"),
        "source_db": str(DB_PATH),
        "tables": {t: len(rows) for t, rows in data.items()},
        "data": data,
    }


def validate_backup(path: Path) -> tuple[bool, str]:
    """Comprueba que el archivo es una base de Grimoire antes de restaurar."""
    if not path.exists():
        return False, "El archivo de respaldo no existe."
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            names = {r[0] for r in con.execute(
                "select name from sqlite_master where type='table'"
            )}
            if con.execute("pragma integrity_check").fetchone()[0] != "ok":
                return False, "El respaldo está corrupto (falla integrity_check)."
        finally:
            con.close()
    except sqlite3.Error as e:
        return False, f"No es una base SQLite válida: {e}"
    faltan = {"users", "habits", "diary_entries"} - names
    if faltan:
        return False, f"No parece una base de Grimoire (faltan tablas: {', '.join(sorted(faltan))})."
    return True, "ok"


def restore(filename: str) -> dict:
    """Restaura un respaldo. Antes guarda una copia de seguridad del estado actual,
    para que la propia restauración nunca sea el punto de no retorno."""
    src = BACKUP_DIR / filename
    if src.resolve().parent != BACKUP_DIR.resolve():
        raise ValueError("Ruta de respaldo inválida.")
    ok, msg = validate_backup(src)
    if not ok:
        raise ValueError(msg)
    safety = snapshot("pre-restore")
    shutil.copy2(src, DB_PATH)
    for suffix in ("-wal", "-shm"):  # pertenecen a la base anterior
        stale = Path(str(DB_PATH) + suffix)
        if stale.exists():
            try:
                stale.unlink()
            except OSError:
                pass
    return {"restored": filename, "safety_copy": safety.name}
