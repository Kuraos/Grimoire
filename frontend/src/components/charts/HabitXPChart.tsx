import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { chartPalette, TOOLTIP_STYLE } from "../../theme-tokens";

/**
 * Cumulative XP over time for a single habit. `series` comes from the backend's
 * xp_log (exact amounts, including streak multipliers and undo reversals).
 */
export function HabitXPChart({ series }: { series: { date: string; xp: number }[] }) {
  const c = chartPalette();
  if (series.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--text-muted)]">Sin datos todavía.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={series} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="habitxp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.arcane} stopOpacity={0.5} />
            <stop offset="100%" stopColor={c.xpFrom} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: c.tick, fontSize: 12 }} stroke={c.axis} />
        <YAxis tick={{ fill: c.tick, fontSize: 12 }} stroke={c.axis} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area dataKey="xp" stroke={c.arcane} strokeWidth={2} fill="url(#habitxp)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
