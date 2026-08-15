import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { chartPalette, CHART_BAR_RADIUS, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";
import { formatMoney, MONTHS_ES, moneyDecimals } from "../../utils";
import type { LedgerStats } from "../../types";

/**
 * Gasto por partida, mes a mes. Barras apiladas: la altura total es el mes y
 * cada tramo su partida, así se ve de una vez si el mes creció y por dónde.
 *
 * Los colores vienen de cada partida (paleta de datos de theme.css). Las cifras
 * del eje se dividen por el exponente de la moneda —el eje habla en unidades
 * mayores— pero el dato sigue siendo entero hasta el último momento.
 */
export function CategoryTrend({ stats }: { stats: LedgerStats }) {
  const c = chartPalette();
  const dec = moneyDecimals(stats.currency);

  const { rows, categories } = useMemo(() => {
    const months = [...new Set(stats.series.map((s) => s.month))].sort();
    const cats = new Map<string, string>();
    stats.series.forEach((s) => cats.set(s.name, s.color));

    const rows = months.map((m) => {
      const row: Record<string, string | number> = { month: m };
      cats.forEach((_, name) => { row[name] = 0; });
      stats.series
        .filter((s) => s.month === m)
        .forEach((s) => { row[s.name] = (row[s.name] as number) + s.total_minor / 10 ** dec; });
      return row;
    });
    return { rows, categories: [...cats.entries()] };
  }, [stats, dec]);

  if (!rows.length) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
        Todavía no hay gasto clasificado que comparar.
      </div>
    );
  }

  const label = (m: string) => {
    const [, mm] = m.split("-").map(Number);
    return MONTHS_ES[mm - 1].slice(0, 3);
  };

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="month"
          tickFormatter={label}
          tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }}
          stroke={c.axis}
        />
        <YAxis
          width={54}
          tick={{ fill: c.tickFaint, fontSize: CHART_LABEL_SIZE }}
          stroke={c.axis}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: c.arcaneDeep, fillOpacity: 0.45 }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(m: string) => label(m)}
          formatter={(v: number, name: string) =>
            [formatMoney(Math.round(v * 10 ** dec), stats.currency), name]}
        />
        <Legend wrapperStyle={{ fontSize: CHART_LABEL_SIZE, color: "var(--gr-ink-dim)" }} />
        {categories.map(([name, color], i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="gasto"
            fill={color || c.arcane}
            // sólo el tramo de arriba lleva radio, o el apilado se ve troceado
            radius={i === categories.length - 1 ? [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
