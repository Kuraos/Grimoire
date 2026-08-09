import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconEdit, IconCalendarPlus } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { Modal, Field } from "../components/ui/Modal";
import { confirm } from "../confirm";
import { MONTHS_ES, WEEKDAYS_ES, DOT_COLORS, isoDate, isoDateTime, fmtTime } from "../utils";
import type { CalendarEvent, Task, PomodoroSession } from "../types";

export default function Calendar() {
  const { pushToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [habitDays, setHabitDays] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>(isoDate(new Date()));
  const [modal, setModal] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
  // widen by a week so weeks straddling a month boundary still load their sessions/events
  const rangeStart = new Date(monthStart); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(monthEnd); rangeEnd.setDate(rangeEnd.getDate() + 7);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar el mismo archivo
    if (!file) return;
    setImporting(true);
    try {
      const res = await Api.importIcs(await file.text());
      const parts = [];
      if (res.created) parts.push(`${res.created} creados`);
      if (res.updated) parts.push(`${res.updated} actualizados`);
      pushToast({
        title: "Calendario importado",
        body: `${res.events_in_file} eventos del archivo · ${parts.join(" · ") || "sin cambios"}`,
        icon: "calendar",
      });
      res.warnings.slice(0, 2).forEach((w) =>
        pushToast({ title: "Aviso de importación", body: w, icon: "alert-triangle", variant: "error" })
      );
      load();
    } catch {
      /* el cliente ya muestra el error del backend */
    } finally {
      setImporting(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [ev, ts, st, ps] = await Promise.all([
        Api.listEvents(isoDateTime(rangeStart), isoDateTime(rangeEnd)),
        Api.listTasks(""),
        Api.stats("year"),
        Api.sessionsRange(isoDate(rangeStart), isoDate(rangeEnd)),
      ]);
      setEvents(ev);
      setTasks(ts);
      setHabitDays(new Set(st.heatmap.filter((h) => h.count > 0).map((h) => h.date)));
      setSessions(ps);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => {
    load();
  }, [load]);

  const dots = useMemo(() => {
    const m: Record<string, string[]> = {};
    const add = (d: string, c: string) => { (m[d] ??= []).push(c); };
    events.forEach((e) => add(e.start_dt.slice(0, 10), DOT_COLORS.event));
    habitDays.forEach((d) => add(d, DOT_COLORS.habit));
    tasks.forEach((t) => {
      if (t.completed && t.completed_at) add(t.completed_at.slice(0, 10), DOT_COLORS.taskDone);
      if (t.due_date && !t.completed) add(t.due_date, DOT_COLORS.taskDue);
    });
    return m;
  }, [events, habitDays, tasks]);

  const move = (delta: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    setCursor(d);
  };

  const dayEvents = events.filter((e) => e.start_dt.slice(0, 10) === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="gr-title-module">Calendario</h1>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn" onClick={() => move(-1)}><IconChevronLeft size={14} /></button>
          <button className="btn" onClick={() => { setCursor(new Date()); setSelected(isoDate(new Date())); }}>Hoy</button>
          <button className="btn" onClick={() => move(1)}><IconChevronRight size={14} /></button>
          <div className="ml-2 flex rounded-md border border-[var(--border-accent)] overflow-hidden">
            <button className={`px-3 py-1 text-xs font-display ${view === "month" ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`} onClick={() => setView("month")}>Mes</button>
            <button className={`px-3 py-1 text-xs font-display ${view === "week" ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`} onClick={() => setView("week")}>Semana</button>
          </div>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={onPickFile} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}
                  title="Importar un archivo .ics (horario de clases, etc.)">
            <IconCalendarPlus size={14} /> {importing ? "Importando…" : "Importar .ics"}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditEvent(null); setModal(true); }}><IconPlus size={14} /> Evento</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {view === "month" ? (
            <MonthGrid cursor={cursor} dots={dots} selected={selected} onSelect={setSelected} />
          ) : (
            <WeekGrid cursor={cursor} events={events} sessions={sessions} onSelect={setSelected} selected={selected} />
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
            <Legend c={DOT_COLORS.habit} l="Hábitos" /><Legend c={DOT_COLORS.event} l="Eventos" />
            <Legend c={DOT_COLORS.taskDone} l="Tareas hechas" /><Legend c={DOT_COLORS.taskDue} l="Vencimiento" />
          </div>
        </div>

        <Card title={selected}>
          {dayEvents.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin eventos este día.</p>}
          {dayEvents.map((e) => (
            <div key={`${e.id}-${e.start_dt}`} className="mb-2 rounded-md p-2" style={{ background: "var(--bg-elevated)", borderLeft: `2px solid ${e.color}` }}>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[var(--text-primary)]">{e.title}</span>
                <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--purple-main)]" title="Editar" onClick={() => { setEditEvent(e); setModal(true); }}>
                  <IconEdit size={12} />
                </button>
                <button className="text-[var(--text-faint)] hover:text-[var(--gr-oxblood)]" title="Eliminar" onClick={async () => {
                  if (await confirm({ message: `¿Eliminar el evento «${e.title}»?${e.recurrence !== "none" ? " (toda la serie)" : ""}`, danger: true })) { await Api.deleteEvent(e.id); load(); }
                }}>
                  <IconTrash size={12} />
                </button>
              </div>
              <div className="text-xs tabular text-[var(--text-muted)]">
                {fmtTime(e.start_dt)}{e.end_dt ? ` – ${fmtTime(e.end_dt)}` : ""}{e.category ? ` · ${e.category}` : ""}
              </div>
              {e.notes && <div className="mt-1 text-xs text-[var(--text-body)]">{e.notes}</div>}
            </div>
          ))}
        </Card>
      </div>

      {modal && <EventForm event={editEvent} defaultDate={selected} onClose={() => { setModal(false); setEditEvent(null); }} onSaved={() => { setModal(false); setEditEvent(null); load(); }} />}
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}</span>;
}

function MonthGrid({ cursor, dots, selected, onSelect }: {
  cursor: Date; dots: Record<string, string[]>; selected: string; onSelect: (d: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const todayIso = isoDate(new Date());
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <Card title={`${MONTHS_ES[month]} ${year}`}>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_ES.map((w) => <div key={w} className="pb-1 text-center text-xs text-[var(--text-faint)]">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = isoDate(new Date(year, month, d));
          const ds = dots[iso] ?? [];
          return (
            <button
              key={i}
              onClick={() => onSelect(iso)}
              className={`flex h-16 flex-col rounded-md p-1 text-left text-xs tabular transition-colors ${
                iso === selected ? "border border-[var(--border-accent)] bg-[var(--bg-elevated)]" : "hover:bg-[var(--bg-elevated)]"
              } ${iso === todayIso ? "text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`}
            >
              {/* Hoy se marca con color, no cambiando de tipografía: un dígito
                  en Cinzel entre treinta en Inter rompe la rejilla tabular. */}
              <span className={iso === todayIso ? "font-semibold" : ""}>{d}</span>
              <span className="mt-auto flex flex-wrap gap-[2px]">
                {ds.slice(0, 6).map((c, j) => <span key={j} className="h-[4px] w-[4px] rounded-full" style={{ background: c }} />)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekGrid({ cursor, events, sessions, selected, onSelect }: {
  cursor: Date; events: CalendarEvent[]; sessions: PomodoroSession[]; selected: string; onSelect: (d: string) => void;
}) {
  const monday = new Date(cursor);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 7:00 – 22:00

  return (
    <Card title="Semana">
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: "40px repeat(7, 1fr)" }}>
          <div />
          {days.map((d) => (
            <button key={d.toISOString()} onClick={() => onSelect(isoDate(d))}
              className={`pb-1 text-center text-xs font-display ${isoDate(d) === selected ? "text-[var(--purple-main)]" : "text-[var(--text-muted)]"}`}>
              {WEEKDAYS_ES[(d.getDay() + 6) % 7]} {d.getDate()}
            </button>
          ))}
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="border-t border-[var(--gr-edge)] py-2 pr-1 text-right text-xs tabular text-[var(--text-faint)]">{h}:00</div>
              {days.map((d) => {
                const iso = isoDate(d);
                const evs = events.filter((e) => e.start_dt.slice(0, 10) === iso && new Date(e.start_dt).getHours() === h);
                const ss = sessions.filter((s) => s.finished_at && isoDate(new Date(s.finished_at)) === iso && new Date(s.finished_at).getHours() === h);
                return (
                  <div key={iso + h} className="min-h-[28px] border-t border-l border-[var(--gr-edge)] p-[2px]">
                    {evs.map((e) => (
                      <div key={`${e.id}-${e.start_dt}`} className="mb-[2px] rounded px-1 text-xs text-[var(--gr-void)]" style={{ background: e.color }}>{e.title}</div>
                    ))}
                    {ss.map((s) => (
                      <div key={s.id} className="rounded bg-[var(--purple-deep)] px-1 text-xs text-[var(--gr-arcane-bright)]">🍅 {s.work_minutes}m</div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EventForm({ event, defaultDate, onClose, onSaved }: { event: CalendarEvent | null; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? event.start_dt.slice(0, 10) : defaultDate);
  const [startTime, setStartTime] = useState(event ? fmtTime(event.start_dt) : "09:00");
  const [endTime, setEndTime] = useState(event?.end_dt ? fmtTime(event.end_dt) : "10:00");
  const [category, setCategory] = useState(event?.category ?? "");
  const [color, setColor] = useState(event?.color ?? DOT_COLORS.event);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [recurrence, setRecurrence] = useState(event?.recurrence ?? "none");
  const [until, setUntil] = useState(event?.recurrence_until ?? "");

  const save = async () => {
    if (!title.trim()) return;
    const payload = {
      title, category: category || null, color, notes: notes || null,
      start_dt: `${date}T${startTime}:00`,
      end_dt: endTime ? `${date}T${endTime}:00` : null,
      recurrence, recurrence_until: recurrence !== "none" && until ? until : null,
    };
    if (event) await Api.updateEvent(event.id, payload);
    else await Api.createEvent(payload);
    onSaved();
  };

  return (
    <Modal title={event ? "Editar evento" : "Nuevo evento"} onClose={onClose}>
      <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Fecha"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio"><input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
        <Field label="Fin"><input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría"><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
        <Field label="Color"><input type="color" className="input h-9 p-1" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="Notas"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repetir">
          <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as any)}>
            <option value="none">No se repite</option>
            <option value="daily">Cada día</option>
            <option value="weekly">Cada semana</option>
          </select>
        </Field>
        {recurrence !== "none" && (
          <Field label="Hasta (opcional)"><input type="date" className="input" value={until ?? ""} onChange={(e) => setUntil(e.target.value)} /></Field>
        )}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Guardar</button>
      </div>
    </Modal>
  );
}
