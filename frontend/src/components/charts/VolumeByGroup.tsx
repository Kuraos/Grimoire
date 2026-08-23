import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { chartPalette, CHART_BAR_RADIUS, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";
import { formatVolume, type WeightUnit } from "../../utils";
import type { MuscleGroup, VolumeWeek } from "../../types";

/**
 * El volumen semanal de fuerza, apilado por grupo muscular.
 *
 * «De fuerza» y no «de entrenamiento»: el volumen es kg×reps y sólo lo producen
 * las series. HEMA y cardio no tienen ninguna, así que llamarlo volumen de
 * entrenamiento dejaría fuera dos tercios del módulo sin avisar.
 *
 * Los colores salen del catálogo de grupos, que se siembra con la paleta FRÍA de
 * datos. **Ninguno es dorado, y no puede serlo**: una rampa que acaba en oro
 * significa avance hacia una recompensa, y más volumen no es inequívocamente
 * mejor —una semana de carga altísima es tan probable que sea una lesión en
 * camino como un buen mes—. Es el mismo razonamiento por el que el gasto diario
 * del erario acaba en ámbar y no en oro.
 */
export function VolumeByGroup({ weeks, groups, unit }: {
  weeks: VolumeWeek[];
  groups: MuscleGroup[];
  unit: WeightUnit;
}) {
  const c = chartPalette();
  const div = unit === "lb" ? 453.59237 : 1000;

  const { rows, used, scale, axisUnit } = useMemo(() => {
    const seen = new Set<number>();
    // El eje se escala escalando el DATO, no la etiqueta. Con el dominio en
    // kilos recharts elegía marcas como 4.500 y 13.500, y redondearlas a
    // toneladas al pintarlas daba un eje de 0·5·9·14·18: números que no son una
    // escala. En toneladas las marcas salen redondas solas.
    const totals = weeks.map((w) =>
      w.groups.reduce((a, g) => a + Math.max(0, g.volume_g), 0) / div);
    const scale = Math.max(0, ...totals) >= 2000 ? 1000 : 1;
    const axisUnit = scale === 1000 ? "t" : unit;

    const rows = weeks.map((w) => {
      const row: Record<string, number | string> = { week: w.week_start.slice(5) };
      for (const g of w.groups) {
        if (g.volume_g <= 0) continue;
        // Las series de un ejercicio sin grupo asignado no se pierden ni se
        // reparten: van a su propia pila, visible y sin color de nadie.
        const key = g.muscle_group_id == null ? "sin" : String(g.muscle_group_id);
        if (g.muscle_group_id != null) seen.add(g.muscle_group_id);
        row[key] = ((row[key] as number) ?? 0) + g.volume_g / div / scale;
      }
      return row;
    });
    const used = groups.filter((g) => seen.has(g.id)).map((g) => ({ ...g, key: String(g.id) }));
    const hasLoose = rows.some((r) => r.sin != null);
    return {
      rows,
      scale,
      axisUnit,
      used: hasLoose
        ? [...used, { id: -1, key: "sin", name: "Sin grupo", color: c.tickFaint, icon: "" }]
        : used,
    };
  }, [weeks, groups, div, unit, c.tickFaint]);

  if (used.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
        Ninguna serie anotada todavía. El volumen sale de las series, no de las sesiones.
      </div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="week"
            stroke={c.axis}
            tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }}
            minTickGap={20}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fill: c.tickFaint, fontSize: CHART_LABEL_SIZE }}
            width={38}
            tickFormatter={(v: number) => String(v)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "var(--gr-surface-raised)", opacity: 0.35 }}
            labelFormatter={(w) => `Semana del ${w}`}
            formatter={(v: number, _n, item) => [
              formatVolume(Math.round(v * scale * div), unit),
              used.find((g) => g.key === item.dataKey)?.name ?? "",
            ]}
          />
          {used.map((g) => (
            <Bar
              key={g.key} dataKey={g.key} stackId="v" fill={g.color}
              radius={CHART_BAR_RADIUS} isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[38px] text-2xs text-[var(--text-muted)]">
        <span className="text-[var(--text-faint)]">Eje en {axisUnit}</span>
        {used.map((g) => (
          <span key={g.key} className="inline-flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-xs" style={{ background: g.color }} />
            {g.name}
          </span>
        ))}
      </div>
    </>
  );
}
