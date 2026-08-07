import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export function MoodEnergyLine({ data }: {
  data: { date: string; energy: number; mood: number; xp: number }[];
}) {
  if (!data.length) {
    return <div className="py-8 text-center text-xs text-[var(--text-muted)]">Sin check-ins en el período.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: "#a49db5", fontSize: 12 }} stroke="#2b2440" />
        <YAxis yAxisId="left" domain={[0, 5]} tick={{ fill: "#a49db5", fontSize: 12 }} stroke="#2b2440" />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#8a8399", fontSize: 12 }} stroke="#2b2440" />
        <Tooltip contentStyle={{ background: "#040308", border: "1px solid #3d3357", borderRadius: 8, fontSize: 12, color: "#f2ede6" }} />
        {/* recharts colorea la etiqueta con el color de la serie (aquí muy oscuro):
            el formatter la fuerza a tinta legible sin perder el swatch de color. */}
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: "#d2cbdb" }}>{value}</span>}
        />
        <Area yAxisId="right" dataKey="xp" name="XP" fill="#1e1236" stroke="#3b2a6e" fillOpacity={0.4} />
        <Line yAxisId="left" dataKey="energy" name="Energía" stroke="#a98bf0" strokeWidth={2} dot={false} />
        <Line yAxisId="left" dataKey="mood" name="Ánimo" stroke="#5aa885" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
