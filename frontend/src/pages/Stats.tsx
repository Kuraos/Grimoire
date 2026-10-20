import { useEffect, useState } from "react";
import { IconFlame } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { Card } from "../components/ui/Card";
import { Figure } from "../components/ui/Figure";
import { SectionBand } from "../components/ui/SectionBand";
import { PageHeader } from "../components/layout/PageHeader";
import { XPBarChart } from "../components/charts/XPBarChart";
import { MoodEnergyLine } from "../components/charts/MoodEnergyLine";
import { ProjectHoursBar } from "../components/charts/ProjectHoursBar";
import { HabitHeatmap } from "../components/charts/HabitHeatmap";
import { CategoryRadar } from "../components/charts/CategoryRadar";
import { CATEGORY_COLORS, streakUnit } from "../utils";
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

  const marks = data.heatmap.reduce((s, d) => s + d.count, 0);
  const vivas = data.top_streaks.filter((s) => s.streak > 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Estadísticas"
        context={`${PERIODS.find((p) => p.key === period)!.label.toLowerCase()} · ${data.xp_total.toLocaleString()} XP · ${data.habits_rate}% de hábitos cumplidos`}
      >
        <div className="flex rounded-md border border-[var(--border-accent)] overflow-hidden">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs font-display ${period === p.key ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Las cuatro cifras y el XP del periodo comparten la rúbrica: son la
          misma pregunta —cuánto llevas— contada en total y en el tiempo.
          Separadas en dos bloques, la fila de cifras leía como una cabecera de
          adorno y las barras como un gráfico más de los cuatro de abajo. */}
      <Card rank="rubric">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Figure value={data.xp_total} label="XP total" gold />
            <Figure value={`${data.habits_completed} · ${data.habits_rate}%`} label="Hábitos" />
            <Figure value={`${data.pomodoro_minutes_total}m`} label="Foco" />
            <Figure value={data.tasks_closed} label="Tareas cerradas" />
          </div>
          <div className="min-w-[280px] flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-label text-xs text-[var(--text-muted)]">XP diario</span>
              <span className="gr-filete" />
              <span className="gr-rombo" />
            </div>
            <XPBarChart data={data.xp_by_day} />
          </div>
        </div>
      </Card>

      {/* Tres paneles en fila, no dos y dos: energía, reparto y foco son la
          misma lectura del periodo vista por tres caras, y en dos filas la
          última quedaba huérfana debajo. Las rachas viven dentro del panel de
          foco porque hablan de lo mismo — sostener. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Energía · Ánimo · XP">
          <MoodEnergyLine data={data.mood_energy} />
          <p className="mt-2 text-2xs italic text-[var(--text-faint)]">
            El XP va en oro porque se gana; energía y ánimo son dato.
          </p>
        </Card>
        <Card title="XP por categoría">
          <CategoryRadar data={data.xp_by_category} colorFor={colorFor} />
        </Card>
        <Card title="Horas de foco" right={
          <span className="normal-case tracking-normal text-2xs text-[var(--text-faint)]">por proyecto</span>
        }>
          <ProjectHoursBar data={data.hours_by_project} />
          <div className="mt-3 flex items-center gap-2.5">
            <span className="font-label text-2xs text-[var(--text-muted)]">Rachas más largas</span>
            <span className="gr-filete" />
            <span className="gr-rombo" />
          </div>
          <div className="mt-1.5">
            {/* Sólo las rachas VIVAS. La lista incluía las de cero, así que
                cuatro hábitos sin racha llenaban la card de «0 días» — y en
                oro, que es el acento de lo que se ha ganado. Una racha de cero
                no se ganó nada. */}
            {vivas.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                {data.top_streaks.length === 0 ? "Sin hábitos." : "Ninguna racha viva."}
              </p>
            ) : (
              vivas.slice(0, 4).map((s) => (
                <div key={s.name} className="flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 text-xs last:border-none">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate text-[var(--text-body)]">{s.name}</span>
                  <span className="ml-auto shrink-0 tabular text-[var(--gr-gilded)]">
                    <IconFlame size={12} className="inline" /> {s.streak} {streakUnit(s, s.streak)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* El único pozo de la vista, y la única cadena.
          Hundir los cuatro gráficos dejaba la pantalla sin un solo nivel de
          superficie: todo al mismo fondo es lo mismo que todo al mismo tamaño,
          nada destaca. El mapa de doce meses es el que se viene a ver. */}
      <Card rank="pozo">
        <SectionBand sigil="rombo" label="Mapa de consistencia · 12 meses" fill="cadena">
          {/* Mapa a la izquierda y cifras del año a la derecha: la forma y la
              magnitud del mismo dato, leídas juntas. */}
          <div className="flex flex-wrap items-start gap-8">
            <div className="min-w-0 flex-1"><HabitHeatmap data={data.heatmap} /></div>
            <div className="space-y-4">
              <Figure value={marks} label="Marcas en 12 meses" />
              <Figure value={`${data.habits_rate}%`} label="Constancia media" />
            </div>
          </div>
        </SectionBand>
      </Card>

    </div>
  );
}

