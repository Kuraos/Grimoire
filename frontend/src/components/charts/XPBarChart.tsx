import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { chartPalette, CHART_BAR_RADIUS, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";

export function XPBarChart({ data }: { data: { date: string; xp: number }[] }) {
  const c = chartPalette();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }} stroke={c.axis} />
        <YAxis tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }} stroke={c.axis} />
        <Tooltip
          cursor={{ fill: c.arcaneDeep, fillOpacity: 0.55 }}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="xp" radius={[CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={c.arcane} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
