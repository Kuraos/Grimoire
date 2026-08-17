import type { Achievement } from "../../types";
import { TablerIcon } from "../TablerIcon";
import { TIER_META } from "../../utils";
import { tracery } from "../../polar";

/**
 * Ley del acento: un logro desbloqueado es recompensa, así que el icono va en
 * dorado. El color de rareza se queda en el borde, el resplandor y la etiqueta
 * de tier —eso es un dato (cuán raro), no un estado del sistema.
 *
 * El nombre pasa de 13px Inter a 24px Cinzel: era el peldaño más bajo de la
 * escala, indistinguible de una etiqueta de formulario, en la vista donde vive
 * toda la recompensa de la app.
 *
 * El nudo de esquina es la única excepción a «un oro por vista»: aquí el oro no
 * marca jerarquía sino estado, igual que el icono. Una rejilla de veinte
 * tarjetas donde sólo una llevara el nudo dorado diría que esa es la más
 * importante, y lo que hay que poder leer de un vistazo es cuáles se ganaron.
 */
export function AchievementCard({ a }: { a: Achievement }) {
  const tier = TIER_META[a.tier] ?? TIER_META.common;
  return (
    <div
      className="card flex items-start gap-3 transition-opacity"
      style={{
        // 0.42 dejaba el texto del logro bloqueado en 3.4:1, por debajo de AA.
        opacity: a.unlocked ? 1 : 0.62,
        filter: a.unlocked ? "none" : "grayscale(1)",
        borderColor: a.unlocked ? tier.color : "var(--border)",
        boxShadow: a.unlocked && a.tier !== "common" ? `0 0 14px ${tier.glow}` : "none",
      }}
    >
      <span
        className={`gr-nudo ${a.unlocked ? "gr-nudo--oro" : "gr-nudo--tinta"}`}
        style={a.unlocked ? undefined : { opacity: 0.35 }}
      />

      {/* El medallón: anillo en el color de la rareza y, sólo si está obtenido,
          una tracería de seis puntas alrededor. Un logro bloqueado tiene el
          mismo icono pero no la orla — la diferencia entre saber qué es y
          haberlo conseguido se ve sin leer la fecha. */}
      <span className="relative grid h-[46px] w-[46px] shrink-0 place-items-center">
        <svg width="46" height="46" viewBox="0 0 46 46" fill="none" className="absolute inset-0">
          {a.unlocked && (
            <path d={MEDALLION} stroke={tier.color} strokeOpacity="0.5" strokeWidth="0.9"
                  strokeLinejoin="round" />
          )}
          <circle cx="23" cy="23" r="17"
                  stroke={a.unlocked ? tier.color : "var(--gr-edge)"} strokeWidth="1" />
        </svg>
        <span style={{ color: a.unlocked ? "var(--gr-gilded-bright)" : "var(--text-muted)" }}>
          <TablerIcon name={a.icon} size={18} />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="font-display text-base leading-tight text-[var(--text-primary)] [text-wrap:balance]">
          {a.name}
        </div>
        <div className="mt-0.5 font-label text-2xs uppercase tracking-[0.2em]" style={{ color: tier.color }}>
          {tier.label}
        </div>
        <div className="mt-1.5 text-xs leading-snug text-[var(--text-muted)] [text-wrap:pretty]">
          {a.description}
        </div>

        <div className="mt-2">
          {a.unlocked ? (
            <span className="font-label text-2xs tracking-[0.1em] text-[var(--purple-main)]">
              {a.unlocked_at
                ? new Date(a.unlocked_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()
                : "DESBLOQUEADO"}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              {/* En progreso todavía no es recompensa: la barra va en el color
                  de la rareza a media opacidad, nunca en oro. */}
              <span className="h-[5px] flex-1 overflow-hidden rounded-sm border border-[var(--gr-edge)] bg-[var(--gr-surface-sunken)]">
                <span className="block h-full rounded-sm"
                      style={{ width: `${Math.round(a.progress * 100)}%`, background: tier.color, opacity: 0.75 }} />
              </span>
              <span className="shrink-0 tabular text-2xs font-semibold text-[var(--text-faint)]">
                {Math.round(a.progress * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Seis puntas alrededor del icono. Sólo la lleva un logro obtenido: es la
 *  misma tracería del panel «el más cercano», a otro tamaño y otro recuento. */
const MEDALLION = tracery(23, 19, 22, 6);
