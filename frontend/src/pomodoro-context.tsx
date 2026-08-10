import {
  createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import {
  usePomodoro, restoreSnapshot, DEFAULT_CONFIG,
  type PomodoroConfig, type PomodoroSnapshot, type Phase, type WorkResult,
} from "./hooks/usePomodoro";
import { Api } from "./api/endpoints";
import { useApp } from "./context";
import { playChime } from "./sounds";
import { notify } from "./notify";
import type { Task, Project, PomodoroSession } from "./types";

type PomoHook = ReturnType<typeof usePomodoro>;

interface PomodoroState extends PomoHook {
  config: PomodoroConfig;
  setConfig: (c: PomodoroConfig) => void;
  taskId: string;
  setTaskId: (id: string) => void;
  projectId: string;
  setProjectId: (id: string) => void;
  tasks: Task[];
  projects: Project[];
  sessions: PomodoroSession[];
  activeTask: Task | null;
  /** Vincula una tarea y arranca el foco de una vez, desde cualquier vista. */
  startWithTask: (task: Task) => void;
  reloadSessions: () => Promise<void>;
  reloadTasks: () => Promise<void>;
}

const Ctx = createContext<PomodoroState | null>(null);

const STORE_KEY = "grimoire.pomodoro.v1";

interface Persisted {
  config: PomodoroConfig;
  taskId: string;
  projectId: string;
  timer: PomodoroSnapshot;
}

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {}; // almacenamiento bloqueado o JSON a medio escribir
  }
}

/** Los mismos límites que acepta el formulario: nada de restaurar un 0 o un NaN. */
function restoreConfig(raw: unknown): PomodoroConfig {
  const c = raw as Partial<PomodoroConfig> | null | undefined;
  if (!c) return DEFAULT_CONFIG;
  const step = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(90, Math.max(1, Math.trunc(v))) : fallback;
  return {
    work: step(c.work, DEFAULT_CONFIG.work),
    short: step(c.short, DEFAULT_CONFIG.short),
    long: step(c.long, DEFAULT_CONFIG.long),
  };
}

const asId = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Holds the Pomodoro timer at app level so it keeps running across route changes
 * and every view sees the same session, linked task and today's log.
 */
export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { handleXP } = useApp();

  // Una sola lectura del almacenamiento, en el primer render.
  const [stored] = useState(loadPersisted);
  const [config, setConfig] = useState<PomodoroConfig>(() => restoreConfig(stored.config));
  const [taskId, setTaskIdState] = useState<string>(() => asId(stored.taskId));
  const [projectId, setProjectId] = useState<string>(() => asId(stored.projectId));
  const [initialTimer] = useState<PomodoroSnapshot>(() =>
    restoreSnapshot(stored.timer, restoreConfig(stored.config))
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const taskRef = useRef<string>(taskId);
  const projectRef = useRef<string>(projectId);
  taskRef.current = taskId;
  projectRef.current = projectId;

  const reloadSessions = useCallback(async () => {
    try { setSessions(await Api.todaySessions()); } catch { /* offline */ }
  }, []);
  const reloadTasks = useCallback(async () => {
    try { setTasks(await Api.listTasks("?completed=false")); } catch { /* offline */ }
  }, []);

  useEffect(() => {
    reloadTasks();
    reloadSessions();
    Api.listProjects().then(setProjects).catch(() => {});
  }, [reloadTasks, reloadSessions]);

  const onWorkEnd = useCallback(async (r: WorkResult) => {
    if (r.completed) playChime();
    try {
      const res = await Api.createSession({
        work_minutes: r.minutes,
        completed: r.completed,
        started_at: new Date(r.startedAt).toISOString(),
        task_id: taskRef.current ? Number(taskRef.current) : null,
        project_id: projectRef.current ? Number(projectRef.current) : null,
      });
      // Una sesión abandonada se guarda para que las horas cuadren, pero no
      // puntúa: ni XP, ni logros, ni aviso de enhorabuena.
      if (r.completed) {
        handleXP(res);
        notify("🍅 Pomodoro completado", `${r.minutes} minutos de foco · +${res.xp_earned} XP`);
      }
      reloadSessions();
    } catch {
      if (r.completed) notify("🍅 Pomodoro completado", `${r.minutes} minutos de foco`);
    }
  }, [handleXP, reloadSessions]);

  const onBreakEnd = useCallback((phase: Phase) => {
    playChime();
    // El descanso termina justo cuando nadie mira la pantalla: sin aviso, se pasa.
    notify(
      "Descanso terminado",
      phase === "long" ? "Ciclo completo. Empieza uno nuevo." : "De vuelta al foco."
    );
  }, []);

  const pomo = usePomodoro(config, { onWorkEnd, onBreakEnd }, initialTimer);
  const activeTask = tasks.find((t) => String(t.id) === taskId) ?? null;

  /**
   * El proyecto de la tarea es un valor por defecto, no una imposición: se
   * aplica al vincular y desde ahí el usuario manda. Vivía en un efecto sobre
   * `activeTask`, y como `reloadTasks` devuelve objetos nuevos, cualquier
   * recarga volvía a pisar el proyecto elegido a mano; por eso el campo estaba
   * bloqueado, y bloqueado dejaba residuo al desvincular.
   */
  const setTaskId = useCallback((id: string) => {
    const prev = tasks.find((t) => String(t.id) === taskId);
    const next = tasks.find((t) => String(t.id) === id);
    setTaskIdState(id);
    setProjectId((current) => {
      if (next?.project_id != null) return String(next.project_id);
      // Sólo se retira lo que se había heredado; lo elegido a mano se respeta.
      const wasInherited = prev?.project_id != null && current === String(prev.project_id);
      return wasInherited ? "" : current;
    });
  }, [tasks, taskId]);

  const startWithTask = useCallback((task: Task) => {
    // Primero el temporizador y después los refs: si había un bloque a medias,
    // la sesión abandonada es de la tarea que se deja, no de la que empieza.
    pomo.startFocus();
    setTaskIdState(String(task.id));
    if (task.project_id != null) setProjectId(String(task.project_id));
    // Los refs alimentan el registro de la sesión y el hook puede cerrarla antes
    // del siguiente render, así que se adelantan aquí.
    taskRef.current = String(task.id);
    if (task.project_id != null) projectRef.current = String(task.project_id);
  }, [pomo]);

  // Sobrevivir a cerrar la app: sin esto se perdían la configuración, el vínculo
  // y el punto del ciclo en que iba la tarde.
  useEffect(() => {
    try {
      const data: Persisted = { config, taskId, projectId, timer: pomo.snapshot };
      window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch { /* almacenamiento lleno o bloqueado */ }
  }, [config, taskId, projectId, pomo.snapshot]);

  return (
    <Ctx.Provider value={{ ...pomo, config, setConfig, taskId, setTaskId, projectId, setProjectId, tasks, projects, sessions, activeTask, startWithTask, reloadSessions, reloadTasks }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePomodoroCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePomodoroCtx must be used within PomodoroProvider");
  return ctx;
}
