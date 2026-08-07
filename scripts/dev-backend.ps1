# Backend en modo desarrollo, con recarga automática al guardar un .py.
# Se ejecuta desde un script (y no inline en package.json) porque npm lanza
# los scripts con cmd.exe, que no resuelve rutas con barras hacia adelante.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = Join-Path $root "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
    Write-Host "No encuentro el entorno virtual en backend\.venv" -ForegroundColor Red
    exit 1
}

# libera el puerto si quedó algo de una ejecución anterior
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force } catch {} }

Set-Location (Join-Path $root "backend")
& $py -m uvicorn main:app --reload --port 8000
