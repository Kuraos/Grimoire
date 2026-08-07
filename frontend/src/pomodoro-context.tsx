import {
  createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import { usePomodoro, PomodoroConfig, DEFAULT_CONFIG } from "./hooks/usePomodoro";
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
  reloadSessions: () => Promise<void>;
  reloadTasks: () => Promise<void>;
}

const Ctx = createContext<PomodoroState | null>(null);

/**
 * Holds the Pomodoro timer at app level so it keeps running across route changes
 * and every view sees the same session, linked task and today's log.
 */
export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { handleXP } = useApp();
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [taskId, setTaskId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const taskRef = useRef<string>("");
  const projectRef = useRef<string>("");
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

  const onWork = useCallback(async (minutes: number) => {
    playChime();
    notify("🍅 Pomodoro completado", `${minutes} minutos de foco · +15 XP`);
    try {
      handleXP(await Api.createSession({
        work_minutes: minutes,
        task_id: taskRef.current ? Number(taskRef.current) : null,
        project_id: projectRef.current ? Number(projectRef.current) : null,
      }));
      reloadSessions();
    } catch { /* offline */ }
  }, [handleXP, reloadSessions]);

  const pomo = usePomodoro(config, onWork);
  const activeTask = tasks.find((t) => String(t.id) === taskId) ?? null;

  // a task's project is inherited automatically
  useEffect(() => {
    if (activeTask?.project_id) setProjectId(String(activeTask.project_id));
  }, [activeTask]);

  return (
    <Ctx.Provider value={{ ...pomo, config, setConfig, taskId, setTaskId, projectId, setProjectId, tasks, projects, sessions, activeTask, reloadSessions, reloadTasks }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePomodoroCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePomodoroCtx must be used within PomodoroProvider");
  return ctx;
}
