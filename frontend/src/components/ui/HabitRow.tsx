import { IconCheck, IconFlame } from "@tabler/icons-react";
import type { Habit } from "../../types";
import { CATEGORY_COLORS } from "../../utils";

export function HabitRow({ habit, onComplete, onUndo, onClick }: {
  habit: Habit;
  onComplete: (h: Habit) => void;
  onUndo?: (h: Habit) => void;
  onClick?: (h: Habit) => void;
}) {
  const color = habit.color || CATEGORY_COLORS[habit.category] || "var(--gr-arcane)";
  return (
    <div className="flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 text-sm text-[var(--text-body)] last:border-none">
      <button
        onClick={() => (habit.done_today ? onUndo?.(habit) : onComplete(habit))}
        title={habit.done_today ? "Deshacer" : "Marcar como completado"}
        className={`group flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
          habit.done_today
            ? "border-[var(--gr-edge-focus)] bg-[var(--purple-deep)]"
            : "border-[var(--border-accent)] hover:border-[var(--border-glow)]"
        }`}
      >
        {habit.done_today && <IconCheck size={10} className="text-[var(--gr-arcane-bright)]" />}
      </button>
      <span
        className="h-2.5 w-1 shrink-0 rounded"
        style={{ background: color }}
        title={habit.category}
      />
      <span
        className={`cursor-pointer truncate hover:text-[var(--text-primary)] ${habit.done_today ? "text-[var(--text-muted)]" : ""}`}
        onClick={() => onClick?.(habit)}
      >
        {habit.name}
      </span>
      <span className="ml-auto flex items-center gap-1 text-xs text-[var(--purple-main)]">
        <IconFlame size={12} /> {habit.streak}
      </span>
    </div>
  );
}
