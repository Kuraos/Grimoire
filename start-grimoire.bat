@echo off
REM ============================================================
REM  Grimoire - arranque de un clic (backend + frontend)
REM  Doble clic en este archivo para iniciar la aplicacion.
REM ============================================================

echo Iniciando Grimoire...

REM --- Backend (FastAPI en el puerto 8000) ---
cd /d "%~dp0backend"
start "Grimoire Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --port 8000"

REM --- Frontend (Vite en el puerto 5173) ---
cd /d "%~dp0frontend"
start "Grimoire Frontend" cmd /k "npm run dev"

REM --- Esperar a que levanten y abrir el navegador ---
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Grimoire esta arrancando. Se abriran dos ventanas (backend y frontend).
echo Para detener la app: cierra esas dos ventanas.
echo Esta ventana se puede cerrar.
