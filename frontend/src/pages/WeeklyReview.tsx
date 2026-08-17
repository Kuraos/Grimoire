import { useEffect, useState } from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { SectionBand } from "../components/ui/SectionBand";
import { YearWheel, isoWeek } from "../components/charts/YearWheel";
import { PageHeader } from "../components/layout/PageHeader";
import { isoDate, WEEKDAYS_ES } from "../utils";
import type { WeekSummary, WeeklyReview as Review } from "../types";

export default function WeeklyReview() {
  const { handleXP } = useApp();
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [whatWorked, setWhatWorked] = useState("");
  const [whatFailed, setWhatFailed] = useState("");
  const [nextChange, setNextChange] = useState("");
  const [rating, setRating] = useState(3);
  const [saved, setSaved] = useState(false);
  const [heat, setHeat] = useState<Record<string, number>>({});

  // Lunes a domingo de la semana en curso. `future` es el día que aún no ha
  // llegado, y se dibuja vacío en vez de a cero.
  // Sólo las reseñas del año en curso entran en la rueda: son 52 radios de
  // *este* año, y colar las del anterior encendería semanas que no son.
  const year = new Date().getFullYear();
  const thisWeek = isoWeek(new Date());
  const reviewedWeeks = new Set(
    history
      .map((r) => /^(\d{4})-W(\d{1,2})$/.exec(r.week_iso))
      .filter((m): m is RegExpExecArray => m !== null && Number(m[1]) === year)
      .map((m) => Number(m[2])),
  );

  const todayIso = isoDate(new Date());
  const monday = new Date(todayIso + "T00:00");
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 864e5);
    const iso = isoDate(d);
    return {
      dow: WEEKDAYS_ES[i],
      day: d.getDate(),
      count: heat[iso] ?? 0,
      future: iso > todayIso,
      today: iso === todayIso,
    };
  });

  const load = async () => {
    try {
      // El resumen no trae desglose por día, y «Los siete días» lo necesita.
      // Sale del heatmap del año, que ya existe: una llamada más y ningún
      // endpoint nuevo para un dato que el backend ya sabe calcular.
      const [s, h, st] = await Promise.all([Api.weekSummary(), Api.listReviews(), Api.stats("year")]);
      setSummary(s);
      setHistory(h);
      setHeat(Object.fromEntries(st.heatmap.map((d) => [d.date, d.count])));
      const current = h.find((r) => r.week_iso === s.week_iso);
      if (current) {
        setWhatWorked(current.what_worked ?? "");
        setWhatFailed(current.what_failed ?? "");
        setNextChange(current.next_change ?? "");
        setRating(current.rating ?? 3);
        setSaved(true);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      const res = await Api.saveReview({
        week_iso: summary?.week_iso,
        what_worked: whatWorked,
        what_failed: whatFailed,
        next_change: nextChange,
        rating,
      });
      handleXP(res);
      setSaved(true);
      load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Revisión semanal"
        context={
          <span className="flex flex-col not-italic">
            {summary && <span className="gr-rubrica text-[var(--text-muted)]">{summary.week_iso}</span>}
            <span className="italic">
              {saved ? "Completada" : "Sin completar todavía"}
            </span>
          </span>
        }
      />

      {/* La rúbrica ocupa el ancho y cuenta la semana dos veces: las cifras
          frente a la anterior, y los siete días en barras. Las cifras dicen
          cuánto; las barras, si fue sostenido o un solo martes. */}
      <Card rank="rubric" className="w-full">
        <div className="flex flex-wrap gap-8">
          <div className="min-w-[280px] flex-[1.5]">
            <SectionBand sigil="diamante" label="Resumen de la semana" fill="linea"
                         right={<span className="normal-case tracking-normal italic text-[var(--text-faint)]">frente a la anterior</span>}>
              {summary ? (
                <div>
                  <LeaderRow label="XP" value={`${summary.xp_total}`} delta={summary.xp_delta_pct} />
                  <LeaderRow label="Hábitos" value={`${summary.habits_completed} / ${summary.habits_possible}`} />
                  <LeaderRow label="Foco" value={`${summary.pomodoro_minutes}m · ${summary.pomodoro_sessions} ses`} />
                  <LeaderRow label="Tareas cerradas / abiertas" value={`${summary.tasks_closed} / ${summary.tasks_open}`} />
                  <LeaderRow label="Energía media" value={summary.avg_energy ? `${summary.avg_energy}/5` : "—"} />
                  <LeaderRow label="Ánimo medio" value={summary.avg_mood ? `${summary.avg_mood}/5` : "—"} />
                </div>
              ) : <p className="text-xs text-[var(--text-muted)]">Cargando…</p>}
            </SectionBand>
          </div>

          <div className="min-w-[260px] flex-1">
            <SectionBand sigil="reloj" label="Los siete días" fill="linea">
              <WeekBars days={week} />
            </SectionBand>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="gr-sangrado">
            {/* El filete de esta banda va en arcano y no en tinta: es la única
                sección de la vista donde se escribe, y el arcano marca dónde
                está el foco del sistema. */}
            <SectionBand sigil="discoDoble" label="Reflexión guiada" fill="arcana" />
          </div>
          <div className="mt-3 space-y-3.5">
            <Question label="¿Qué funcionó bien esta semana?" value={whatWorked} onChange={setWhatWorked} />
            <Question label="¿Qué no funcionó o quedó pendiente?" value={whatFailed} onChange={setWhatFailed} />
            <Question label="¿Qué cambio concreto haré la semana que viene?" value={nextChange} onChange={setNextChange}
                      hint="Un solo cambio, y que se pueda medir el domingo…" dashed />

            <div className="flex flex-wrap items-center gap-4 border-t border-[var(--gr-edge)] pt-3.5">
              <span className="font-label text-xs text-[var(--text-muted)]">La semana valió</span>
              <span className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} className="text-[var(--purple-main)]"
                          title={`${n} de 5`}>
                    {n <= rating ? <IconStarFilled size={22} /> : <IconStar size={22} className="text-[var(--text-faint)]" />}
                  </button>
                ))}
              </span>
              <span className="tabular text-xs text-[var(--purple-main)]">{rating}/5</span>
              <span className="ml-auto text-xs italic text-[var(--text-faint)]">
                Guardar concede +30 XP, una vez por semana
              </span>
            </div>

            <button className="btn btn-primary w-full justify-center" onClick={save}>
              {saved ? "Actualizar reseña" : "Guardar reseña (+30 XP)"}
            </button>
          </div>
        </Card>

        <Card>
          {/* La única cadena de la vista. */}
          <div className="gr-sangrado">
            <SectionBand sigil="libro" label="Reseñas anteriores" count={history.length || undefined} fill="cadena" />
          </div>
          <div className="mt-2">
            {history.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin reseñas previas.</p>}
            {history.map((r) => (
              <div key={r.id} className="border-b border-[var(--gr-edge)] py-2 last:border-none">
                <div className="flex items-center gap-2">
                  {/* La semana ISO en Cinzel: es un nombre, no una cifra que cambie. */}
                  <span className="font-display text-xs tracking-[0.1em] text-[var(--purple-main)]">{r.week_iso}</span>
                  <span className="flex gap-px text-[var(--purple-main)]">
                    {Array.from({ length: r.rating ?? 0 }).map((_, i) => <IconStarFilled key={i} size={11} />)}
                  </span>
                  <span className="ml-auto tabular text-2xs text-[var(--text-faint)]">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.what_worked && (
                  <p className="mt-0.5 truncate font-prose text-xs text-[var(--text-muted)]">{r.what_worked}</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* La rueda cierra la columna: el historial dice qué escribiste, la
            rueda dice cuánto llevas sosteniéndolo. */}
        <Card rank="pozo">
          <SectionBand sigil="circulo" label="La rueda del año" fill="linea"
                       count={`${reviewedWeeks.size}/${thisWeek - 1}`}>
            <YearWheel weeks={reviewedWeeks} current={thisWeek} />
          </SectionBand>
        </Card>
      </div>
    </div>
  );
}

/* Fila con guía punteada: el rótulo a la izquierda, la cifra a la derecha y el
   punteado uniendo los dos. Es la solución de índice de libro, y existe porque
   con `justify-between` a 400px de ancho el ojo perdía la correspondencia entre
   una etiqueta y su número. */
function LeaderRow({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--gr-edge)] py-[7px] last:border-none">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="gr-filete self-center" />
      <span className="tabular text-sm text-[var(--text-primary)]">{value}</span>
      {delta != null && (
        <span className={`tabular text-2xs ${delta >= 0 ? "text-[var(--success)]" : "text-[var(--gr-oxblood)]"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </span>
      )}
    </div>
  );
}

/* Los siete días en barras. El día en curso va a medias por definición y el
   que no ha llegado no se dibuja: pintarlo a cero diría que se falló, y no
   haber llegado todavía no es fallar. */
function WeekBars({ days }: { days: { dow: string; day: number; count: number; future: boolean; today: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex items-end gap-2.5">
      {days.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
          <span className="tabular text-xs text-[var(--text-faint)]">{d.future ? "" : d.count}</span>
          <span className="flex h-24 w-full items-end">
            <span
              className="w-full rounded-xs"
              style={{
                height: d.future ? 0 : `${Math.max(3, (d.count / max) * 100)}%`,
                background: d.today
                  ? "linear-gradient(180deg, var(--gr-arcane), var(--gr-arcane-deep))"
                  : "var(--gr-surface-raised)",
                border: `1px solid ${d.today ? "var(--gr-arcane)" : "var(--gr-edge)"}`,
              }}
            />
          </span>
          <span className={`font-label text-2xs ${d.today ? "text-[var(--purple-main)]" : "text-[var(--text-faint)]"}`}>
            {d.dow}
          </span>
          <span className="tabular text-2xs text-[var(--text-faint)]">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular text-[var(--text-primary)]">
        {value}
        {delta != null && (
          <span className={`ml-2 text-xs ${delta >= 0 ? "text-[var(--success)]" : "text-[var(--gr-oxblood)]"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </span>
    </div>
  );
}

/* La pregunta es un pozo, no un input: fondo hundido, borde fuerte y prosa
   Spectral dentro. Escribir la reseña se parece más a escribir en el diario
   que a rellenar un formulario, y la superficie tenía que decirlo.
   La tercera va con borde discontinuo — es un propósito, todavía no un hecho. */
function Question({ label, value, onChange, hint, dashed }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; dashed?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-label text-xs text-[var(--text-muted)]">{label}</span>
      <textarea
        className="input font-prose min-h-[96px] resize-y bg-[var(--gr-surface-sunken)] px-3.5 py-3 leading-[1.65] text-[var(--text-body)]"
        style={{
          borderColor: "var(--border-strong)",
          borderStyle: dashed ? "dashed" : "solid",
        }}
        placeholder={hint}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
