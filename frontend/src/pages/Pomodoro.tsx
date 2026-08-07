import { IconClock, IconHistory, IconSettings } from "@tabler/icons-react";
import { Card } from "../components/ui/Card";
import { PomodoroTimer } from "../components/ui/PomodoroTimer";
import { usePomodoroCtx } from "../pomodoro-context";
import { fmtTime } from "../utils";

export default function Pomodoro() {
  const pomo = usePomodoroCtx();
  const { config, setConfig, tasks, projects, taskId, setTaskId, projectId, setProjectId, sessions, activeTask } = pomo;

  const totalMinutes = sessions.reduce((s, x) => s + (x.completed ? x.work_minutes : 0), 0);
  const inheritedProject = activeTask?.project_id != null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <h1 className="gr-title-module lg:col-span-3">Pomodoro</h1>

      <div className="lg:col-span-2">
        <Card title="Temporizador" icon={<IconClock size={14} />}>
          <div className="py-4">
            <PomodoroTimer
              phase={pomo.phase}
              secondsLeft={pomo.secondsLeft}
              running={pomo.running}
              progress={pomo.progress}
              subtitle={activeTask?.title}
              onStart={pomo.start}
              onPause={pomo.pause}
              onReset={pomo.reset}
              onSkip={pomo.skip}
            />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-label text-xs text-[var(--text-muted)]">Tarea vinculada (opcional)</span>
              <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Sin vincular</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-label text-xs text-[var(--text-muted)]">
                Proyecto {inheritedProject && <span className="text-[var(--purple-muted)]">· heredado de la tarea</span>}
              </span>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={inheritedProject}>
                <option value="">Sin proyecto</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Configuración" icon={<IconSettings size={14} />}>
          <ConfigRow label="Trabajo" value={config.work} onChange={(v) => setConfig({ ...config, work: v })} />
          <ConfigRow label="Descanso corto" value={config.short} onChange={(v) => setConfig({ ...config, short: v })} />
          <ConfigRow label="Descanso largo" value={config.long} onChange={(v) => setConfig({ ...config, long: v })} />
        </Card>

        <Card title="Log del día" icon={<IconHistory size={14} />} right={<span className="font-label text-xs text-[var(--purple-main)]">{totalMinutes} min foco</span>}>
          {sessions.length === 0 && <p className="text-sm text-[var(--text-muted)]">Sin sesiones aún.</p>}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 text-xs text-[var(--text-body)] last:border-none">
              <span className="tabular text-[var(--text-muted)]">{fmtTime(s.started_at)}</span>
              <span className="truncate">{s.task_title ?? "Sesión libre"}</span>
              <span className="ml-auto tabular text-[var(--purple-main)]">{s.work_minutes}m</span>
            </div>
          ))}
        </Card>
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
