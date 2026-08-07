import { useEffect, useRef } from "react";
import { Api } from "../api/endpoints";
import { notify } from "../notify";

/**
 * Polls incomplete tasks and fires a browser notification when a task's
 * remind_at time arrives. Each task is notified at most once per session.
 */
export function useReminders() {
  const notified = useRef<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const tasks = await Api.listTasks("?completed=false");
        const now = Date.now();
        for (const t of tasks) {
          if (!t.remind_at || notified.current.has(t.id)) continue;
          const due = new Date(t.remind_at).getTime();
          if (due <= now && now - due < 24 * 3600 * 1000) {
            notified.current.add(t.id);
            notify("⏳ Recordatorio", t.title);
          }
        }
      } catch {
        /* offline */
      }
    };

    check();
    const id = setInterval(() => alive && check(), 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
}
