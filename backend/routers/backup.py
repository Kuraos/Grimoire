import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

import backup as svc
from database import engine, DB_PATH
from tz import now as _now

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("")
async def list_backups():
    return {"dir": str(svc.BACKUP_DIR), "backups": svc.list_backups()}


@router.post("", status_code=201)
async def create_backup():
    try:
        p = svc.snapshot("manual")
    except OSError as e:
        raise HTTPException(500, f"No se pudo crear el respaldo: {e}")
    return {"created": p.name, "size_kb": round(p.stat().st_size / 1024, 1),
            "dir": str(svc.BACKUP_DIR)}


@router.get("/export.json")
async def export_json():
    """Archivo de rescate: legible aunque el .db no se pueda abrir."""
    payload = svc.export_json()
    body = json.dumps(payload, ensure_ascii=False, indent=1, default=str)
    stamp = _now().strftime("%Y%m%d-%H%M%S")
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="grimoire-{stamp}.json"'},
    )


@router.get("/export.db")
async def export_db():
    """Snapshot descargable de la base (restaurable copiando el archivo)."""
    try:
        p = svc.snapshot("export")
    except OSError as e:
        raise HTTPException(500, f"No se pudo generar la copia: {e}")
    return FileResponse(p, media_type="application/octet-stream", filename=p.name)


@router.post("/restore/{filename}")
async def restore(filename: str):
    """Reemplaza la base actual por un respaldo. Guarda antes una copia de
    seguridad del estado presente. Requiere reiniciar la app para releerla."""
    try:
        # soltar las conexiones vivas antes de sustituir el archivo
        await engine.dispose()
        result = svc.restore(filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except OSError as e:
        raise HTTPException(500, f"No se pudo restaurar: {e}")
    return {**result, "restart_required": True,
            "message": "Respaldo restaurado. Reinicia Grimoire para cargar los datos."}
