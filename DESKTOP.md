# Grimoire — App de escritorio (Tauri)

Grimoire se empaqueta como una app de escritorio nativa con [Tauri](https://tauri.app).
El frontend (React/Vite) corre dentro de una ventana WebView2 y el backend FastAPI
viaja **dentro de la app como un "sidecar"**: un ejecutable que Tauri arranca al
abrir y mata al cerrar. No hay que levantar terminales manualmente.

```
┌─ Grimoire.exe (Tauri / Rust) ───────────────┐
│  ventana WebView2  ──►  frontend (dist)      │
│        │  HTTP 127.0.0.1:8000                 │
│        ▼                                      │
│  grimoire-backend.exe (FastAPI sidecar)       │
│        │                                      │
│        ▼  %APPDATA%\Grimoire\grimoire.db      │
└──────────────────────────────────────────────┘
```

## Prerequisitos (instalar una sola vez)

WebView2 ya está en Windows 11. Faltan dos toolchains a nivel de sistema:

1. **Rust** (compila la cáscara Tauri):
   ```powershell
   winget install Rustlang.Rustup
   rustup default stable-msvc
   ```
2. **Microsoft C++ Build Tools** (el linker que necesita Rust en Windows):
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet"
   ```
   (o el instalador de "Visual Studio Build Tools" eligiendo **Desktop development with C++**).

Cierra y reabre la terminal después de instalar para refrescar el PATH.

## Desarrollo — un solo comando, sin recompilar

```powershell
cd C:\Users\jbust\OneDrive\Desktop\Grimoire
npm run dev
```

Levanta las dos mitades y abre la ventana nativa:

| Cambias | Qué pasa | Tiempo |
|---|---|---|
| Frontend (`.tsx`, `.css`) | Vite recarga en caliente | instantáneo |
| Backend (`.py`) | uvicorn `--reload` reinicia solo | ~1 s |
| Rust (`src-tauri/`) | Tauri recompila incremental | segundos |

**No hay que construir el sidecar ni el instalador para iterar.** En modo debug
la app *no* lanza el sidecar de PyInstaller: espera el backend externo con
recarga (ver `main.rs`). Por eso tocar Python ya no obliga a reconstruir nada.

`npm run dev:browser` hace lo mismo pero en el navegador, sin la ventana nativa.

## Verificación (CI local)

```powershell
npm run check
```

Tipos, tests de frontend, tests de backend y build de producción. Devuelve
código ≠ 0 si algo falla, para poder encadenarlo.

## Build de producción (instalable .msi / .exe)

```powershell
npm run desktop:build     # sólo compila
npm run desktop:rebuild   # compila, instala en silencio y reabre la app
```

El sidecar **sólo se reconstruye si cambió el backend** (huella SHA-256 de los
`.py` + `requirements.txt`): omitirlo ahorra ~70 s en las compilaciones que sólo
tocan el frontend. Fuerza la reconstrucción con:

```powershell
powershell -File backend\build_sidecar.ps1 -Force
```

Esto: 1) reconstruye el sidecar, 2) compila el frontend, 3) compila Tauri y
genera el instalador en:

```
src-tauri\target\release\bundle\msi\Grimoire_0.1.0_x64_en-US.msi
src-tauri\target\release\bundle\nsis\Grimoire_0.1.0_x64-setup.exe
```

Instala el `.msi` o `.exe` y tendrás Grimoire en el menú Inicio con su ícono.

## Cómo está organizado

| Pieza | Ubicación |
|------|-----------|
| Config de Tauri | `src-tauri/tauri.conf.json` |
| Código Rust (arranca/mata el sidecar) | `src-tauri/src/main.rs` |
| Capacidades/permisos | `src-tauri/capabilities/default.json` |
| Iconos | `src-tauri/icons/` (regenerar con `npx tauri icon app-icon.png`) |
| Sidecar empaquetado | `src-tauri/binaries/grimoire-backend-x86_64-pc-windows-msvc.exe` |
| Script del sidecar | `backend/build_sidecar.ps1` |
| Entrypoint del backend | `backend/run_server.py` |

## Notas

- **Datos**: en la app empaquetada la BD vive en `%APPDATA%\Grimoire\grimoire.db`.
  En desarrollo web (uvicorn + vite) sigue en `backend\grimoire.db`. Son archivos
  distintos: si quieres migrar tus datos de uno a otro, copia el `.db`.
- **El sidecar hay que reconstruirlo** (`npm run sidecar`) cada vez que cambies
  código del backend de Python.
- El target triple del sidecar está fijado a `x86_64-pc-windows-msvc` en
  `build_sidecar.ps1`. En otra arquitectura, ajústalo al de `rustc -Vv`.
