import { IconSkull, IconFlame } from "@tabler/icons-react";
import { useUser } from "../../context";

export function XPBar({ xpToday, streakBonus }: { xpToday?: number; streakBonus?: number }) {
  const user = useUser();
  if (!user) {
    return <div className="card xp-section">Cargando…</div>;
  }
  const pct = Math.min(100, Math.round((user.xp_into_level / user.xp_span) * 100));
  const hasBonus = streakBonus !== undefined && streakBonus > 1;

  return (
    <div className="card">
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-accent)] bg-[var(--gr-surface-raised)] px-2.5 py-[3px] font-display text-sm text-[var(--purple-main)]">
          <IconSkull size={14} /> Nivel {user.level}
        </div>
        <span className="text-xs italic text-[var(--text-body)]">{user.title}</span>
        {hasBonus && (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-accent)] bg-[var(--purple-deep)] px-2 py-[2px] font-label text-xs text-[var(--gr-arcane-bright)]" title="Bonus de racha activo">
            <IconFlame size={12} /> ×{streakBonus!.toFixed(2)}
          </span>
        )}
        {xpToday !== undefined && (
          <span className="ml-auto text-xs text-[var(--purple-main)]">+{xpToday} XP hoy</span>
        )}
      </div>
      <div className="my-1.5 h-2 overflow-hidden rounded bg-[var(--bg-elevated)]">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--xp-from), var(--xp-to))" }}
        />
      </div>
      <div className="flex justify-between text-xs tabular text-[var(--text-body)]">
        <span>
          {user.xp.toLocaleString()} XP · {user.xp_into_level}/{user.xp_span} al siguiente nivel
        </span>
        <span>Nivel {user.level + 1}</span>
      </div>
    </div>
  );
}
