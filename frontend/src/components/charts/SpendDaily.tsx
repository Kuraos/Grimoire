import { useMemo } from "react";
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { chartPalette, CHART_BAR_RADIUS, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";
import { formatMoney, moneyDecimals } from "../../utils";

/**
 * El gasto día a día del mes, en barras.
 *
 * Era un mapa de calor de veintisiete semanas. Un heatmap contesta «¿qué días
 * gasté?» pero no «¿cuánto?»: la intensidad de una celda de 11px no se compara
 * con la de otra a diez columnas de distancia, y la pregunta que se hace alguien
 * mirando el mes es justamente cuál fue el día caro y por cuánto. En barras eso
 * se lee de un vistazo y además se puede sumar con la mirada.
 *
 * Las barras van en ÁMBAR, no en dorado ni en arcano. Es la misma razón por la
 * que la rampa del heatmap terminaba en ámbar: más gasto no es mejor, y una
 * barra dorada premiaría el día que peor salió. El ámbar es advertencia, que es
 * lo que un pico de gasto es.
 */
export function SpendDaily({ data, currency, month }: {
  data: { date: string; expense_minor: number }[];
  currency: string;
  /** "2026-08". Sin él, el mes en curso. */
  month?: string;
}) {
  const c = chartPalette();
  const dec = moneyDecimals(currency);

  const rows = useMemo(() => {
    const key = month ?? new Date().toISOString().slice(0, 7);
    const [y, m] = key.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const map = new Map(data.map((d) => [d.date, d.expense_minor]));
    // Todos los días del mes, también los de cero: los huecos son parte del
    // dibujo. Con sólo los días con gasto, un mes de tres compras parecía
    // continuo y no se veía que fueron tres.
    return Array.from({ length: days }, (_, i) => {
      const iso = `${key}-${String(i + 1).padStart(2, "0")}`;
      return { day: i + 1, iso, gasto: (map.get(iso) ?? 0) / 10 ** dec };
    });
  }, [data, month, dec]);

  const max = Math.max(...rows.map((r) => r.gasto));
  if (max <= 0) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
        Ningún gasto anotado este mes.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis
          dataKey="day"
          stroke={c.axis}
          tick={{ fill: c.tickFaint, fontSize: CHART_LABEL_SIZE }}
          /* Un rótulo por semana: treinta y un números seguidos a 11px se
             solapan y dejan de leerse. */
          ticks={[1, 8, 15, 22, 31]}
          interval={0}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "var(--gr-surface-raised)", opacity: 0.4 }}
          labelFormatter={(d) => `Día ${d}`}
          formatter={(v: number) => [formatMoney(Math.round(v * 10 ** dec), currency), "Gasto"]}
        />
        <Bar dataKey="gasto" radius={CHART_BAR_RADIUS}>
          {rows.map((r) => (
            /* El día más caro del mes se marca en oxblood: no es que gastar sea
               malo, es que ese día merece una mirada. El resto, ámbar. */
            <Cell key={r.iso} fill={r.gasto === max ? c.oxblood : c.amber} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
