import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved";

/**
 * Debounced auto-save. Calls `save` `delay` ms after the last change.
 *
 * - `pending` (changes queued) is distinct from `saving` (request in flight), so
 *   the UI doesn't claim to be saving while it's only waiting.
 * - Pending edits are flushed on unmount, so navigating away doesn't drop them.
 * - `markSaved(v)` re-baselines when the caller loads a different document
 *   (e.g. another diary date), preventing a spurious save of unchanged content.
 */
export function useAutoSave(value: string, save: (v: string) => Promise<void>, delay = 30_000) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  const baseline = useRef(value);
  const saveRef = useRef(save);
  latest.current = value;
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (latest.current === baseline.current) return; // nothing pending
    const toSave = latest.current;
    setStatus("saving");
    try {
      await saveRef.current(toSave);
      baseline.current = toSave;
      setSavedAt(new Date());
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }, []);

  const markSaved = useCallback((v: string) => {
    baseline.current = v;
    latest.current = v;
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (value === baseline.current) return; // unchanged → don't schedule anything
    setStatus("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, delay, flush]);

  // don't lose queued edits when the view unmounts
  useEffect(() => () => { void flush(); }, [flush]);

  return { status, savedAt, saveNow: flush, markSaved };
}
