import { IconHistory, IconSettings } from "@tabler/icons-react";
import { Card } from "../components/ui/Card";
import { SectionBand } from "../components/ui/SectionBand";
import { PageHeader } from "../components/layout/PageHeader";
import { PomodoroTimer, PomodoroCycle } from "../components/ui/PomodoroTimer";
import { usePomodoroCtx } from "../pomodoro-context";
import { fmtTime } from "../utils";
import type { PomodoroSession } from "../types";

export default function Pomodoro() {
  const pomo = usePomodoroCtx();
  const { config, setConfig, tasks, projects, taskId, setTaskId, projectId, setProjectId, sessions, activeTask } = pomo;

  const totalMinutes = sessions.reduce((s, x) => s + (x.completed ? x.work_minutes : 0), 0);
  // Las abandonadas se cuentan aparte: no puntúan, pero ocultarlas de la
  // cabecera haría que el día pareciera más limpio de lo que fue.
  const done = sessions.filter((s) => s.completed).length;
  const abandoned = sessions.length - done;
  // Heredado es una procedencia, no un candado: deja de serlo en cuanto se cambia.
  const inheritedProject = activeTask?.project_id != null && projectId === String(activeTask.project_id);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Pomodoro"
        context={
          sessions.length === 0
            ? "Sin sesiones aún hoy"
            : `${done} sesion${done === 1 ? "" : "es"} · ${totalMinutes} min de foco` +
              (abandoned > 0 ? ` · ${abandoned} abandonada${abandoned === 1 ? "" : "s"}` : "")
        }
      >
        <PomodoroCycle done={pomo.cycleDone} />
      </PageHeader>

      {/* Reloj a la izquierda, ajustes y log a la derecha — no debajo.
          Apilados, la configuración quedaba fuera de pantalla justo cuando se
          quiere cambiar la duración: antes de arrancar. Al lado, todo lo que
          gobierna la sesión cabe en una mirada. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 lg:flex-[1.6]">
        {/* La rúbrica de la vista: el temporizador es lo que se viene a hacer
            aquí; la configuración y el log lo acompañan. La esfera y su mando
            comparten card —el rótulo vive dentro, en la columna derecha— para
            que lo que se pulsa quede al lado de lo que se mira. */}
        <Card rank="rubric">
          <div className="gr-sangrado py-2">
            <PomodoroTimer
              phase={pomo.phase}
              secondsLeft={pomo.secondsLeft}
              totalSeconds={pomo.totalSeconds}
              running={pomo.running}
              progress={pomo.progress}
              subtitle={activeTask?.title}
              onStart={pomo.start}
              onPause={pomo.pause}
              onReset={pomo.reset}
              onSkip={pomo.skip}
              side={
                <>
                  <label className="block">
                    <span className="mb-1.5 block font-label text-xs text-[var(--text-muted)]">Tarea vinculada</span>
                    <select className="input bg-[var(--gr-surface-sunken)]" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                      <option value="">Sin vincular</option>
                      {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block font-label text-xs text-[var(--text-muted)]">
                      Proyecto {inheritedProject && <span className="text-[var(--purple-main)]">· heredado de la tarea</span>}
                    </span>
                    <select className="input bg-[var(--gr-surface-sunken)]" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                      <option value="">Sin proyecto</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </>
              }
            />
          </div>
        </Card>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Card title="Configuración" icon={<IconSettings size={14} />}>
          <ConfigRow label="Trabajo" value={config.work} onChange={(v) => setConfig({ ...config, work: v })} />
          <ConfigRow label="Descanso corto" value={config.short} onChange={(v) => setConfig({ ...config, short: v })} />
          <ConfigRow label="Descanso largo" value={config.long} onChange={(v) => setConfig({ ...config, long: v })} />
          <p className="mt-2.5 text-xs italic text-[var(--text-faint)]">
            El descanso largo entra cada cuatro pomodoros del ciclo.
          </p>
        </Card>

        <Card title="Log del día" icon={<IconHistory size={14} />} right={<span className="font-label text-xs text-[var(--purple-main)]">{totalMinutes} min foco</span>}>
          {sessions.length === 0 && <p className="text-sm text-[var(--text-muted)]">Sin sesiones aún.</p>}
          {/* Las abandonadas se registran para que las horas cuadren, pero no
              puntúan: se leen como lo que son, en tinta tenue y sin acento. */}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 text-xs last:border-none ${
                s.completed ? "text-[var(--text-body)]" : "text-[var(--text-faint)]"
              }`}
            >
              <span className="tabular text-[var(--text-muted)]">{fmtTime(s.started_at)}</span>
              <span className="truncate">{s.task_title ?? "Sesión libre"}</span>
              {!s.completed && <span className="shrink-0 italic">abandonada</span>}
              <span className={`ml-auto tabular ${s.completed ? "text-[var(--purple-main)]" : ""}`}>
                {s.work_minutes}m
              </span>
            </div>
          ))}
        </Card>
      </div>
      </div>

      {/* La jornada cierra la vista a lo ancho: las sesiones del día sobre la
          recta de 18 horas. El log de arriba ya las lista en orden, pero en
          lista no se ve el hueco de las once a las cuatro — y ese hueco es lo
          que se quiere ver. */}
      <Card rank="pozo">
        <SectionBand versal="L" label="a jornada · 06:00 → 24:00" fill="filete"
                     count={`${totalMinutes} min`}>
          <DayLine sessions={sessions} />
        </SectionBand>
      </Card>
    </div>
  );
}

/* La recta del día, de las 06:00 a medianoche.
 *
 * Una sesión completada es un bloque de arcano macizo; una abandonada, el mismo
 * bloque en discontinuo y vacío. La diferencia importa: las abandonadas se
 * registran para que las horas cuadren, pero no puntúan, y pintarlas iguales
 * habría hecho que el día pareciera más productivo de lo que fue.
 *
 * El filo de oro marca la hora actual. Es el único oro de la pieza y no premia
 * nada: sitúa. */
const H0 = 6;
const H1 = 24;
const SPAN = H1 - H0;

function DayLine({ sessions }: { sessions: PomodoroSession[] }) {
  const now = new Date();
  const hours = now.getHours() + now.getMinutes() / 60;
  const pct = (h: number) => ((h - H0) / SPAN) * 100;

  return (
    <div>
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-[30px] h-px bg-[var(--gr-edge)]" />
        {Array.from({ length: SPAN + 1 }, (_, i) => H0 + i).map((h) => {
          const major = h % 3 === 0;
          return (
            <span key={h}>
              <span className="absolute w-px" style={{
                left: `${pct(h)}%`, top: major ? 24 : 27,
                height: major ? 13 : 7,
                background: major ? "var(--border-strong)" : "var(--gr-edge)",
              }} />
              {major && (
                <span className="absolute -translate-x-1/2 tabular text-2xs text-[var(--text-faint)]"
                      style={{ left: `${pct(h)}%`, top: 44 }}>
                  {String(h).padStart(2, "0")}
                </span>
              )}
            </span>
          );
        })}
        {sessions.map((s) => {
          const d = new Date(s.started_at);
          const h = d.getHours() + d.getMinutes() / 60;
          if (h < H0) return null;
          return (
            <span
              key={s.id}
              title={`${fmtTime(s.started_at)} · ${s.task_title ?? "Sesión libre"} · ${s.work_minutes}m${s.completed ? "" : " (abandonada)"}`}
              className="absolute top-[22px] h-[17px] rounded-xs"
              style={{
                left: `${pct(h)}%`,
                width: `${(s.work_minutes / 60 / SPAN) * 100}%`,
                background: s.completed ? "var(--gr-arcane)" : "transparent",
                border: s.completed
                  ? "1px solid var(--gr-arcane-bright)"
                  : "1px dashed var(--border-strong)",
              }}
            />
          );
        })}
        {hours >= H0 && hours <= H1 && (
          <span className="absolute top-[18px] h-6 w-px bg-[var(--gr-gilded)]"
                style={{ left: `${pct(hours)}%` }} title="Ahora" />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-4 font-label text-2xs text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-xs bg-[var(--gr-arcane)]" />foco completado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-xs border border-dashed border-[var(--border-strong)]" />abandonada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-[var(--gr-gilded)]" />ahora
        </span>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-body)]">
      <span className="flex-1">{label}</span>
      <input
        type="number" min={1} max={90} value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
        className="input w-16 text-center"
      />
      <span className="text-[var(--text-muted)]">min</span>
    </div>
  );
}
