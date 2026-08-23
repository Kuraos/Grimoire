import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { chartPalette, CHART_LABEL_SIZE, TOOLTIP_STYLE } from "../../theme-tokens";
import { formatWeight, type WeightUnit } from "../../utils";
import type { ExercisePoint } from "../../types";

/** Lo que recharts pasa a un `dot` propio. Su tipo público es un unión enorme
 *  que no se puede estrechar sin pelearse con él; esto es lo que se usa. */
type DotProps = {
  cx: number;
  cy: number;
  index: number;
  payload: { record: number | null; lowConfidence: boolean };
};

/**
 * La progresión de un ejercicio: peso máximo medido y 1RM estimado.
 *
 * Las dos líneas van en TINTA, no en arcano. Es dato, y la ley del acento manda:
 * el arcano es estado del sistema —foco, selección, navegación— y usarlo aquí
 * habría hecho que la mitad de la gráfica pareciera un control.
 *
 * La distinción entre las dos la hace el trazo, no el color: el peso máximo es
 * tinta brillante y continua porque se midió; el 1RM es tinta tenue y
 * discontinua porque se calculó. Un usuario que no lea la leyenda sigue sabiendo
 * cuál de las dos es una suposición.
 *
 * Los récords se marcan con un rombo de tinta. Se DIBUJAN, no se premian: un
 * récord sin meta declarada de antemano es circunstancia, y el oro del módulo
 * está reservado a las metas que el usuario fijó antes de cumplirlas.
 */
export function ExerciseProgress({ points, unit }: {
  points: ExercisePoint[];
  unit: WeightUnit;
}) {
  const c = chartPalette();

  if (points.length < 2) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
        {points.length === 0
          ? "Sin series de este ejercicio todavía."
          : "Una sola sesión no dibuja una curva. Vuelve cuando tenga dos."}
      </div>
    );
  }

  const div = unit === "lb" ? 453.59237 : 1000;
  const rows = points.map((p) => ({
    date: p.occurred_on.slice(5),
    top: p.top_weight_g / div,
    est: p.est_1rm_g / div,
    record: p.is_record ? p.top_weight_g / div : null,
    lowConfidence: p.low_confidence,
    estG: p.est_1rm_g,
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={rows} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            stroke={c.axis}
            tick={{ fill: c.tick, fontSize: CHART_LABEL_SIZE }}
            minTickGap={28}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fill: c.tickFaint, fontSize: CHART_LABEL_SIZE }}
            width={38}
            /* El dominio se redondea a decenas para que las marcas caigan en
               números de escala. Con `dataMin - 5` recharts elegía 68·83·110:
               cifras correctas que no forman una escala, y un eje así se lee dos
               veces antes de entenderse. */
            domain={[
              (min: number) => Math.max(0, Math.floor((min - 5) / 10) * 10),
              (max: number) => Math.ceil((max + 5) / 10) * 10,
            ]}
            tickCount={6}
            tickFormatter={(v: number) => String(Math.round(v))}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name) => [
              formatWeight(Math.round(v * div), unit),
              name === "top" ? "Peso máximo" : "1RM estimado",
            ]}
          />
          {/* El estimado se dibuja primero para que el medido quede encima: si se
              cruzan, lo que importa leer es el dato real. */}
          <Line
            type="monotone" dataKey="est" stroke={c.tickFaint} strokeWidth={1.5}
            strokeDasharray="5 4" isAnimationActive={false}
            dot={(p: DotProps) => (
              /* Ámbar sobre la estimación floja: por encima de diez repeticiones
                 Epley pierde precisión, y el ámbar es advertencia sobre el dato
                 —no una recompensa ni un error—. */
              p.payload.lowConfidence ? (
                <circle key={p.index} cx={p.cx} cy={p.cy} r={3.5}
                        fill="var(--gr-surface-sunken)" stroke={c.amber} strokeWidth={1.5} />
              ) : <g key={p.index} />
            )}
          />
          <Line
            type="monotone" dataKey="top" stroke={c.ink} strokeWidth={2}
            isAnimationActive={false}
            dot={(p: DotProps) => (
              /* El récord es un ROMBO, no un punto más gordo: a 4px de radio un
                 círculo grande y uno pequeño no se distinguen, y la marca dejaba
                 de leerse como marca. Va en tinta — un récord sin meta declarada
                 es dato, no medalla. */
              p.payload.record != null ? (
                <rect key={p.index} x={p.cx - 3.6} y={p.cy - 3.6} width={7.2} height={7.2}
                      fill={c.ink} transform={`rotate(45 ${p.cx} ${p.cy})`} />
              ) : (
                <circle key={p.index} cx={p.cx} cy={p.cy} r={2.5} fill={c.ink} />
              )
            )}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[38px] text-2xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4" style={{ background: "var(--gr-ink-bright)" }} />
          Peso máximo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-[1.5px] border-dashed border-[var(--text-faint)]" />
          1RM estimado (Epley)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rotate-45 bg-[var(--gr-ink-bright)]" />
          Récord personal
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--warning)]">
          <span className="h-2 w-2 rounded-full border-[1.5px] border-[var(--warning)]" />
          Más de 10 reps: estimación floja
        </span>
      </div>
    </>
  );
}
