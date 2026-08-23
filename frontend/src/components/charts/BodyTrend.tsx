import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { chartPalette, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";
import { BODY_METRIC_MILLI } from "../../utils";
import type { BodyMetricSeries } from "../../types";

/**
 * La tendencia de una medida del cuerpo.
 *
 * Dos líneas y ningún color: el dato crudo en tinta tenue, la tendencia en tinta
 * brillante. **Ni verdigrís ni oxblood, ni flechas de subida y bajada.** Un peso
 * que baja no es «bien» y uno que sube no es «mal»: pintarlos de éxito o de
 * peligro convertiría el cuerpo en un marcador, que es exactamente el incentivo
 * perverso que este módulo evita. Aquí no hay oro, ni racha, ni logro.
 *
 * Y no es una gráfica de una línea porque la pregunta no es «¿cuánto peso hoy?»
 * sino «¿esto baja o es ruido?». El peso corporal oscila un kilo entre la mañana
 * y la noche por razones que no tienen nada que ver con entrenar; la media móvil
 * de cuatro medidas es lo único que contesta la pregunta de verdad.
 */
export function BodyTrend({ series }: { series: BodyMetricSeries }) {
  const c = chartPalette();

  if (series.points.length < 3) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
        {series.points.length === 0
          ? "Sin medidas anotadas."
          : "Una tendencia necesita tres puntos."}
      </div>
    );
  }

  const rows = series.points.map((p) => ({
    date: p.measured_on.slice(5),
    valor: p.value_milli / BODY_METRIC_MILLI,
    tendencia: p.trend_milli / BODY_METRIC_MILLI,
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            stroke={c.axis}
            tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }}
            minTickGap={30}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fill: c.tickFaint, fontSize: CHART_LABEL_SIZE }}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name) => [
              `${v.toFixed(1)} ${series.unit}`,
              name === "valor" ? "Medida" : "Tendencia",
            ]}
          />
          <Line
            type="monotone" dataKey="valor" stroke={c.tickFaint} strokeWidth={1}
            strokeOpacity={0.55} dot={{ r: 1.8, fill: c.tickFaint, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="tendencia" stroke={c.ink} strokeWidth={2}
            dot={false} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-10 text-2xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4" style={{ background: "var(--gr-ink-bright)" }} />
          Tendencia (media de 4)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 opacity-55" style={{ background: "var(--text-faint)" }} />
          Medida anotada
        </span>
      </div>
    </>
  );
}
