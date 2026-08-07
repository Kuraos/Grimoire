import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { ToastAchievement } from "./components/layout/ToastAchievement";
import { LevelUpOverlay } from "./components/layout/LevelUpOverlay";
import { CommandPalette } from "./components/layout/CommandPalette";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { ConfirmHost } from "./confirm";
import { PageSkeleton } from "./components/ui/Skeleton";
import { useApp } from "./context";
import { usePomodoroCtx } from "./pomodoro-context";
import { useReminders } from "./hooks/useReminders";
import { ensureNotifyPermission } from "./notify";
import { checkForUpdate, isDesktop } from "./updater";
import { Api } from "./api/endpoints";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Habits = lazy(() => import("./pages/Habits"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Pomodoro = lazy(() => import("./pages/Pomodoro"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Diary = lazy(() => import("./pages/Diary"));
const Stats = lazy(() => import("./pages/Stats"));
const Achievements = lazy(() => import("./pages/Achievements"));
const WeeklyReview = lazy(() => import("./pages/WeeklyReview"));

export default function App() {
  const { online, refreshUser, pushToast } = useApp();
  const pomo = usePomodoroCtx();
  const location = useLocation();
  useReminders();

  // ask for notification permission once, and evaluate streak penalties on load
  useEffect(() => {
    ensureNotifyPermission();
    Api.evaluateStreaks()
      .then((r) => {
        if (r.life_lost) {
          pushToast({ title: "Racha rota", body: `Perdiste una vida (${r.broken_habits[0] ?? "hábito"})`, icon: "heart-broken", variant: "error" });
          refreshUser();
        } else if (r.xp_penalty > 0) {
          pushToast({ title: "Racha rota", body: `−${r.xp_penalty} XP`, icon: "heart-broken", variant: "error" });
          refreshUser();
        }
        if (r.lives_gained > 0) {
          pushToast({ title: "Vida recuperada", body: `Día perfecto · +${r.lives_gained} ♥`, icon: "heart" });
          refreshUser();
        }
      })
      .catch(() => {});
  }, [refreshUser, pushToast]);

  // Aviso de actualización disponible. Se retrasa para no competir con la carga
  // inicial y falla en silencio: quedarse sin red no es algo que deba molestar.
  // Sólo avisa — instalar exige ir a Ajustes y confirmar, porque reinicia la app.
  useEffect(() => {
    if (!isDesktop()) return;
    const t = setTimeout(() => {
      checkForUpdate()
        .then((u) => {
          if (u) {
            pushToast({
              title: "Actualización disponible",
              body: `Grimoire ${u.version} — instálala desde Ajustes`,
              icon: "download",
            });
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, [pushToast]);

  // Space toggles the Pomodoro timer (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        pomo.running ? pomo.pause() : pomo.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pomo]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        {!online && (
          <div className="border-b border-[var(--gr-edge-danger)] bg-[var(--danger-bg)] py-1.5 text-center font-label text-xs text-[var(--danger)]">
            Sin conexión con el servidor — reintentando…
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4">
          {/* key por ruta: al navegar a otra sección el boundary se remonta
              y el error queda atrás sin necesidad de recargar la app */}
          <ErrorBoundary key={location.pathname} scope={location.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/habitos" element={<Habits />} />
              <Route path="/tareas" element={<Tasks />} />
              <Route path="/pomodoro" element={<Pomodoro />} />
              <Route path="/calendario" element={<Calendar />} />
              <Route path="/diario" element={<Diary />} />
              <Route path="/estadisticas" element={<Stats />} />
              <Route path="/logros" element={<Achievements />} />
              <Route path="/revision" element={<WeeklyReview />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <ToastAchievement />
      <LevelUpOverlay />
      <CommandPalette />
      <ConfirmHost />
    </div>
  );
}
