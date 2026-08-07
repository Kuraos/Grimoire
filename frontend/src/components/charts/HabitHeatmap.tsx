import { useMemo } from "react";
import { isoDate } from "../../utils";

/**
 * GitHub-style heatmap: 53 weeks × 7 days, coloured by completion count.
 */
export function HabitHeatmap({ data, weeks = 53 }: {
  data: { date: string; count: number }[];
  weeks?: number;
}) {
  const { columns, max } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d.count]));
    const max = Math.max(1, ...data.map((d) => d.count));

    // last day = today; align grid to end on the current week (Mon-start)
    const today = new Date();
    const end = new Date(today);
    // move to Sunday (end of current Mon-start week)
    end.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7)) % 7));
    const totalDays = weeks * 7;
    const start = new Date(end);
    start.setDate(start.getDate() - totalDays + 1);

    const cols: { date: string; count: number }[][] = [];
    let cursor = new Date(start);
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = isoDate(cursor);
        col.push({ date: iso, count: map.get(iso) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return { columns: cols, max };
  }, [data, weeks]);

  const color = (count: number) => {
    if (count <= 0) return "var(--bg-elevated)";
    const t = Math.min(1, count / max);
    // interpolate bg-elevated → purple-main
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    const from = [26, 20, 34];
    const to = [155, 127, 196];
    return `rgb(${lerp(from[0], to[0])},${lerp(from[1], to[1])},${lerp(from[2], to[2])})`;
  };

  const todayIso = isoDate(new Date());

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count} completado(s)`}
                className="h-[11px] w-[11px] rounded-[2px]"
                style={{
                  background: cell.date > todayIso ? "transparent" : color(cell.count),
                  outline: cell.date === todayIso ? "1px solid var(--purple-main)" : "none",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
