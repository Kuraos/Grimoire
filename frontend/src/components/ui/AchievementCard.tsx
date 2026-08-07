import type { Achievement } from "../../types";
import { TablerIcon } from "../TablerIcon";
import { TIER_META } from "../../utils";

/**
 * Ley del acento: un logro desbloqueado es recompensa, así que el icono va en
 * dorado. El color de rareza se queda en el borde, el resplandor y la etiqueta
 * de tier —eso es un dato (cuán raro), no un estado del sistema.
 *
 * El nombre pasa de 13px Inter a 24px Cinzel: era el peldaño más bajo de la
 * escala, indistinguible de una etiqueta de formulario, en la vista donde vive
 * toda la recompensa de la app.
 */
export function AchievementCard({ a }: { a: Achievement }) {
  const tier = TIER_META[a.tier] ?? TIER_META.common;
  return (
    <div
      className="card flex flex-col items-center gap-2.5 text-center transition-opacity"
      style={{
        // 0.42 dejaba el texto del logro bloqueado en 3.4:1, por debajo de AA.
        opacity: a.unlocked ? 1 : 0.62,
        filter: a.unlocked ? "none" : "grayscale(1)",
        borderColor: a.unlocked ? tier.color : "var(--border)",
        boxShadow: a.unlocked && a.tier !== "common" ? `0 0 14px ${tier.glow}` : "none",
      }}
    >
      <div
        className="mt-1 flex h-14 w-14 items-center justify-center rounded-full"
        style={
          a.unlocked
            ? {
                background: "radial-gradient(circle at 34% 28%, var(--gr-gilded-deep), var(--gr-surface))",
                color: "var(--gr-gilded-bright)",
                border: "1px solid var(--gr-gilded)",
                boxShadow: "0 0 18px -4px rgba(220,174,92,0.55), inset 0 0 10px rgba(220,174,92,0.16)",
              }
            : {
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }
        }
      >
        <TablerIcon name={a.icon} size={26} />
      </div>

      <div className="font-display text-xl leading-tight text-[var(--text-primary)] [text-wrap:balance]">
        {a.name}
      </div>

      <div
        className="font-label text-2xs uppercase tracking-[0.24em]"
        style={{ color: tier.color }}
      >
        {tier.label}
      </div>

      <div className="font-prose text-xs leading-snug text-[var(--text-muted)]">{a.description}</div>

      {a.unlocked ? (
        <div className="w-full border-t border-[var(--gr-edge)] pt-2 font-label text-2xs tracking-[0.1em] text-[var(--success)]">
          Desbloqueado {a.unlocked_at ? new Date(a.unlocked_at).toLocaleDateString() : ""}
        </div>
      ) : (
        <div className="mt-1 w-full">
          {/* En progreso todavía no es recompensa: la barra se queda en tinta. */}
          <div className="h-1.5 overflow-hidden rounded bg-[var(--bg-elevated)]">
            <div className="h-full rounded bg-[var(--text-muted)]" style={{ width: `${Math.round(a.progress * 100)}%` }} />
          </div>
          <div className="mt-1 text-2xs tabular text-[var(--text-faint)]">{Math.round(a.progress * 100)}%</div>
        </div>
      )}
    </div>
  );
}
