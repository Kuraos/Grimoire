import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { IconFlame } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { Card } from "../components/ui/Card";
import { XPBarChart } from "../components/charts/XPBarChart";
import { MoodEnergyLine } from "../components/charts/MoodEnergyLine";
import { ProjectHoursBar } from "../components/charts/ProjectHoursBar";
import { HabitHeatmap } from "../components/charts/HabitHeatmap";
import { CATEGORY_COLORS } from "../utils";
import type { Stats as StatsType } from "../types";

const PERIODS = [
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
];

export default function Stats() {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState<StatsType | null>(null);
  const [catColors, setCatColors] = useState<Record<string, string>>({});

  useEffect(() => {
    Api.stats(period).then(setData).catch(() => {});
  }, [period]);

  // colors come from the user's category catalog (custom ones have their own),
  // falling back to the built-in map for anything not listed
  useEffect(() => {
    Api.listHabitCategories()
      .then((cs) => setCatColors(Object.fromEntries(cs.map((c) => [c.name, c.color]))))
      .catch(() => {});
  }, []);

  const colorFor = (name: string) => catColors[name] ?? CATEGORY_COLORS[name] ?? "var(--gr-arcane)";

  if (!data) return <p className="text-xs text-[var(--text-muted)]">Cargando estadísticas…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="gr-title-module">Estadísticas</h1>
        <div className="ml-auto flex rounded-md border border-[var(--border-accent)] overflow-hidden">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs font-display ${period === p.key ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric value={data.xp_total.toLocaleString()} label="XP total" />
        <Metric value={`${data.habits_completed} · ${data.habits_rate}%`} label="Hábitos" />
        <Metric value={`${data.pomodoro_minutes_total}m`} label="Foco" />
        <Metric value={`${data.tasks_closed}`} label="Tareas cerradas" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="XP diario">
          <XPBarChart data={data.xp_by_day} />
        </Card>
        <Card title="Energía · Ánimo · XP">
          <MoodEnergyLine data={data.mood_energy} />
        </Card>
      </div>

      <Card title="Mapa de consistencia · 12 meses">
        <HabitHeatmap data={data.heatmap} />
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="XP por categoría">
          {data.xp_by_category.length === 0 ? (
            <p className="py-8 text-center text-xs text-[var(--text-muted)]">Sin datos.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.xp_by_category} dataKey="xp" nameKey="category" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {data.xp_by_category.map((d, i) => (
                    <Cell key={i} fill={colorFor(d.category)} stroke="var(--gr-void)" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--gr-surface-sunken)", border: "1px solid var(--gr-edge-strong)", borderRadius: 8, fontSize: 12, color: "var(--gr-ink-bright)" }} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span style={{ color: "var(--gr-ink)" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Horas de foco por proyecto">
          <ProjectHoursBar data={data.hours_by_project} />
        </Card>
      </div>

      <Card title="Rachas actuales más largas">
        {data.top_streaks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Sin hábitos.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {data.top_streaks.map((s) => (
                <tr key={s.name} className="border-b border-[var(--gr-edge)] last:border-none">
                  <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} />{s.name}</td>
                  <td className="py-1.5 text-right tabular text-[var(--purple-main)]"><IconFlame size={12} className="inline" /> {s.streak} días</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="card text-center">
      <div className="font-display text-xl tabular text-[var(--purple-main)]">{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
