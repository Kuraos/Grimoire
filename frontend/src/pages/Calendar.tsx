import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconEdit, IconCalendarPlus } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { SectionBand } from "../components/ui/SectionBand";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal, Field } from "../components/ui/Modal";
import { MoonDisc, moonIllum, moonName, moonPath, moonPhase } from "../components/charts/MoonPhase";
import { confirm } from "../confirm";
import {
  MONTHS_ES, WEEKDAYS_ES, WEEKDAY_NAMES_ES, DOT_COLORS, toRoman,
  isoDate, isoDateTime, fmtTime, monthCells,
} from "../utils";
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

  /* Abrir para editar.
   *
   * La lista del día son ocurrencias expandidas: todas llevan el id del maestro
   * pero la fecha de SU repetición. El formulario guardaba esa fecha y el
   * maestro se mudaba con la serie entera detrás — editar la clase del jueves 20
   * convertía la clase de los martes en clase de los jueves. El backend ya
   * distinguía cuál era cuál (`is_occurrence`) y la interfaz no lo miraba.
   *
   * Por eso una repetición pide la fila real antes de abrirse. Si la petición
   * falla no se abre nada: el cliente ya avisa, y abrir con la fecha equivocada
   * es justo el bug. */
  const openEdit = async (e: CalendarEvent) => {
    if (!e.is_occurrence) {
      setEditEvent(e);
      setModal(true);
      return;
    }
    try {
      setEditEvent(await Api.getEvent(e.id));
      setModal(true);
    } catch {
      /* el cliente ya muestra el error del backend */
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Calendario"
        context={`${moonName(moonPhase(new Date()))} · ${Math.round(moonIllum(moonPhase(new Date())) * 100)}% iluminada`}
      >
        <button className="btn" onClick={() => move(-1)}><IconChevronLeft size={14} /></button>
        <button className="btn" onClick={() => { setCursor(new Date()); setSelected(isoDate(new Date())); }}>Hoy</button>
        <button className="btn" onClick={() => move(1)}><IconChevronRight size={14} /></button>
        <div className="flex rounded-md border border-[var(--border-accent)] overflow-hidden">
          <button className={`px-3 py-1 text-xs font-display ${view === "month" ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`} onClick={() => setView("month")}>Mes</button>
          <button className={`px-3 py-1 text-xs font-display ${view === "week" ? "bg-[var(--purple-deep)] text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`} onClick={() => setView("week")}>Semana</button>
        </div>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={onPickFile} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}
                title="Importar un archivo .ics (horario de clases, etc.)">
          <IconCalendarPlus size={14} /> {importing ? "Importando…" : "Importar .ics"}
        </button>
        <button className="btn btn-primary" onClick={() => { setEditEvent(null); setModal(true); }}><IconPlus size={14} /> Evento</button>
      </PageHeader>

      {/* La rejilla ocupa dos tercios largos: un mes es una superficie, no una
          lista, y a un tercio las celdas caían por debajo de lo que hace falta
          para ver los puntos de cada día. */}
      {/* `min-w-0` en las dos columnas: por defecto un ítem de rejilla no baja
          de su contenido mínimo, y la rejilla de la semana pide 640px. Con el
          ancho de la ventana justo, esos 640 estiraban la columna izquierda, la
          derecha —el día y la luna— se salía de la pantalla y la vista entera
          se iba a scroll horizontal. El `overflow-x-auto` de dentro no llegaba
          a actuar porque nunca se le pedía encoger. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.75fr_1fr]">
        <div className="min-w-0">
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

        <div className="min-w-0 space-y-3">
        <Card>
          {/* El día en Cinzel y la fecha ISO al lado en tinta tenue: el nombre
              del día es cómo se le llama, el ISO es cómo se le identifica. */}
          <div className="gr-sangrado mb-3 flex items-baseline gap-2.5">
            <span className="gr-rubrica">
              {WEEKDAY_NAMES_ES[(new Date(selected + "T00:00").getDay() + 6) % 7]} {Number(selected.slice(8))}
            </span>
            <span className="font-label text-2xs text-[var(--text-faint)]">{selected}</span>
          </div>
          {dayEvents.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin eventos este día.</p>}
          {dayEvents.map((e) => (
            <div key={`${e.id}-${e.start_dt}`} className="mb-2 rounded-md p-2.5" style={{ background: "var(--bg-elevated)", borderLeft: `2px solid ${e.color}` }}>
              <div className="flex items-center gap-1">
                {/* El punto repite el color del filete a la izquierda: en una
                    lista de tres, el filete solo no basta para atar el evento
                    a su categoría cuando se lee la hora y no el borde. */}
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="text-sm text-[var(--text-primary)]">{e.title}</span>
                <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--purple-main)]"
                        title={e.recurrence !== "none" ? "Editar (toda la serie)" : "Editar"}
                        onClick={() => openEdit(e)}>
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

        <MoonPanel date={selected} />
        </div>
      </div>

      {modal && <EventForm event={editEvent} defaultDate={selected} onClose={() => { setModal(false); setEditEvent(null); }} onSaved={() => { setModal(false); setEditEvent(null); load(); }} />}
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}</span>;
}

/* La luna del día seleccionado, con la lunación entera debajo en ocho discos.
   Lleva la única cadena de la vista: es la sección con nombre propio. */
function MoonPanel({ date }: { date: string }) {
  const d = new Date(date + "T00:00");
  const ph = moonPhase(d);
  const illum = Math.round(moonIllum(ph) * 100);
  const age = Math.round(ph * 29.53);

  // Ocho fases repartidas por el mes del día seleccionado.
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const strip = Array.from({ length: 8 }, (_, i) => {
    const day = Math.round(1 + (i * (days - 1)) / 7);
    return { day, date: new Date(d.getFullYear(), d.getMonth(), day) };
  });

  return (
    <Card rank="pozo" className="flex flex-col">
      <SectionBand sigil="circulo" label="La luna" fill="cadena" count={`${illum}%`} />

      <div className="mt-4 flex items-center gap-5">
        <svg width="132" height="132" viewBox="-70 -70 140 140" fill="none" className="shrink-0"
             role="img" aria-label={`${moonName(ph)}, ${illum}% iluminada`}>
          <circle cx="0" cy="0" r="64" stroke="var(--gr-edge)" strokeWidth="1" />
          <circle cx="0" cy="0" r="52" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 5" />
          <path d={moonPath(ph, 46)} fill="var(--gr-ink-bright)" fillOpacity="0.88" />
          <circle cx="0" cy="0" r="46" stroke="var(--border-strong)" strokeWidth="0.8" />
        </svg>
        <div className="min-w-0">
          <div className="gr-emphasis">{moonName(ph)}</div>
          <div className="mt-1.5 tabular text-xs text-[var(--text-muted)]">{illum}% iluminada</div>
          <div className="tabular text-xs text-[var(--text-muted)]">día {age} de la lunación</div>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="font-label text-xs text-[var(--text-muted)]">
            La lunación de {MONTHS_ES[d.getMonth()].toLowerCase()}
          </span>
          <span className="h-px flex-1 bg-[var(--gr-edge)]" />
        </div>
        <div className="flex justify-between gap-1">
          {strip.map((m) => (
            <div key={m.day} className="flex flex-col items-center gap-1.5">
              <MoonDisc date={m.date} opacity={m.day === d.getDate() ? 1 : 0.55} />
              <span className={`tabular text-2xs ${m.day === d.getDate() ? "text-[var(--gr-arcane-bright)]" : "text-[var(--text-faint)]"}`}>
                {m.day}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MonthGrid({ cursor, dots, selected, onSelect }: {
  cursor: Date; dots: Record<string, string[]>; selected: string; onSelect: (d: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayIso = isoDate(new Date());
  const cells = monthCells(year, month);

  return (
    <Card rank="rubric">
      {/* El mes en Cinzel de 24px y el año en números romanos a su lado: es la
          portada del mes, no un rótulo de card. Los días de dentro siguen en
          Inter tabular — Cinzel no tiene cifras tabulares y una rejilla de
          treinta y un números con anchos distintos baila. */}
      <div className="gr-sangrado mb-3.5 flex items-baseline gap-3">
        <span className="gr-emphasis tracking-[0.08em] uppercase">{MONTHS_ES[month]}</span>
        <span className="gr-rubrica text-[var(--text-muted)]">{toRoman(year)}</span>
        <span className="h-px flex-1 self-center bg-[var(--gr-edge)]" />
        <span className="gr-rombo self-center" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_ES.map((w) => (
          <div key={w} className="pb-1.5 text-center font-label text-2xs tracking-[0.1em] text-[var(--text-faint)]">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = isoDate(new Date(year, month, d));
          const ds = dots[iso] ?? [];
          return (
            <button
              key={i}
              onClick={() => onSelect(iso)}
              className={`flex min-h-[96px] flex-col rounded-md border p-2 text-left text-sm tabular transition-colors ${
                iso === selected
                  ? "border-[var(--gr-arcane)] bg-[var(--gr-arcane-deep)]"
                  : "border-[var(--gr-edge)] bg-[var(--gr-surface-sunken)] hover:border-[var(--border-strong)]"
              } ${iso === todayIso ? "text-[var(--gr-arcane-bright)]" : "text-[var(--text-muted)]"}`}
            >
              {/* Hoy se marca con color, no cambiando de tipografía: un dígito
                  en Cinzel entre treinta en Inter rompe la rejilla tabular. */}
              <span className={iso === todayIso ? "font-semibold" : ""}>{d}</span>
              <span className="mt-auto flex flex-wrap gap-[3px]">
                {ds.slice(0, 6).map((c, j) => <span key={j} className="h-[5px] w-[5px] rounded-full" style={{ background: c }} />)}
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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const payload = {
      title, category: category || null, color, notes: notes || null,
      start_dt: `${date}T${startTime}:00`,
      end_dt: endTime ? `${date}T${endTime}:00` : null,
      recurrence, recurrence_until: recurrence !== "none" && until ? until : null,
    };
    try {
      if (event) await Api.updateEvent(event.id, payload);
      else await Api.createEvent(payload);
      onSaved();
    } catch {
      // el cliente ya muestra el error del backend; el modal se queda abierto
      // con lo escrito en vez de morir en silencio
      setSaving(false);
    }
  };

  return (
    <Modal title={event ? "Editar evento" : "Nuevo evento"} onClose={onClose}>
      {/* Un evento que se repite no tiene «esta vez»: el modelo guarda un solo
          maestro y expande las repeticiones al leerlas. Decirlo antes de tocar
          la fecha, que es la que arrastra la serie entera. */}
      {event && event.recurrence !== "none" && (
        <p className="mb-3 rounded-md border border-[var(--gr-edge)] bg-[var(--gr-surface-sunken)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
          Esto edita <b className="text-[var(--text-body)]">toda la serie</b>. La fecha es la
          del primer evento: cambiarla mueve todas las repeticiones.
        </p>
      )}
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
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
