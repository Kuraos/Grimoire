/**
 * Cifra del peldaño de 34px con su rótulo debajo. Sin caja.
 *
 * Estadísticas y Hábitos tenían cada una la suya, idénticas salvo por el sufijo
 * opcional del porcentaje. El `%` va a 24px y no a 34: al mismo tamaño pesaba
 * como el número y la cifra dejaba de leerse de un golpe.
 *
 * `gold` sólo para lo que se gana. Lo demás es dato, y va en tinta.
 */
export function Figure({ value, label, suffix, gold }: {
  value: string;
  label: string;
  suffix?: string;
  gold?: boolean;
}) {
  return (
    <div>
      <div className="gr-figure" style={gold ? { color: "var(--gr-gilded)" } : undefined}>
        {value}
        {suffix && <span className="text-xl text-[var(--text-faint)]">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-2xs font-label text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
