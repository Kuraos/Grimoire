import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function XPBarChart({ data }: { data: { date: string; xp: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: "#a49db5", fontSize: 12 }} stroke="#2b2440" />
        <YAxis tick={{ fill: "#a49db5", fontSize: 12 }} stroke="#2b2440" />
        <Tooltip
          cursor={{ fill: "rgba(106,74,144,0.12)" }}
          contentStyle={{ background: "#040308", border: "1px solid #3d3357", borderRadius: 8, fontSize: 12, color: "#f2ede6" }}
        />
        <Bar dataKey="xp" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill="#a98bf0" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
