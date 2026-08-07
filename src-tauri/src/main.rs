// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the FastAPI sidecar process so we can terminate it when the app exits.
struct Backend(Mutex<Option<CommandChild>>);

/// Apaga el sidecar a petición del frontend.
///
/// Es imprescindible antes de aplicar una actualización: en Windows un proceso
/// vivo mantiene su .exe bloqueado, así que el instalador no podría sobrescribir
/// `grimoire-backend-*.exe` y la actualización quedaría aplicada a medias.
/// Por eso el frontend descarga primero, llama aquí, y sólo entonces instala.
#[tauri::command]
fn shutdown_backend(app: tauri::AppHandle) {
    if let Some(child) = app.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![shutdown_backend])
        .setup(|app| {
            // El updater se registra antes del corte de desarrollo para que
            // Ajustes se comporte igual en `tauri dev` y en la app instalada.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // En desarrollo (`tauri dev`) el backend corre aparte con `--reload`.
            // No se lanza el sidecar: así tocar código Python no obliga a
            // reconstruir el .exe con PyInstaller, y no hay choque en el 8000.
            // `GRIMOIRE_EXTERNAL_BACKEND=1` fuerza el mismo comportamiento en release.
            if cfg!(debug_assertions) || std::env::var("GRIMOIRE_EXTERNAL_BACKEND").is_ok() {
                println!("[grimoire] modo desarrollo: se espera un backend externo en 127.0.0.1:8000");
                return Ok(());
            }

            // Launch the bundled Python backend (grimoire-backend sidecar).
            let sidecar = app.shell().sidecar("grimoire-backend")?;
            let (mut rx, child) = sidecar.spawn()?;
            app.state::<Backend>().0.lock().unwrap().replace(child);

            // Pipe the backend's output to the Tauri console for debugging.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            println!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Grimoire")
        .run(|app_handle, event| {
            // Make sure the backend dies with the app.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app_handle.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
