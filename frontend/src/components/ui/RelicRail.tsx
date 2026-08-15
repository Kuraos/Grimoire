import { IconCheck } from "@tabler/icons-react";
import { formatMoney } from "../../utils";
import type { SavingsGoal } from "../../types";

/**
 * El carril de una reliquia.
 *
 * Es el único sitio del erario, junto al cierre del mes, donde el oro está
 * permitido: una meta de ahorro es algo que el usuario se fijó y cumplió, igual
 * que una misión. Mientras va en camino el progreso es ARCANO —estado del
 * sistema, no recompensa— y sólo se vuelve dorado al llegar.
 *
 * Un saldo alto no es oro. Una reliquia alcanzada sí.
 */
export function RelicRail({ goal, currency, onContribute }: {
  goal: SavingsGoal;
  currency: string;
  onContribute?: (goal: SavingsGoal) => void;
}) {
  const done = goal.achieved_at !== null;
  const pct = Math.max(0, Math.min(100, (goal.saved_minor / goal.target_minor) * 100));
  const left = goal.target_minor - goal.saved_minor;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-[var(--text-body)]">
          {done
            ? <IconCheck size={12} className="text-[var(--gr-gilded)]" />
            : <span className="inline-block h-2 w-2 rounded-xs" style={{ background: goal.color }} />}
          {goal.name}
        </span>
        <span className="tabular whitespace-nowrap text-[var(--text-muted)]">
          <span className={`font-semibold ${done ? "text-[var(--gr-gilded-bright)]" : "text-[var(--text-primary)]"}`}>
            {formatMoney(goal.saved_minor, currency)}
          </span>
          {" / "}
          {formatMoney(goal.target_minor, currency)}
        </span>
      </div>
      <div className="h-[7px] w-full overflow-hidden rounded-xs bg-[var(--bg-elevated)]"
           role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
           aria-label={`${goal.name}: ${formatMoney(goal.saved_minor, currency)} de ${formatMoney(goal.target_minor, currency)}`}>
        <div
          className="h-full rounded-xs"
          style={{
            width: `${pct}%`,
            background: done ? "var(--gr-gilded)" : "var(--gr-arcane)",
          }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-2xs">
        {done ? (
          <span className="text-[var(--gr-gilded)]">Reliquia obtenida</span>
        ) : (
          <span className="tabular text-[var(--text-muted)]">
            Faltan {formatMoney(left, currency)}
            {goal.deadline ? ` · antes del ${goal.deadline}` : ""}
          </span>
        )}
        {onContribute && !done && (
          <button
            className="text-[var(--purple-main)] hover:underline"
            onClick={() => onContribute(goal)}
          >
            Aportar
          </button>
        )}
      </div>
    </div>
  );
}
