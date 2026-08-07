import { IconX } from "@tabler/icons-react";
import { useApp } from "../../context";
import { TablerIcon } from "../TablerIcon";

export function ToastAchievement() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const error = t.variant === "error";
        return (
        <div
          key={t.id}
          className="toast-enter pointer-events-auto flex w-72 items-center gap-3 rounded-lg px-3 py-2.5"
          style={{ background: "var(--bg-deep)", border: `0.5px solid ${error ? "var(--gr-edge-danger)" : "var(--gr-gilded-deep)"}` }}
        >
          {/* Un toast no-error siempre anuncia algo ganado: XP, logro, vida. */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
               style={{ background: error ? "var(--gr-oxblood-deep)" : "var(--gr-gilded-deep)", color: error ? "var(--gr-oxblood)" : "var(--gr-gilded-bright)" }}>
            <TablerIcon name={t.icon ?? "trophy"} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-label text-xs text-[var(--text-muted)]">{t.title}</div>
            <div className="truncate text-sm text-[var(--text-primary)]">{t.body}</div>
          </div>
          <button onClick={() => dismissToast(t.id)} className="text-[var(--text-faint)] hover:text-[var(--text-body)]">
            <IconX size={14} />
          </button>
        </div>
        );
      })}
    </div>
  );
}
