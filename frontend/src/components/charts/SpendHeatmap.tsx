import { useMemo } from "react";
import { isoDate, formatMoney, MONTHS_ES } from "../../utils";
import { chartPalette, toRgb } from "../../theme-tokens";

/**
 * Mapa de calor del gasto diario. Mismo patrón que `HabitHeatmap` —celdas de
 * 11px con el radio `xs` de marca de datos—, pero con una rampa distinta y por
 * un motivo de fondo:
 *
 * el heatmap de hábitos va hacia ARCANO porque más marcas es mejor. Aquí más
 * gasto no es mejor, así que la rampa termina en ÁMBAR: el color de advertencia
 * que ya existe en la paleta. Terminar en dorado convertiría el día que más
 * gastaste en el más premiado de la cuadrícula.
 *
 * La escala es relativa al máximo del periodo, así que dice «este día fue caro
 * comparado con tus otros días», no «gastaste mucho» en absoluto.
 */
export function SpendHeatmap({ data, currency, weeks = 27 }: {
  data: { date: string; expense_minor: number }[];
  currency: string;
  weeks?: number;
}) {
  const { columns, max } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d.expense_minor]));
    const max = Math.max(1, ...data.map((d) => d.expense_minor));

    const end = new Date();
    end.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7)) % 7));
    const start = new Date(end);
    start.setDate(start.getDate() - weeks * 7 + 1);

    const cols: { date: string; total: number }[][] = [];
    const cursor = new Date(start);
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; total: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = isoDate(cursor);
        col.push({ date: iso, total: map.get(iso) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return { columns: cols, max };
  }, [data, weeks]);

  const c = chartPalette();
  const from = toRgb(c.surfaceRaised);
  const to = toRgb(c.amber);

  const color = (total: number) => {
    if (total <= 0) return "var(--gr-surface-raised)";
    // raíz cuadrada: un solo día caro no aplana el resto de la cuadrícula
    const t = Math.min(1, Math.sqrt(total / max));
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    return `rgb(${lerp(from[0], to[0])},${lerp(from[1], to[1])},${lerp(from[2], to[2])})`;
  };

  const todayIso = isoDate(new Date());

  return (
    <div className="overflow-x-auto">
      {/* Rótulos de mes. Sin ellos la cuadrícula cubre medio año y no hay forma
          de situar una celda: se ve que hubo un día caro, pero no cuándo, que es
          justo lo que se necesita para hacer algo al respecto. */}
      <div className="mb-1 flex gap-[3px]">
        {columns.map((col, ci) => {
          const month = Number(col[0].date.slice(5, 7));
          const prev = ci > 0 ? Number(columns[ci - 1][0].date.slice(5, 7)) : null;
          return (
            <div key={ci} className="relative h-3 w-[11px]">
              {month !== prev && (
                <span className="absolute left-0 top-0 whitespace-nowrap text-2xs text-[var(--text-muted)]">
                  {MONTHS_ES[month - 1].slice(0, 3)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.total > 0 ? formatMoney(cell.total, currency) : "sin gasto"}`}
                className="h-[11px] w-[11px] rounded-xs"
                style={{
                  // Un día futuro vacío no se pinta —todavía no ha pasado—, pero
                  // uno con un asiento anotado por adelantado SÍ: la rúbrica ya
                  // lo suma, y una cuadrícula que esconde dinero que el total
                  // cuenta hace que las dos cifras no cuadren sin explicación.
                  background: cell.date > todayIso && cell.total <= 0
                    ? "transparent"
                    : color(cell.total),
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
