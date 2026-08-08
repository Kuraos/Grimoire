import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconRepeat, IconClock, IconListCheck, IconCalendar, IconBolt, IconChartBar,
} from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { usePomodoroCtx } from "../pomodoro-context";
import { XPBar } from "../components/ui/XPBar";
import { HabitRow } from "../components/ui/HabitRow";
import { TaskCard } from "../components/ui/TaskCard";
import { EnergyCheckin } from "../components/ui/EnergyCheckin";
import { MiniCalendar, MONTHS_ES } from "../components/ui/MiniCalendar";
import { PomodoroTimer } from "../components/ui/PomodoroTimer";
import { QuestsCard } from "../components/ui/QuestsCard";
import { Card } from "../components/ui/Card";
import { todayISO, isoDateTime, streakMultiplier, DOT_COLORS } from "../utils";
import type { Habit, Task, Checkin, DaySummary } from "../types";

export default function Dashboard() {
  const { handleXP, pushToast } = useApp();
  const pomo = usePomodoroCtx();
  const nav = useNavigate();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [marks, setMarks] = useState<Record<string, string[]>>({});

  const today = todayISO();
  const now = new Date();

  const load = useCallback(async () => {
    try {
      const [h, t, c, s] = await Promise.all([
        Api.listHabits(),
        Api.listTasks("?completed=false&sort=priority"),
        Api.getCheckin(today),
        Api.daySummary(today),
      ]);
      setHabits(h);
      setTasks(t.slice(0, 4));
      setCheckin(c);
      setSummary(s);
    } catch {
      /* offline banner */
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  // mini calendar dots: events (blue) + days with completed habits (purple)
  useEffect(() => {
    (async () => {
      try {
        const start = isoDateTime(new Date(now.getFullYear(), now.getMonth(), 1));
        const end = isoDateTime(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59));
        const [events, stats] = await Promise.all([Api.listEvents(start, end), Api.stats("year")]);
        const m: Record<string, string[]> = {};
        events.forEach((e) => ((m[e.start_dt.slice(0, 10)] ??= []).push(DOT_COLORS.event)));
        stats.heatmap.filter((d) => d.count > 0).forEach((d) => ((m[d.date] ??= []).push(DOT_COLORS.habit)));
        setMarks(m);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeHabit = async (h: Habit) => {
    try {
      handleXP(await Api.completeHabit(h.id));
      load();
    } catch {
      /* ignore */
    }
  };

  const undoHabit = async (h: Habit) => {
    try {
      await Api.uncompleteHabit(h.id);
      pushToast({ title: "Deshecho", body: `${h.name} · ${h.xp_reward} XP revertidos`, icon: "arrow-back-up" });
      load();
    } catch {
      /* ignore */
    }
  };

  const completeTask = async (t: Task) => {
    try {
      handleXP(await Api.completeTask(t.id));
      load();
    } catch {
      /* ignore */
    }
  };

  const saveCheckin = async (energy: number, mood: number) => {
    try {
      handleXP(await Api.saveCheckin(today, { energy, mood }));
      setCheckin(await Api.getCheckin(today));
      load();
    } catch {
      /* ignore */
    }
  };

  const doneCount = habits.filter((h) => h.done_today).length;
  const bestStreak = habits.reduce((m, h) => Math.max(m, h.streak), 0);
  const bonus = streakMultiplier(bestStreak);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {/* Era la única vista sin título. Con la rúbrica a 44px en las otras
          ocho, la ausencia se notaba más que la presencia. */}
      <h1 className="gr-title-module md:col-span-2 lg:col-span-3">Hoy</h1>

      <div className="md:col-span-2 lg:col-span-3">
        <XPBar xpToday={summary?.xp_earned} streakBonus={bonus} />
      </div>

      {/* Rúbrica: el bucle diario es lo que la vista existe para servir. */}
      <Card
        rank="rubric"
        title="Hábitos de hoy"
        icon={<IconRepeat size={14} />}
        right={
          <span className="tabular text-xl leading-none">
            <span className="text-[var(--gr-gilded)]">{doneCount}</span>
            <span className="text-[var(--text-faint)]">/{habits.length}</span>
          </span>
        }
      >
        {habits.length === 0 && <p className="text-sm text-[var(--text-muted)]">Sin hábitos. Créalos en la sección Hábitos.</p>}
        {habits.map((h) => (
          <HabitRow key={h.id} habit={h} onComplete={completeHabit} onUndo={undoHabit} onClick={() => nav("/habitos")} />
        ))}
      </Card>

      <Card title="Pomodoro" icon={<IconClock size={14} />}>
        <PomodoroTimer
          phase={pomo.phase}
          secondsLeft={pomo.secondsLeft}
          running={pomo.running}
          progress={pomo.progress}
          subtitle={pomo.activeTask?.title}
          big={false}
          onStart={pomo.start}
          onPause={pomo.pause}
          onReset={pomo.reset}
        />
        <button className="btn mt-3 w-full justify-center" onClick={() => nav("/pomodoro")}>
          {pomo.running ? "Ver sesión" : "Configurar sesión"}
        </button>
      </Card>

      <Card title="Tareas prioritarias" icon={<IconListCheck size={14} />}>
        {tasks.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nada pendiente. ✦</p>}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} compact onComplete={completeTask} />
        ))}
      </Card>

      <QuestsCard />

      <Card title="Energía / Ánimo" icon={<IconBolt size={14} />}>
        <EnergyCheckin existing={checkin} onSave={saveCheckin} />
      </Card>

      <Card title={`${MONTHS_ES[now.getMonth()]} ${now.getFullYear()}`} icon={<IconCalendar size={14} />}>
        <MiniCalendar month={now.getMonth()} year={now.getFullYear()} marks={marks} onSelect={() => nav("/calendario")} />
      </Card>

      {/* Marginalia: contar tres cifras no necesita un marco. Pierde la caja y
          se convierte en el pie de la vista. */}
      <Card
        rank="marginalia"
        title="Resumen del día"
        icon={<IconChartBar size={14} />}
        className="md:col-span-2 lg:col-span-3"
      >
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <Stat value={`${summary?.xp_earned ?? 0}`} label="XP hoy" gold />
          <Stat value={`${doneCount}/${habits.length}`} label="Hábitos" />
          <Stat value={`${summary?.pomodoro_minutes ?? 0}m`} label="Foco" />
        </div>
      </Card>
    </div>
  );
}

/* Sin caja: en marginalia la cifra y su rótulo se sostienen solos. */
function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div>
      <div
        className="text-xl tabular leading-none"
        style={{ color: gold ? "var(--gr-gilded)" : "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-2xs font-label text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
