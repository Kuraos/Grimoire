import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { chartPalette, TOOLTIP_STYLE } from "../../theme-tokens";

export function MoodEnergyLine({ data }: {
  data: { date: string; energy: number; mood: number; xp: number }[];
}) {
  const c = chartPalette();
  if (!data.length) {
    return <div className="py-8 text-center text-xs text-[var(--text-muted)]">Sin check-ins en el período.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: c.tick, fontSize: 12 }} stroke={c.axis} />
        <YAxis yAxisId="left" domain={[0, 5]} tick={{ fill: c.tick, fontSize: 12 }} stroke={c.axis} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: c.tickFaint, fontSize: 12 }} stroke={c.axis} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        {/* recharts colorea la etiqueta con el color de la serie (aquí muy oscuro):
            el formatter la fuerza a tinta legible sin perder el swatch de color. */}
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: "var(--gr-ink)" }}>{value}</span>}
        />
        <Area yAxisId="right" dataKey="xp" name="XP" fill={c.arcaneDeep} stroke={c.xpFrom} fillOpacity={0.4} />
        <Line yAxisId="left" dataKey="energy" name="Energía" stroke={c.arcane} strokeWidth={2} dot={false} />
        <Line yAxisId="left" dataKey="mood" name="Ánimo" stroke={c.verdigris} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
