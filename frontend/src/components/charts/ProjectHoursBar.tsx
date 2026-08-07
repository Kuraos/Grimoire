import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function ProjectHoursBar({ data }: { data: { project: string; color: string; hours: number }[] }) {
  if (!data.length) {
    return <div className="py-8 text-center text-xs text-[var(--text-muted)]">Sin horas de foco registradas.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={{ fill: "#a49db5", fontSize: 12 }} stroke="#2b2440" />
        <YAxis type="category" dataKey="project" width={110} tick={{ fill: "#d2cbdb", fontSize: 12 }} stroke="#2b2440" />
        <Tooltip
          cursor={{ fill: "rgba(106,74,144,0.12)" }}
          contentStyle={{ background: "#040308", border: "1px solid #3d3357", borderRadius: 8, fontSize: 12, color: "#f2ede6" }}
          formatter={(v: number) => [`${v} h`, "Foco"]}
        />
        <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || "#a98bf0"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
