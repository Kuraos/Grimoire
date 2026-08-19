import { useEffect, useState } from "react";

// Imperative confirm dialog: call `await confirm({...})` from anywhere; a single
// <ConfirmHost/> mounted at the app root renders the gothic modal.

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let setPendingExternal: ((p: Pending | null) => void) | null = null;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setPendingExternal) { resolve(window.confirm(opts.message)); return; }
    setPendingExternal({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => { setPendingExternal = setPending; return () => { setPendingExternal = null; }; }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  if (!pending) return null;
  return (
    <div data-overlay="" className="fixed inset-0 z-[115] flex items-center justify-center bg-[rgba(5,3,8,0.6)]" onClick={() => close(false)}>
      <div
        className="w-[360px] max-w-[90vw] rounded-lg border border-[var(--border-accent)] bg-[var(--bg-deep)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-label text-xs uppercase tracking-[0.12em] text-[var(--purple-main)]">
          {pending.title ?? "Confirmar"}
        </div>
        <p className="mt-2 text-sm text-[var(--text-body)]">{pending.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => close(false)} className="btn">Cancelar</button>
          <button
            onClick={() => close(true)}
            className="btn"
            style={{
              borderColor: pending.danger ? "var(--gr-oxblood-deep)" : "var(--border-accent)",
              color: pending.danger ? "var(--gr-oxblood)" : "var(--purple-main)",
            }}
          >
            {pending.confirmLabel ?? "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
