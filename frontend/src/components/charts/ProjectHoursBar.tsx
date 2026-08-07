import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { chartPalette, TOOLTIP_STYLE } from "../../theme-tokens";

export function ProjectHoursBar({ data }: { data: { project: string; color: string; hours: number }[] }) {
  const c = chartPalette();
  if (!data.length) {
    return <div className="py-8 text-center text-xs text-[var(--text-muted)]">Sin horas de foco registradas.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={{ fill: c.tick, fontSize: 12 }} stroke={c.axis} />
        <YAxis type="category" dataKey="project" width={110} tick={{ fill: c.body, fontSize: 12 }} stroke={c.axis} />
        <Tooltip
          cursor={{ fill: c.arcaneDeep, fillOpacity: 0.55 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${v} h`, "Foco"]}
        />
        <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || c.arcane} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
