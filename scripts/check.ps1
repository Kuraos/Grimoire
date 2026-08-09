# ============================================================
#  Verificación completa antes de publicar: tipos, tests y build.
#  Hace de "CI local" mientras el proyecto no esté en un repositorio
#  con GitHub Actions. Devuelve código != 0 si algo falla.
# ============================================================
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$fails = @()

function Step($name, $block) {
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
    & $block
    if ($LASTEXITCODE -ne 0) { $script:fails += $name; Write-Host "  FALLÓ" -ForegroundColor Red }
    else { Write-Host "  OK" -ForegroundColor Green }
}

Step "TypeScript (tsc --noEmit)" {
    Set-Location "$root\frontend"; npx tsc --noEmit
}
Step "Tests de frontend (vitest)" {
    Set-Location "$root\frontend"; npx vitest run
}
Step "Tests de backend (pytest)" {
    Set-Location "$root\backend"; & ".\.venv\Scripts\python.exe" -m pytest tests/ -q
}
Step "Build de producción (vite)" {
    Set-Location "$root\frontend"; npm run build
}

Set-Location $root
Write-Host ""
if ($fails.Count -eq 0) {
    Write-Host "TODO EN VERDE" -ForegroundColor Green
    exit 0
} else {
    Write-Host ("FALLARON: " + ($fails -join ", ")) -ForegroundColor Red
    exit 1
}
