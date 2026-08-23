import { NavLink } from "react-router-dom";
import {
  IconLayoutDashboard, IconRepeat, IconListCheck, IconClock, IconCalendar,
  IconBook2, IconChartHistogram, IconTrophy, IconNotebook, IconHexagon, IconCoins,
  IconBarbell,
} from "@tabler/icons-react";

const NAV = [
  { to: "/", icon: IconLayoutDashboard, label: "Dashboard" },
  { to: "/habitos", icon: IconRepeat, label: "Hábitos" },
  { to: "/tareas", icon: IconListCheck, label: "Tareas" },
  { to: "/pomodoro", icon: IconClock, label: "Pomodoro" },
  { to: "/calendario", icon: IconCalendar, label: "Calendario" },
  { to: "/diario", icon: IconBook2, label: "Diario" },
  { to: "/entrenamiento", icon: IconBarbell, label: "Entrenamiento" },
  { to: "/erario", icon: IconCoins, label: "Erario" },
  { to: "/estadisticas", icon: IconChartHistogram, label: "Estadísticas" },
  { to: "/logros", icon: IconTrophy, label: "Logros" },
  { to: "/revision", icon: IconNotebook, label: "Revisión semanal" },
];

export function Sidebar() {
  return (
    <nav
      className="flex w-[52px] flex-col items-center gap-3 py-4"
      style={{ background: "var(--gr-chrome)", borderRight: "0.5px solid var(--border)" }}
    >
      {/* La marca es lo único iluminado del cromo: un token de borde a 1.7:1
          la dejaba prácticamente invisible. */}
      <div className="mb-2 text-[var(--gr-gilded)]">
        <IconHexagon size={20} />
      </div>
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          end={to === "/"}
          className={({ isActive }) =>
            `group relative flex h-[34px] w-[34px] items-center justify-center rounded-lg transition-colors ${
              isActive
                ? "bg-[var(--gr-surface-raised)] text-[var(--purple-main)] border border-[var(--border-accent)]"
                : "text-[var(--gr-ink-faint)] hover:text-[var(--purple-main)]"
            }`
          }
        >
          <Icon size={17} />
          <span className="pointer-events-none absolute left-[44px] z-50 whitespace-nowrap rounded border border-[var(--border-accent)] bg-[var(--bg-deep)] px-2 py-1 text-xs font-display text-[var(--text-body)] opacity-0 transition-opacity group-hover:opacity-100">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
