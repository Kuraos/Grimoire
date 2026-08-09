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
          {/* El texto del título lleva clase propia: la rúbrica le pone Cinzel,
              y sin este gancho la regla alcanzaba a toda la fila —incluido
              `right`— y las cifras salían en display con tracking de versalita. */}
          <span className="section-title-text">{title}</span>
          {/* En la rúbrica la cifra acompaña al título en vez de irse al borde:
              a 250px de distancia leían como dos cosas, no como una. */}
          {right && (
            <span className={`normal-case ${rank === "rubric" ? "ml-3" : "ml-auto"}`}>{right}</span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
