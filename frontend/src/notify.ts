// Thin wrapper around the Notification API. No-ops gracefully when unsupported
// or denied (e.g. inside the Tauri webview without permission).

export function ensureNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notify(title: string, body?: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body, silent: false });
  } catch {
    /* ignore */
  }
}
