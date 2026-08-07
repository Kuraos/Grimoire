/**
 * Actualización automática — sólo en la app de escritorio.
 *
 * Grimoire también corre en el navegador (`npm run dev:browser`), donde el
 * puente de Tauri no existe. Por eso todo módulo de Tauri se carga con
 * import() dinámico detrás de isDesktop(): un import estático se evaluaría al
 * arrancar el bundle web y reventaría al no encontrar `__TAURI_INTERNALS__`.
 *
 * El binario verifica la firma minisign de cada actualización contra la clave
 * pública de tauri.conf.json antes de instalar nada. Un endpoint comprometido
 * no basta para colar un instalador: haría falta también la clave privada.
 */
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; notes?: string }
  | { phase: "uptodate" }
  | { phase: "downloading"; percent: number | null }
  | { phase: "installing" }
  | { phase: "error"; message: string };

/** ¿Corremos dentro de la ventana de Tauri (y no en un navegador)? */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Consulta el endpoint. Devuelve null si no hay nada nuevo o si no estamos
 * en escritorio. Propaga el error para que quien llame decida si avisar.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isDesktop()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return await check();
}

/**
 * Descarga, instala y reinicia. Sólo debe llamarse tras confirmación explícita
 * del usuario: reinicia la aplicación.
 */
export async function applyUpdate(
  update: Update,
  onState: (s: UpdateState) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  onState({ phase: "downloading", percent: 0 });
  await update.download((e) => {
    if (e.event === "Started") {
      total = e.data.contentLength ?? null;
    } else if (e.event === "Progress") {
      downloaded += e.data.chunkLength;
      onState({
        phase: "downloading",
        percent: total ? Math.round((downloaded / total) * 100) : null,
      });
    }
  });

  onState({ phase: "installing" });

  // El instalador sobrescribe grimoire-backend-*.exe. En Windows un proceso
  // vivo mantiene su ejecutable bloqueado, así que hay que apagar el sidecar
  // o la instalación falla a medio aplicar. Se hace aquí —con la descarga ya
  // terminada— para no dejar la app sin backend más tiempo del necesario.
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shutdown_backend");

  await update.install();

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
