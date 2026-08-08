import { ReactNode } from "react";

/**
 * `rank` decide cuánto pesa la card, no sólo cómo se ve:
 *
 *   rubric      lo que el día exige. Una por vista.
 *   leaf        la card estándar (por defecto).
 *   marginalia  cifras de contexto; pierde la caja entera.
 *
 * Antes todas eran `leaf` y el Dashboard leía como un plano de ocho
 * rectángulos idénticos.
 */
export type CardRank = "rubric" | "leaf" | "marginalia";

const RANK_CLASS: Record<CardRank, string> = {
  rubric: "card-rubric",
  leaf: "",
  marginalia: "card-marginalia",
};

export function Card({ title, icon, children, className = "", right, rank = "leaf" }: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
  rank?: CardRank;
}) {
  return (
    <section className={`card ${RANK_CLASS[rank]} ${className}`.replace(/\s+/g, " ").trim()}>
      {title && (
        <div className={`section-title ${rank === "rubric" ? "mb-3" : "mb-2.5"}`}>
          {/* Icono de rótulo, no de estado: en tinta. Era la mayor fuente de
              morado ambiental de la app, y con él encendido el oro no se lee. */}
          {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
          <span>{title}</span>
          {right && <span className="ml-auto normal-case">{right}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
