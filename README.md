# GRIMOIRE — Personal Life CRM

CRM de vida personal con gamification y estética gótica oscura. 100% local:
React + Vite (frontend), FastAPI + SQLite (backend). Sin servicios externos.

## Requisitos
- Python 3.11+ (probado en 3.14)
- Node.js 18+ y npm

## Arranque

### 1. Backend
```bash
cd grimoire/backend
python -m venv .venv
# Windows:  .venv\Scripts\activate     | macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
El archivo `grimoire.db` se crea automáticamente en `backend/` en el primer
arranque, junto con el usuario por defecto, los 12 logros y hábitos de ejemplo.

### 2. Frontend (otra terminal)
```bash
cd grimoire/frontend
npm install
npm run dev
```

### 3. Abrir
http://localhost:5173

> Las peticiones del frontend van a `/api/*` y Vite las redirige al backend en
> `:8000` (ver `vite.config.ts`). CORS también está habilitado para
> `http://localhost:5173`.

## Resetear datos
Detén uvicorn, elimina `backend/grimoire.db` y vuelve a arrancar.

## Estructura
- `backend/` — FastAPI app, modelos SQLAlchemy async, routers por módulo,
  evaluador de logros, sistema de XP/niveles.
- `frontend/` — React 18 + TypeScript + Tailwind. 9 vistas: Dashboard, Hábitos,
  Tareas, Pomodoro, Calendario, Diario, Estadísticas, Logros, Revisión semanal.

## Sistema de XP
- Nivel = ⌊√(xp/100)⌋. XP para nivel N = N²·100.
- Bonus de racha (×1.10 a ×1.75) aplicado a hábitos según días consecutivos.
- Pomodoro 15 XP, diario 5 XP, check-in 5 XP, revisión semanal 30 XP;
  hábitos y tareas con XP variable.
