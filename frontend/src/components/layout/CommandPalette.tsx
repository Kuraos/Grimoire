import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconSearch } from "@tabler/icons-react";
import { TablerIcon } from "../TablerIcon";
import { usePomodoroCtx } from "../../pomodoro-context";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function CommandPalette() {
  const nav = useNavigate();
  const pomo = usePomodoroCtx();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K toggles, Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => { nav(path); setOpen(false); };
    return [
      { id: "dash", label: "Ir al Dashboard", icon: "layout-dashboard", run: go("/") },
      { id: "habitos", label: "Ir a Hábitos", icon: "repeat", run: go("/habitos") },
      { id: "tareas", label: "Ir a Tareas y Proyectos", icon: "list-check", run: go("/tareas") },
      { id: "pomodoro", label: "Ir a Pomodoro", icon: "clock", run: go("/pomodoro") },
      { id: "calendario", label: "Ir al Calendario", icon: "calendar", run: go("/calendario") },
      { id: "diario", label: "Ir al Diario", icon: "book", run: go("/diario") },
      { id: "estadisticas", label: "Ir a Estadísticas", icon: "chart-bar", run: go("/estadisticas") },
      { id: "logros", label: "Ir a Logros", icon: "trophy", run: go("/logros") },
      { id: "revision", label: "Ir a Revisión semanal", icon: "notebook", run: go("/revision") },
      {
        id: "pomo-toggle",
        label: pomo.running ? "Pausar Pomodoro" : "Iniciar Pomodoro",
        hint: "Espacio",
        icon: pomo.running ? "player-pause" : "player-play",
        run: () => { pomo.running ? pomo.pause() : pomo.start(); setOpen(false); },
      },
    ];
  }, [nav, pomo]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[active]?.run(); }
  };

  return (
    <div data-overlay="" className="fixed inset-0 z-[110] flex items-start justify-center bg-[rgba(5,3,8,0.6)] pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-lg border border-[var(--border-accent)] bg-[var(--bg-deep)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <IconSearch size={16} className="text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Saltar a… o ejecutar una acción"
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">Esc</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Sin resultados.</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setActive(i)}
              onClick={c.run}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                i === active ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-body)]"
              }`}
            >
              <TablerIcon name={c.icon} size={16} className="text-[var(--purple-main)]" />
              <span className="flex-1">{c.label}</span>
              {c.hint && <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">{c.hint}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
