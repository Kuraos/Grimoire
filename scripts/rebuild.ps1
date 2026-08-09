# ============================================================
#  Compila el instalador y lo instala, en un solo paso.
#  Cierra Grimoire antes (si no, el .exe queda bloqueado y el build
#  falla con "Acceso denegado"), y lo reabre al terminar.
# ============================================================
param([switch]$NoInstall)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "Cerrando instancias de Grimoire..." -ForegroundColor Cyan
Get-Process | Where-Object { $_.Name -match 'grimoire' } |
    ForEach-Object { try { Stop-Process -Id $_.Id -Force } catch {} }
Start-Sleep -Seconds 2

# Este script es para probar en la propia máquina, así que no genera artefactos
# de updater: firmar es cosa de CI, que publica el release con la clave como
# secreto (ver DESKTOP.md). Sin este override, `tauri build` compila los varios
# minutos completos y sólo entonces pide la clave; y si la encuentra, pide la
# contraseña por consola y se queda colgado para siempre, porque la clave se
# generó sin contraseña y Windows no permite variables de entorno vacías:
# tanto `$env:X = ""` como .NET las borran en vez de dejarlas vacías.
$sinUpdater = Join-Path $env:TEMP "grimoire-build-local.json"
'{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content $sinUpdater -Encoding ascii

Write-Host "Compilando (el sidecar se omite si el backend no cambió)..." -ForegroundColor Cyan
npm run desktop:build -- --config $sinUpdater
if ($LASTEXITCODE -ne 0) { Write-Host "La compilación falló." -ForegroundColor Red; exit 1 }

$setup = Get-ChildItem "$root\src-tauri\target\release\bundle\nsis\*-setup.exe" |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { Write-Host "No se encontró el instalador." -ForegroundColor Red; exit 1 }
Write-Host "Instalador: $($setup.Name)  ($([math]::Round($setup.Length/1MB,1)) MB)" -ForegroundColor Green

if ($NoInstall) { exit 0 }

Write-Host "Instalando en silencio..." -ForegroundColor Cyan
# /S = modo silencioso de NSIS
$p = Start-Process -FilePath $setup.FullName -ArgumentList "/S" -Wait -PassThru
if ($p.ExitCode -ne 0) { Write-Host "El instalador devolvió $($p.ExitCode)." -ForegroundColor Yellow }

$exe = Join-Path $env:LOCALAPPDATA "Grimoire\Grimoire.exe"
if (-not (Test-Path $exe)) { $exe = Join-Path $env:ProgramFiles "Grimoire\Grimoire.exe" }
if (Test-Path $exe) {
    Write-Host "Abriendo Grimoire..." -ForegroundColor Green
    Start-Process $exe
} else {
    Write-Host "Instalado, pero no encontré el ejecutable para abrirlo." -ForegroundColor Yellow
}
