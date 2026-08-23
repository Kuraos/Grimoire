import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconPlus, IconTrash, IconBarbell, IconSwords, IconRun, IconScaleOutline,
  IconTargetArrow, IconCheck, IconInfoCircle,
} from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { Card } from "../components/ui/Card";
import { Figure } from "../components/ui/Figure";
import { SectionBand } from "../components/ui/SectionBand";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal, Field } from "../components/ui/Modal";
import { StrengthGoalRail } from "../components/ui/StrengthGoalRail";
import { ExerciseProgress } from "../components/charts/ExerciseProgress";
import { VolumeByGroup } from "../components/charts/VolumeByGroup";
import { BodyTrend } from "../components/charts/BodyTrend";
import { confirm } from "../confirm";
import { useApp } from "../context";
import {
  todayISO, formatWeight, formatVolume, parseWeight, formatPace, formatDuration,
  formatBodyMetric, bodyMetricUnit, BODY_METRIC_MILLI, type WeightUnit,
} from "../utils";
import type {
  BodyMetric, BodyMetricKind, BodyMetricSeries, Exercise, ExerciseProgress as Progress,
  Habit, MuscleGroup, StrengthGoal, TrainingKind, TrainingSession, TrainingStats,
  TrainingSummary, XPEventResponse,
} from "../types";

const KIND_META: Record<TrainingKind, { label: string; Icon: typeof IconBarbell }> = {
  strength: { label: "Fuerza", Icon: IconBarbell },
  hema: { label: "HEMA", Icon: IconSwords },
  cardio: { label: "Cardio", Icon: IconRun },
};

const METRIC_LABEL: Record<BodyMetricKind, string> = {
  weight: "Peso", waist: "Cintura", chest: "Pecho",
  arm: "Brazo", thigh: "Muslo", hip: "Cadera",
};

/** Una serie mientras se escribe: texto, no números. El peso se convierte a
 *  gramos al guardar, en el borde, igual que el dinero del erario. */
type SetDraft = { exercise: string; reps: string; weight: string; rpe: string };

const EMPTY_SET: SetDraft = { exercise: "", reps: "", weight: "", rpe: "" };

/** Filas visibles de la bitácora antes de pedirlas todas.
 *
 *  Se piden cuarenta —las gráficas las necesitan para contar qué ejercicios
 *  aparecen más— pero pintarlas todas convertía la lista en un muro que
 *  enterraba la progresión, las metas y las medidas debajo de tres pantallas de
 *  scroll. El registro es material de consulta; lo que la vista existe para
 *  contestar está más abajo. */
const LOG_ROWS = 8;

export default function Training() {
  const { pushToast, handleXP } = useApp();

  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [goals, setGoals] = useState<StrengthGoal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [series, setSeries] = useState<BodyMetricSeries | null>(null);
  const [metricKind, setMetricKind] = useState<BodyMetricKind>("weight");

  const [focusExercise, setFocusExercise] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const [allLog, setAllLog] = useState(false);
  const [sessionForm, setSessionForm] = useState<TrainingKind | null>(null);
  const [metricForm, setMetricForm] = useState(false);
  const [goalForm, setGoalForm] = useState(false);

  const unit: WeightUnit = summary?.weight_unit ?? "kg";
  const exerciseName = useCallback(
    (id: number) => exercises.find((e) => e.id === id)?.name ?? "Ejercicio",
    [exercises],
  );

  const load = useCallback(async () => {
    const [s, ses, ex, gr, go, hb, st] = await Promise.all([
      Api.trainingSummary(), Api.listTrainingSessions("?limit=40"),
      Api.listExercises(true), Api.listMuscleGroups(),
      Api.listStrengthGoals(), Api.listHabits(), Api.trainingStats(10),
    ]);
    setSummary(s); setSessions(ses); setExercises(ex); setGroups(gr);
    setGoals(go); setHabits(hb); setStats(st);
  }, []);

  const loadMetrics = useCallback(async (kind: BodyMetricKind) => {
    const [rows, ser] = await Promise.all([
      Api.listBodyMetrics(kind), Api.bodyMetricSeries(kind),
    ]);
    setMetrics(rows); setSeries(ser);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMetrics(metricKind); }, [loadMetrics, metricKind]);

  // El ejercicio de la curva: el elegido, o el que más series tiene. Sin esto la
  // sección arranca vacía aunque haya datos, que es la peor primera impresión.
  const chartExercises = useMemo(() => {
    const count = new Map<number, number>();
    for (const s of sessions) {
      for (const set of s.sets) count.set(set.exercise_id, (count.get(set.exercise_id) ?? 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => exercises.find((e) => e.id === id))
      .filter((e): e is Exercise => e != null)
      .slice(0, 6);
  }, [sessions, exercises]);

  const shownExercise = focusExercise ?? chartExercises[0]?.id ?? null;

  useEffect(() => {
    if (shownExercise == null) { setProgress(null); return; }
    Api.exerciseProgress(shownExercise).then(setProgress);
  }, [shownExercise]);

  async function afterWrite() {
    await load();
    await loadMetrics(metricKind);
  }

  const latest = (kind: BodyMetricKind) =>
    metrics.find((m) => m.kind === kind) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entrenamiento"
        context={
          summary && summary.sessions_this_week > 0
            ? `${summary.sessions_this_week} ${summary.sessions_this_week === 1 ? "sesión" : "sesiones"} esta semana · ${formatVolume(summary.volume_this_week_g, unit)} de volumen`
            : "Sin sesiones esta semana"
        }
      >
        <button className="btn btn-primary" onClick={() => setSessionForm("strength")}>
          <IconPlus size={15} /> Registrar sesión
        </button>
        <button className="btn" onClick={() => setMetricForm(true)}>
          <IconScaleOutline size={15} /> Métrica corporal
        </button>
      </PageHeader>

      {/* La rúbrica: lo que el día exige. Una por vista. */}
      <TodayRubric
        summary={summary} unit={unit} habits={habits}
        onStart={(k) => setSessionForm(k)}
      />

      <Card named title="La bitácora">
        <div className="mb-2 flex items-center gap-2 font-label text-xs tracking-[0.1em] text-[var(--text-muted)]">
          <span className="gr-cadena" />
          <span className="normal-case tracking-normal text-2xs">
            {allLog ? `${sessions.length} sesiones` : `Últimas ${Math.min(LOG_ROWS, sessions.length)}`}
          </span>
          <span className="gr-rombo" />
        </div>
        {sessions.length === 0 ? (
          <div className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--text-muted)]">
            Nada asentado todavía.
          </div>
        ) : (
          (allLog ? sessions : sessions.slice(0, LOG_ROWS)).map((s) => (
            <SessionRow
              key={s.id} session={s} unit={unit}
              onDelete={async () => {
                if (!(await confirm({
                  title: "Borrar la sesión",
                  message: "El rito que marcó se queda marcado y su XP no se devuelve: la marca vive en el registro de hábitos, no en esta fila.",
                  danger: true,
                }))) return;
                await Api.deleteTrainingSession(s.id);
                await afterWrite();
              }}
            />
          ))
        )}
        {sessions.length > LOG_ROWS && (
          <button
            className="mt-2 w-full border-t border-[var(--border)] pt-2.5 text-2xs text-[var(--purple-main)] hover:underline"
            onClick={() => setAllLog(!allLog)}
          >
            {allLog ? "Ver sólo las últimas" : `Ver las ${sessions.length} sesiones`}
          </button>
        )}
      </Card>

      <Card rank="pozo">
        <SectionBand
          sigil="rombo"
          label="Progresión"
          right={
            chartExercises.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {chartExercises.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setFocusExercise(e.id)}
                    className={`rounded-sm border px-2 py-[2px] text-2xs normal-case tracking-normal transition-colors ${
                      e.id === shownExercise
                        ? "border-[var(--gr-arcane)] bg-[var(--accent-deep)] text-[var(--accent-strong)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
                    }`}
                  >
                    {e.name}
                  </button>
                ))}
              </span>
            ) : undefined
          }
        >
          {progress ? (
            <ExerciseProgress points={progress.points} unit={unit} />
          ) : (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              La curva de un ejercicio aparece con su segunda sesión.
            </div>
          )}
        </SectionBand>
      </Card>

      <Card rank="pozo">
        <SectionBand sigil="triangulo" label="Volumen semanal de fuerza">
          <VolumeByGroup weeks={stats?.volume_weeks ?? []} groups={groups} unit={unit} />
        </SectionBand>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card named title="Metas de fuerza" right={
          <button className="btn btn-ghost !px-2.5 !py-1 !text-2xs" onClick={() => setGoalForm(true)}>
            <IconPlus size={12} /> Declarar
          </button>
        }>
          {goals.length === 0 ? (
            <div className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-muted)]">
              Ninguna meta declarada.
            </div>
          ) : (
            <div className="space-y-3 border-t border-[var(--border)] pt-3">
              {goals.map((g) => (
                <StrengthGoalRail
                  key={g.id} goal={g} unit={unit} exerciseName={exerciseName(g.exercise_id)}
                  onDelete={async (goal) => {
                    if (!(await confirm({ title: "Retirar la meta", message: exerciseName(goal.exercise_id), danger: true }))) return;
                    await Api.deleteStrengthGoal(goal.id);
                    await afterWrite();
                  }}
                />
              ))}
            </div>
          )}
          {/* La regla, escrita donde se declara: es la única forma de que no
              sorprenda el día que alguien baje la cifra esperando cobrar. */}
          <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-2xs leading-relaxed text-[var(--text-faint)]">
            Una meta se declara <em>antes</em>. Bajar la cifra por debajo de lo que ya
            levantas no la sella sola: hace falta una serie posterior que la alcance. Un
            récord sin meta declarada es dato, no medalla — se dibuja en la curva y no paga XP.
          </p>
        </Card>

        <Card named title="Métricas corporales" right={
          <span className="normal-case tracking-normal text-2xs italic text-[var(--text-faint)]">
            Dato neutro: sin XP ni racha
          </span>
        }>
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
            {(Object.keys(METRIC_LABEL) as BodyMetricKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setMetricKind(k)}
                className={`rounded-sm border px-2 py-[2px] text-2xs transition-colors ${
                  k === metricKind
                    ? "border-[var(--gr-arcane)] bg-[var(--accent-deep)] text-[var(--accent-strong)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
                }`}
              >
                {METRIC_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="mt-3.5 flex gap-9">
            <Figure
              value={latest(metricKind)
                ? formatBodyMetric(latest(metricKind)!.value_milli, metricKind).replace(/\s\w+$/, "")
                : "—"}
              suffix={` ${bodyMetricUnit(metricKind)}`}
              label={`${METRIC_LABEL[metricKind]} · última`}
              muted
            />
            <Figure value={String(metrics.length)} label="Medidas anotadas" muted />
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            {series ? <BodyTrend series={series} /> : null}
          </div>
        </Card>
      </div>

      {sessionForm && (
        <SessionModal
          kind={sessionForm}
          unit={unit}
          habits={habits}
          exercises={exercises}
          suggestedHabit={summary?.suggested_habit?.[sessionForm] ?? null}
          onClose={() => setSessionForm(null)}
          onSaved={async (note, marked) => {
            setSessionForm(null);
            if (note) {
              pushToast({
                title: marked ? "Rito marcado" : "Sesión asentada",
                body: note,
                icon: marked ? "check" : "info-circle",
              });
            }
            await afterWrite();
          }}
          onXP={handleXP}
        />
      )}

      {metricForm && (
        <BodyMetricModal
          onClose={() => setMetricForm(false)}
          onSaved={async (kind) => { setMetricForm(false); setMetricKind(kind); await afterWrite(); }}
        />
      )}

      {goalForm && (
        <GoalModal
          unit={unit}
          exercises={exercises}
          onClose={() => setGoalForm(false)}
          onSaved={async () => { setGoalForm(false); await afterWrite(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ rúbrica */

function TodayRubric({ summary, unit, habits, onStart }: {
  summary: TrainingSummary | null;
  unit: WeightUnit;
  habits: Habit[];
  onStart: (k: TrainingKind) => void;
}) {
  const hoy = summary?.today ?? null;
  const fecha = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
  const title = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  if (!hoy) {
    return (
      <Card rank="rubric" named title={title}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="text-sm text-[var(--text-body)]">Nada asentado hoy.</div>
            <div className="text-xs text-[var(--text-muted)]">
              Asienta la sesión y el rito del día se marca solo.
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {(Object.keys(KIND_META) as TrainingKind[]).map((k) => {
              const { label, Icon } = KIND_META[k];
              return (
                <button
                  key={k}
                  className={k === "strength" ? "btn btn-primary" : "btn"}
                  onClick={() => onStart(k)}
                >
                  <Icon size={15} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }

  const { label, Icon } = KIND_META[hoy.kind];
  const rito = habits.find((h) => h.id === hoy.habit_id);

  return (
    <Card rank="rubric" named title={title}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="flex min-w-[186px] items-center gap-3">
          <span className="text-[var(--text-muted)]"><Icon size={22} /></span>
          <div>
            <div className="text-sm leading-snug text-[var(--text-primary)]">
              {label}{hoy.name ? ` · ${hoy.name}` : ""}
            </div>
            <div className="tabular text-xs text-[var(--text-muted)]">
              {hoy.kind === "strength"
                ? `${hoy.set_count} ${hoy.set_count === 1 ? "serie" : "series"}`
                : hoy.kind === "cardio"
                  ? `${((hoy.distance_m ?? 0) / 1000).toFixed(2)} km · ${formatPace(hoy.pace_s_per_km)} /km`
                  : `Intensidad ${hoy.intensity ?? "—"}/5`}
            </div>
          </div>
        </div>

        <div className="flex gap-11">
          {hoy.kind === "strength" && (
            <SplitFigure text={formatVolume(hoy.volume_g, unit)} label="Volumen" />
          )}
          <SplitFigure text={formatDuration(hoy.duration_s)} label="Duración" />
          <Figure value={String(summary?.days_this_week ?? 0)} label="Días esta semana" muted />
        </div>

        {/* El oro aquí NO marca un dato de entrenamiento: marca el rito
            cumplido, que es XP de Hábitos asomándose. Ver la ley del acento. */}
        <div className="ml-auto flex flex-col items-end gap-2">
          {hoy.habit_log_id && rito ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--gr-gilded)] bg-[var(--gr-gilded-deep)] px-2.5 py-1 font-label text-2xs text-[var(--gr-gilded-bright)]">
              <IconCheck size={13} /> {rito.name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 font-label text-2xs text-[var(--text-muted)]">
              Sin rito marcado
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Parte una cifra ya formateada en número y unidad: «2,4 t» → 2,4 + t.
 *
 * La unidad baja a 24px porque al mismo tamaño que la cifra pesa igual que ella
 * y el número deja de leerse de un golpe — es la razón por la que `Figure` tiene
 * `suffix`. Partir el texto formateado, en vez de recomponerlo, evita repetir la
 * lógica de formato en cada llamada; y «1 h 02» no lleva unidad, así que se deja
 * entera en vez de inventarle un « min» detrás.
 */
function SplitFigure({ text, label, muted }: { text: string; label: string; muted?: boolean }) {
  const i = text.lastIndexOf(" ");
  const unidad = i > 0 && /[^\d\s]/.test(text.slice(i + 1));
  return (
    <Figure
      value={unidad ? text.slice(0, i) : text}
      suffix={unidad ? ` ${text.slice(i + 1)}` : undefined}
      label={label}
      muted={muted}
    />
  );
}

/* ------------------------------------------------------------------- fila */

function SessionRow({ session, unit, onDelete }: {
  session: TrainingSession; unit: WeightUnit; onDelete: () => void;
}) {
  const { Icon, label } = KIND_META[session.kind];

  return (
    <div className="grid grid-cols-[26px_1fr_auto] items-center gap-x-3 border-t border-[var(--border)] py-2.5">
      <span className="text-[var(--text-muted)]"><Icon size={20} /></span>
      <div className="min-w-0">
        <div className="truncate text-sm leading-snug text-[var(--text-primary)]">
          {label}{session.name ? ` · ${session.name}` : ""}
        </div>
        {/* Sin «— sin rito» escrito: el punto de la derecha ya lo dice, y en una
            lista donde la mayoría de las filas son de días pasados esa coletilla
            se repetía diez veces y leía como un error. */}
        <div className="tabular text-2xs text-[var(--text-muted)]">
          {session.occurred_on}
          {session.duration_s ? ` · ${formatDuration(session.duration_s)}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="tabular w-[104px] text-right text-sm text-[var(--text-body)]">
          {session.kind === "strength"
            ? formatVolume(session.volume_g, unit)
            : session.kind === "cardio"
              ? `${((session.distance_m ?? 0) / 1000).toFixed(2)} km`
              : formatDuration(session.duration_s)}
        </span>
        <span className="tabular w-[76px] text-right text-xs text-[var(--text-muted)]">
          {session.kind === "strength"
            ? `${session.set_count} series`
            : session.kind === "cardio"
              ? (
                /* El ritmo es derivado: el punteado lo dice sin una leyenda. */
                <span className="border-b border-dotted border-[var(--text-faint)] pb-px">
                  {formatPace(session.pace_s_per_km)} /km
                </span>
              )
              : `${session.intensity ?? "—"}/5`}
        </span>
        <span
          title={session.habit_log_id ? "Marcó el rito del día" : "No marcó ningún rito"}
          className={`h-[7px] w-[7px] rounded-full ${
            session.habit_log_id
              ? "bg-[var(--gr-gilded)]"
              : "border border-[var(--border-strong)]"
          }`}
        />
        <button className="text-[var(--text-faint)] hover:text-[var(--danger)]" onClick={onDelete}
                title="Borrar la sesión">
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sesión */

function SessionModal({ kind, unit, habits, exercises, suggestedHabit, onClose, onSaved, onXP }: {
  kind: TrainingKind;
  unit: WeightUnit;
  habits: Habit[];
  exercises: Exercise[];
  suggestedHabit: number | null;
  onClose: () => void;
  onSaved: (note: string | null, marked: boolean) => void | Promise<void>;
  onXP: (xp: XPEventResponse) => void;
}) {
  const [tab, setTab] = useState<TrainingKind>(kind);
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [habitId, setHabitId] = useState<string>(suggestedHabit ? String(suggestedHabit) : "");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);
  const [techniques, setTechniques] = useState("");
  const [cardioKind, setCardioKind] = useState<"run" | "bike" | "other">("run");
  const [distance, setDistance] = useState("");
  const [sets, setSets] = useState<SetDraft[]>([{ ...EMPTY_SET }]);
  const [busy, setBusy] = useState(false);

  const esHoy = date === todayISO();
  const rito = habits.find((h) => String(h.id) === habitId);

  const distanceM = Math.round((Number(distance.replace(",", ".")) || 0) * 1000);
  const durationS = (Number(duration) || 0) * 60;
  const pace = distanceM > 0 && durationS > 0 ? Math.round((durationS * 1000) / distanceM) : null;

  const volumeG = useMemo(
    () => sets.reduce((acc, s) => {
      const g = parseWeight(s.weight, unit);
      const reps = Number(s.reps);
      return acc + (g != null && reps > 0 ? g * reps : 0);
    }, 0),
    [sets, unit],
  );

  async function save() {
    setBusy(true);
    try {
      // Los ejercicios se crean al vuelo: escribir «press banca» en la fila y que
      // exista es lo que hace usable el formulario un día que se llega cansado.
      const resolved: { exercise_id: number; reps: number; weight_g: number; rpe?: number }[] = [];
      if (tab === "strength") {
        const cache = new Map(exercises.map((e) => [e.name.trim().toLowerCase(), e.id]));
        for (const s of sets) {
          const label = s.exercise.trim();
          const reps = Number(s.reps);
          const weight = parseWeight(s.weight, unit);
          if (!label || !reps || weight == null) continue;
          let id = cache.get(label.toLowerCase());
          if (id == null) {
            id = (await Api.createExercise({ name: label })).id;
            cache.set(label.toLowerCase(), id);
          }
          const rpe = Number(s.rpe);
          resolved.push({ exercise_id: id, reps, weight_g: weight, ...(rpe ? { rpe } : {}) });
        }
      }

      const res = await Api.createTrainingSession({
        kind: tab,
        occurred_on: date,
        name: name.trim() || null,
        duration_s: durationS || null,
        notes: notes.trim() || null,
        habit_id: habitId ? Number(habitId) : null,
        ...(tab === "hema" ? { intensity, techniques: techniques.trim() || null } : {}),
        ...(tab === "cardio" ? { cardio_kind: cardioKind, distance_m: distanceM || null } : {}),
        ...(tab === "strength" ? { sets: resolved } : {}),
      });
      if (res.xp) onXP(res.xp);
      await onSaved(res.habit_note, res.habit_marked);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Asentar sesión de ${KIND_META[tab].label.toLowerCase()}`} onClose={onClose}>
      <div className="mb-3 flex gap-1.5">
        {(Object.keys(KIND_META) as TrainingKind[]).map((k) => {
          const { label, Icon } = KIND_META[k];
          return (
            <button
              key={k} onClick={() => setTab(k)}
              className={`btn !py-1.5 ${k === tab ? "btn-primary" : ""}`}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[150px_1fr] gap-3">
        <Field label="Fecha">
          <input type="date" className="input tabular" value={date}
                 onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Nombre — opcional">
          <input className="input" value={name} placeholder="Empuje, Montante…"
                 onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <Field label="Rito que marca — opcional">
        <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
          <option value="">Ninguno</option>
          {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </Field>

      {/* La consecuencia se declara ANTES de que ocurra, y con fecha pasada NO es
          un error: es la regla de que el rito se marca el día que se entrena. */}
      {rito && (
        <div
          className="mb-3 flex items-start gap-2.5 rounded-sm py-2 pl-3 pr-3"
          style={{
            borderLeft: `2px solid ${esHoy ? "var(--gr-edge-arcane)" : "var(--border-strong)"}`,
            background: esHoy ? "rgba(169,139,240,.06)" : "rgba(210,203,219,.04)",
          }}
        >
          <span className={esHoy ? "text-[var(--purple-main)]" : "text-[var(--text-muted)]"}>
            {esHoy ? <IconCheck size={15} /> : <IconInfoCircle size={15} />}
          </span>
          <span className={`text-xs leading-snug ${esHoy ? "text-[var(--text-body)]" : "text-[var(--text-muted)]"}`}>
            {esHoy ? (
              <>Al asentar se marcará <strong className="text-[var(--text-primary)]">{rito.name}</strong>, con su XP y su racha.</>
            ) : (
              <>Fecha pasada: la sesión queda anotada, pero <strong className="text-[var(--text-body)]">no marca el rito</strong>. El rito se marca el día en que se entrena.</>
            )}
          </span>
        </div>
      )}

      {tab === "strength" && (
        <SetsEditor sets={sets} setSets={setSets} unit={unit} exercises={exercises} />
      )}

      {tab === "hema" && (
        <>
          <Field label="Intensidad percibida — opcional">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setIntensity(intensity === n ? null : n)}
                  className={`tabular inline-flex h-[34px] w-[38px] items-center justify-center rounded-md border text-sm transition-colors ${
                    intensity === n
                      ? "border-[var(--gr-arcane)] bg-[var(--accent-deep)] text-[var(--accent-strong)]"
                      : "border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Técnicas — opcional">
            <input className="input" value={techniques} placeholder="Zwerchhau, Krumphau"
                   onChange={(e) => setTechniques(e.target.value)} />
          </Field>
        </>
      )}

      {tab === "cardio" && (
        <>
          <Field label="Tipo">
            <div className="flex gap-1.5">
              {(["run", "bike", "other"] as const).map((k) => (
                <button key={k} onClick={() => setCardioKind(k)}
                        className={`btn !py-1.5 ${k === cardioKind ? "btn-primary" : ""}`}>
                  {k === "run" ? "Correr" : k === "bike" ? "Bici" : "Otro"}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Distancia — km">
              <input className="input tabular text-right" value={distance} placeholder="6,40"
                     onChange={(e) => setDistance(e.target.value)} />
            </Field>
            <Field label="Duración — min">
              <input className="input tabular text-right" value={duration} placeholder="34"
                     onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label="Ritmo — calculado">
              {/* Se muestra, nunca se pide. Sin distancia se queda en «—» en vez
                  de dividir entre cero. */}
              <div className="flex h-[38px] items-baseline justify-end gap-1 rounded-md border border-dotted border-[var(--border-strong)] px-3 py-2">
                <span className="tabular text-sm text-[var(--text-body)]">{formatPace(pace)}</span>
                <span className="text-2xs text-[var(--text-faint)]">min/km</span>
              </div>
            </Field>
          </div>
        </>
      )}

      {tab !== "cardio" && (
        <Field label="Duración — opcional, en minutos">
          <input className="input tabular" value={duration} placeholder="62"
                 onChange={(e) => setDuration(e.target.value)} />
        </Field>
      )}

      <Field label="Notas — opcional">
        <textarea className="input min-h-[64px] resize-none" value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex items-center gap-4 border-t border-[var(--border)] pt-3.5">
        {tab === "strength" && volumeG > 0 && (
          <span className="tabular text-sm text-[var(--text-body)]">
            {formatVolume(volumeG, unit)}
            <span className="ml-2 font-label text-2xs text-[var(--text-muted)]">Volumen</span>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Asentar</button>
        </div>
      </div>
    </Modal>
  );
}

function SetsEditor({ sets, setSets, unit, exercises }: {
  sets: SetDraft[];
  setSets: (s: SetDraft[]) => void;
  unit: WeightUnit;
  exercises: Exercise[];
}) {
  const patch = (i: number, key: keyof SetDraft, value: string) =>
    setSets(sets.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-label text-2xs text-[var(--text-muted)]">Series</span>
        <span className="gr-filete" />
        <span className="gr-rombo" />
      </div>
      <div className="mb-1 grid grid-cols-[1fr_62px_78px_58px_74px_24px] gap-1.5 px-0.5">
        <span className="font-label text-2xs text-[var(--text-muted)]">Ejercicio</span>
        <span className="text-right font-label text-2xs text-[var(--text-muted)]">Reps</span>
        <span className="text-right font-label text-2xs text-[var(--text-muted)]">Peso</span>
        <span className="text-right font-label text-2xs text-[var(--text-faint)]">RPE</span>
        <span className="text-right font-label text-2xs text-[var(--text-faint)]">1RM</span>
        <span />
      </div>
      {sets.map((s, i) => {
        const g = parseWeight(s.weight, unit);
        const reps = Number(s.reps);
        // Epley con el clamp: a una repetición el 1RM es el peso, sin inflar.
        const est = g != null && reps > 0 ? (reps <= 1 ? g : Math.round(g * (1 + reps / 30))) : null;
        const floja = reps > 10;
        return (
          <div key={i} className="mb-1.5 grid grid-cols-[1fr_62px_78px_58px_74px_24px] items-center gap-1.5">
            <input className="input" list="gr-ejercicios" value={s.exercise}
                   placeholder="Press banca"
                   onChange={(e) => patch(i, "exercise", e.target.value)} />
            <input className="input tabular text-right !px-2" value={s.reps} inputMode="numeric"
                   onChange={(e) => patch(i, "reps", e.target.value)} />
            <input className="input tabular text-right !px-2" value={s.weight} inputMode="decimal"
                   onChange={(e) => patch(i, "weight", e.target.value)} />
            {/* El RPE se ve opcional: borde discontinuo y tinta tenue. */}
            <input className="input tabular text-right !px-2 !border-dashed text-[var(--text-muted)]"
                   value={s.rpe} inputMode="numeric" placeholder="—"
                   onChange={(e) => patch(i, "rpe", e.target.value)} />
            <span className={`tabular text-right text-xs ${floja ? "text-[var(--warning)]" : "text-[var(--text-faint)]"}`}>
              {est != null ? (
                <span className={`border-b border-dotted pb-px ${floja ? "border-[var(--warning)]" : "border-[var(--text-faint)]"}`}>
                  {formatWeight(est, unit, { suffix: false })}{floja ? " ~" : ""}
                </span>
              ) : "—"}
            </span>
            <button className="flex justify-center text-[var(--text-faint)] hover:text-[var(--danger)]"
                    onClick={() => setSets(sets.length > 1 ? sets.filter((_, j) => j !== i) : [{ ...EMPTY_SET }])}
                    title="Quitar la serie">
              <IconTrash size={14} />
            </button>
          </div>
        );
      })}
      {sets.some((s) => Number(s.reps) > 10) && (
        <div className="mb-2 flex items-center gap-2 text-2xs text-[var(--warning)]">
          <span className="h-2 w-2 rounded-full border-[1.5px] border-[var(--warning)]" />
          Por encima de 10 repeticiones, Epley pierde precisión: úsalo como referencia, no como cifra.
        </div>
      )}
      <datalist id="gr-ejercicios">
        {exercises.map((e) => <option key={e.id} value={e.name} />)}
      </datalist>
      <div className="flex gap-2">
        <button className="btn btn-ghost !py-1.5 !text-2xs"
                onClick={() => setSets([...sets, { ...EMPTY_SET }])}>
          <IconPlus size={13} /> Añadir serie
        </button>
        <button className="btn btn-ghost !py-1.5 !text-2xs" disabled={sets.length === 0}
                onClick={() => setSets([...sets, { ...sets[sets.length - 1] }])}>
          Repetir la última
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- otros */

function BodyMetricModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (kind: BodyMetricKind) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<BodyMetricKind>("weight");
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = Number(value.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Modal title="Anotar medida" onClose={onClose}>
      <Field label="Qué se mide">
        <select className="input" value={kind}
                onChange={(e) => setKind(e.target.value as BodyMetricKind)}>
          {(Object.keys(METRIC_LABEL) as BodyMetricKind[]).map((k) => (
            <option key={k} value={k}>{METRIC_LABEL[k]} ({bodyMetricUnit(k)})</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input type="date" className="input tabular" value={date}
                 onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`Valor — ${bodyMetricUnit(kind)}`}>
          <input className="input tabular text-right" value={value} inputMode="decimal"
                 placeholder="76,9" onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <p className="mb-3 text-2xs leading-relaxed text-[var(--text-faint)]">
        Las medidas no dan XP, ni racha, ni logros: son dato de tendencia. Medir dos
        veces el mismo día corrige la anterior en vez de acumular dos puntos.
      </p>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3.5">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button
          className="btn btn-primary" disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await Api.saveBodyMetric({
                kind, measured_on: date,
                value_milli: Math.round(parsed * BODY_METRIC_MILLI),
              });
              await onSaved(kind);
            } finally { setBusy(false); }
          }}
        >
          Anotar
        </button>
      </div>
    </Modal>
  );
}

function GoalModal({ unit, exercises, onClose, onSaved }: {
  unit: WeightUnit;
  exercises: Exercise[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  const grams = parseWeight(weight || "0", unit);
  const valid = name.trim().length > 0 && grams != null && Number(reps) > 0;

  return (
    <Modal title="Declarar meta de fuerza" onClose={onClose}>
      <Field label="Ejercicio">
        <input className="input" list="gr-ejercicios-meta" value={name}
               placeholder="Press banca"
               onChange={(e) => setName(e.target.value)} />
        <datalist id="gr-ejercicios-meta">
          {exercises.map((e) => <option key={e.id} value={e.name} />)}
        </datalist>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Objetivo — ${unit}`}>
          <input className="input tabular text-right" value={weight} inputMode="decimal"
                 placeholder="100" onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label="Repeticiones">
          <input className="input tabular text-right" value={reps} inputMode="numeric"
                 onChange={(e) => setReps(e.target.value)} />
        </Field>
        <Field label="Fecha límite — opcional">
          <input type="date" className="input tabular" value={deadline}
                 onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <p className="mb-3 flex items-start gap-2 text-2xs leading-relaxed text-[var(--text-faint)]">
        <IconTargetArrow size={14} className="mt-px shrink-0" />
        <span>
          Se declara ahora y se sella con una serie posterior que la alcance. Un objetivo
          de 0 {unit} sirve para las metas a peso corporal: «10 dominadas limpias».
        </span>
      </p>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3.5">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button
          className="btn btn-primary" disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const ex = await Api.createExercise({ name: name.trim() });
              await Api.createStrengthGoal({
                exercise_id: ex.id,
                target_weight_g: grams ?? 0,
                target_reps: Number(reps),
                deadline: deadline || null,
              });
              await onSaved();
            } finally { setBusy(false); }
          }}
        >
          Declarar meta
        </button>
      </div>
    </Modal>
  );
}
