import type { Achievement } from "../../types";
import { TablerIcon } from "../TablerIcon";
import { TIER_META } from "../../utils";

export function AchievementCard({ a }: { a: Achievement }) {
  const tier = TIER_META[a.tier] ?? TIER_META.common;
  return (
    <div
      className="card flex flex-col items-center gap-2 text-center transition-opacity"
      style={{
        // 0.42 dejaba el texto del logro bloqueado en 3.4:1, por debajo de AA.
        opacity: a.unlocked ? 1 : 0.62,
        filter: a.unlocked ? "none" : "grayscale(1)",
        borderColor: a.unlocked ? tier.color : "var(--border)",
        boxShadow: a.unlocked && a.tier !== "common" ? `0 0 14px ${tier.glow}` : "none",
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{
          background: a.unlocked ? "var(--purple-deep)" : "var(--bg-elevated)",
          color: a.unlocked ? "var(--gr-arcane-bright)" : "var(--text-muted)",
          border: a.unlocked ? `0.5px solid ${tier.color}` : "none",
        }}
      >
        <TablerIcon name={a.icon} size={26} />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="font-label text-sm text-[var(--text-primary)]">{a.name}</div>
      </div>
      <div
        className="rounded-full px-1.5 py-0.5 font-label text-xs uppercase tracking-[0.1em]"
        style={{ color: tier.color, border: `0.5px solid ${tier.color}` }}
      >
        {tier.label}
      </div>
      <div className="text-xs leading-snug text-[var(--text-muted)]">{a.description}</div>
      {a.unlocked ? (
        <div className="text-xs italic text-[var(--success)]">
          Desbloqueado {a.unlocked_at ? new Date(a.unlocked_at).toLocaleDateString() : ""}
        </div>
      ) : (
        <div className="mt-1 w-full">
          <div className="h-1.5 overflow-hidden rounded bg-[var(--bg-elevated)]">
            <div className="h-full rounded bg-[var(--purple-muted)]" style={{ width: `${Math.round(a.progress * 100)}%` }} />
          </div>
          <div className="mt-0.5 text-xs tabular text-[var(--text-faint)]">{Math.round(a.progress * 100)}%</div>
        </div>
      )}
    </div>
  );
}
