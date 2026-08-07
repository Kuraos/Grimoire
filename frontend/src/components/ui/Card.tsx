import { ReactNode } from "react";

export function Card({ title, icon, children, className = "", right }: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="section-title mb-2.5">
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
