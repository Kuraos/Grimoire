# ============================================================
#  Empaqueta el backend FastAPI como un .exe (sidecar de Tauri)
#  con PyInstaller y lo copia a src-tauri/binaries con el sufijo
#  del target triple que Tauri espera.
#
#  Se omite si el backend no cambió desde la última vez: PyInstaller
#  tarda ~90s y la mayoría de las compilaciones sólo tocan el frontend.
#  Usa -Force para reconstruir de todas formas.
# ============================================================
param([switch]$Force)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# Tauri busca el sidecar como <nombre>-<target-triple>.exe.
$triple = "x86_64-pc-windows-msvc"
$py     = Join-Path $here ".venv\Scripts\python.exe"
$dest   = Join-Path $here "..\src-tauri\binaries"
$target = Join-Path $dest "grimoire-backend-$triple.exe"
$stamp  = Join-Path $dest ".sidecar-hash"

# --- huella del backend: fuentes + dependencias ---
$files = Get-ChildItem $here -Recurse -Include *.py, requirements.txt |
    Where-Object { $_.FullName -notmatch '\\(\.venv|build|dist|tests|backups|__pycache__)\\' } |
    Sort-Object FullName
$sb = New-Object System.Text.StringBuilder
foreach ($f in $files) { [void]$sb.Append((Get-FileHash $f.FullName -Algorithm SHA256).Hash) }
$hash = (Get-FileHash -InputStream ([IO.MemoryStream]::new(
    [Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -Algorithm SHA256).Hash

if (-not $Force -and (Test-Path $target) -and (Test-Path $stamp) -and
    ((Get-Content $stamp -Raw).Trim() -eq $hash)) {
    Write-Host "Sidecar al día (backend sin cambios). Omitido. Usa -Force para reconstruir."
    exit 0
}

Write-Host "Instalando PyInstaller (si falta)..."
& $py -m pip install --quiet --upgrade pyinstaller

Write-Host "Empaquetando backend con PyInstaller..."
& $py -m PyInstaller --noconfirm --onefile --clean --name grimoire-backend `
    --collect-submodules uvicorn `
    --hidden-import aiosqlite `
    --hidden-import sqlalchemy.dialects.sqlite.aiosqlite `
    run_server.py

New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Un sidecar en marcha (de `tauri dev` o de una prueba) mantiene el .exe bloqueado.
Get-Process "grimoire-backend-$triple" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Copy-Item (Join-Path $here "dist\grimoire-backend.exe") $target -Force
Set-Content -Path $stamp -Value $hash -Encoding ascii

Write-Host "Sidecar listo: $target"
