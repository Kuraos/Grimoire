/**
 * Centralized fetch wrapper.
 * - In dev (vite), requests go through `/api`, which Vite proxies to :8000.
 * - In the packaged desktop build (Tauri), there is no proxy, so we talk to the
 *   FastAPI sidecar directly on 127.0.0.1:8000.
 * Connection failures are surfaced via a global listener so the UI can show a
 * "Sin conexión" banner without crashing.
 */
export const BASE = import.meta.env.DEV ? "/api" : "http://127.0.0.1:8000";

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let online = true;

export function onConnectionChange(cb: Listener) {
  listeners.add(cb);
  cb(online);
  return () => {
    listeners.delete(cb);
  };
}

type ErrorListener = (message: string) => void;
const errorListeners = new Set<ErrorListener>();

export function onApiError(cb: ErrorListener) {
  errorListeners.add(cb);
  return () => {
    errorListeners.delete(cb);
  };
}

function emitError(message: string) {
  errorListeners.forEach((l) => l(message));
}

function setOnline(value: boolean) {
  if (value !== online) {
    online = value;
    listeners.forEach((l) => l(online));
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    setOnline(true);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail ?? detail;
      } catch {
        /* ignore */
      }
      // 4xx that aren't validation noise are worth surfacing
      if (res.status >= 500 || res.status === 400 || res.status === 404) {
        emitError(detail);
      }
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // network-level failure → backend is down
    setOnline(false);
    emitError("Sin conexión con el servidor");
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
