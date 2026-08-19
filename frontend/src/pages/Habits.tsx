import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconArchive, IconFlame, IconEdit, IconX, IconTag, IconTrash, IconCalendar } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { Figure } from "../components/ui/Figure";
import { SectionBand } from "../components/ui/SectionBand";
import { sigilDeCategoria } from "../components/ui/Sigil";
import { PageHeader } from "../components/layout/PageHeader";
import { HabitCardGothic } from "../components/ui/HabitCardGothic";
import { Modal, Overlay, Field } from "../components/ui/Modal";
import { HabitHeatmap } from "../components/charts/HabitHeatmap";
import { HabitConstellation } from "../components/charts/HabitConstellation";
import { HabitXPChart } from "../components/charts/HabitXPChart";
import { TagInput } from "../components/ui/TagInput";
import { confirm } from "../confirm";
import { CATEGORY_COLORS, WEEKDAYS_ES, WEEKDAY_NAMES_ES, habitDays, streakUnit } from "../utils";
import type { Habit, HabitCategory, HabitLog } from "../types";

export default function Habits() {
  const { handleXP, pushToast } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [categories, setCategories] = useState<HabitCategory[]>([]);
  const [catsOpen, setCatsOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [xpSeries, setXpSeries] = useState<{ date: string; xp: number }[]>([]);
  const [heat, setHeat] = useState<{ date: string; count: number }[]>([]);

  const load = useCallback(async () => {
    try {
      const [h, cats, s] = await Promise.all([
        Api.listHabits(showArchived), Api.listHabitCategories(), Api.stats("year"),
      ]);
      setHabits(h);
      setCategories(cats);
      setHeat(s.heatmap);
    } catch {
      /* ignore */
    }
  }, [showArchived]);

  // archivar es un borrado suave: el historial sigue ahí y debe poder recuperarse
  const restore = async (h: Habit) => {
    try {
      await Api.updateHabit(h.id, { active: true });
      pushToast({ title: "Hábito restaurado", body: h.name, icon: "arrow-back-up" });
      load();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (h: Habit) => {
    try {
      handleXP(await Api.completeHabit(h.id));
      load();
      if (detail?.id === h.id) openDetail(h);
    } catch {
      /* ignore */
    }
  };

  const undo = async (h: Habit) => {
    try {
      await Api.uncompleteHabit(h.id);
      load();
      if (detail?.id === h.id) openDetail(h);
    } catch {
      /* ignore */
    }
  };

  const archive = async (h: Habit) => {
    if (!(await confirm({ message: `¿Archivar «${h.name}»? Conserva su historial pero deja de aparecer.`, confirmLabel: "Archivar", danger: true }))) return;
    await Api.archiveHabit(h.id);
    setDetail(null);
    load();
  };

  const openDetail = async (h: Habit) => {
    setDetail(h);
    const [l, s] = await Promise.all([Api.habitLogs(h.id), Api.habitXpSeries(h.id)]);
    setLogs(l);
    setXpSeries(s);
  };

  // catalog order first, then any category still used by habits but not in the
  // catalog (e.g. deleted or legacy) so no habit ever disappears from the list
  const catalogNames = categories.map((c) => c.name);
  const orphanNames = [...new Set(habits.map((h) => h.category))].filter((c) => !catalogNames.includes(c));
  const byCategory = [...catalogNames, ...orphanNames].map((cat) => ({
    cat,
    items: habits.filter((h) => h.category === cat),
  })).filter((g) => g.items.length > 0);

  /* Las cifras de la cabecera y de la rúbrica cuentan sobre los ACTIVOS.
     Con «Ver archivados» puesto, `habits` trae también los archivados y la línea
     seguía diciendo «N activos»; la constancia media se diluía con hábitos que
     ya nadie lleva, y la racha más larga podía ser la de uno abandonado. */
  const activos = habits.filter((h) => h.active);
  // el titular de la racha, no sólo su número: en un hábito semanal se cuenta
  // en semanas, y rotularlo «días» es decir otra cosa
  const record = activos.reduce<Habit | null>(
    (best, h) => (!best || h.streak > best.streak ? h : best), null,
  );
  const bestStreak = record?.streak ?? 0;
  const avgRate = activos.length
    ? Math.round(activos.reduce((s, h) => s + h.completion_rate, 0) / activos.length)
    : 0;
  const marks = heat.reduce((s, d) => s + d.count, 0);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <PageHeader
        title="Hábitos"
        className="lg:col-span-3"
        context={
          `${activos.length} activos · ${activos.filter((h) => h.done_today).length} cumplidos hoy` +
          // sin racha viva la cláusula era «racha más larga 0 días», que ocupa
          // sitio para no decir nada
          (record && bestStreak > 0 ? ` · racha más larga ${bestStreak} ${streakUnit(record, bestStreak)}` : "")
        }
      >
        <button
          className="btn"
          onClick={() => setShowArchived((v) => !v)}
          title={showArchived ? "Ocultar los archivados" : "Mostrar también los archivados"}
          style={showArchived ? { borderColor: "var(--gr-edge-focus)", color: "var(--gr-arcane)" } : undefined}
        >
          <IconArchive size={14} /> {showArchived ? "Ocultar archivados" : "Ver archivados"}
        </button>
        <button className="btn" onClick={() => setCatsOpen(true)}>
          <IconTag size={14} /> Categorías
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <IconPlus size={14} /> Nuevo hábito
        </button>
      </PageHeader>

      {/* La rúbrica ocupa el ancho entero y lleva el mapa a la izquierda con
          las tres cifras del año a la derecha: el mapa dice la forma y las
          cifras la magnitud, y separados en dos cards no se leían juntos. */}
      <Card rank="rubric" title="Consistencia · 12 meses" icon={<IconCalendar size={14} />} className="lg:col-span-3">
        <div className="flex flex-wrap items-start gap-7">
          <div className="min-w-0 flex-1">
            <HabitHeatmap data={heat} />
            <div className="mt-2.5 flex flex-wrap items-center gap-2 font-label text-2xs text-[var(--text-faint)]">
              <span>menos</span>
              {["var(--gr-surface-raised)", "#4d3f70", "#7663ad", "var(--gr-arcane)"].map((c) => (
                <span key={c} className="h-[11px] w-[11px] rounded-xs" style={{ background: c }} />
              ))}
              <span>más</span>
              <span className="ml-3 h-[11px] w-[11px] rounded-xs bg-[var(--gr-surface-raised)] outline outline-1 outline-[var(--gr-arcane)]" />
              <span>hoy</span>
            </div>
          </div>
          <div className="flex gap-7">
            <Figure value={`${bestStreak}`} label="Racha más larga" gold />
            <Figure value={`${avgRate}`} suffix="%" label="Constancia media" />
            <Figure value={marks.toLocaleString("es")} label="Marcas en 12 meses" />
          </div>
        </div>
      </Card>

      <div className="space-y-1 lg:col-span-2">
        {byCategory.length === 0 && (
          <Card><p className="gr-sangrado text-xs text-[var(--text-muted)]">Aún no hay hábitos activos.</p></Card>
        )}
        {/* Cada categoría cuelga de su sigilo y de una espina: la marca dice qué
            grupo es antes de leer el rótulo, y la espina ata las tarjetas al
            bloque en vez de dejarlas sueltas bajo un título. */}
        {byCategory.map((g) => (
          <div key={g.cat} className="pt-2.5">
            <SectionBand
              sigil={sigilDeCategoria(g.cat)}
              label={g.cat}
              count={g.items.length}
              fill="linea"
              spine
            >
              <div className="space-y-2">
                {g.items.map((h) => (
                  <HabitCardGothic key={h.id} habit={h} onComplete={complete} onUndo={undo} onOpen={openDetail} onRestore={restore} />
                ))}
              </div>
            </SectionBand>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <HabitConstellation habits={habits} />
      </div>

      {/* Fuera de las columnas: es una capa sobre la vista, no una card de la
          rejilla. Dejarlo dentro funcionaba —está en `fixed`— pero el marcado
          decía lo contrario de lo que hace. */}
      {detail && (
        <DetailPanel habit={detail} logs={logs} xpSeries={xpSeries} onClose={() => setDetail(null)} onArchive={archive} onEdit={() => { setEditing(detail); setDetail(null); }} />
      )}

      {(creating || editing) && (
        <HabitForm
          habit={editing}
          categories={categories}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}

      {catsOpen && (
        <CategoriesModal
          categories={categories}
          onClose={() => setCatsOpen(false)}
          onChanged={load}
          notify={pushToast}
        />
      )}
    </div>
  );
}


function CategoriesModal({ categories, onClose, onChanged, notify }: {
  categories: HabitCategory[];
  onClose: () => void;
  onChanged: () => void;
  notify: (t: { title: string; body: string; icon?: string; variant?: "default" | "error" }) => void;
}) {
  const [name, setName] = useState("");
  // <input type="color"> exige un hex literal: con var(...) caería a negro
  const [color, setColor] = useState("#a98bf0");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await Api.createHabitCategory(name.trim(), color);
      setName("");
      onChanged();
    } catch {
      /* client toasts the backend message (e.g. duplicate) */
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: HabitCategory) => {
    if (c.habit_count > 0) {
      notify({
        title: "No se puede eliminar",
        body: `«${c.name}» está en uso por ${c.habit_count} hábito(s).`,
        icon: "alert-triangle",
        variant: "error",
      });
      return;
    }
    if (!(await confirm({ message: `¿Eliminar la categoría «${c.name}»?`, danger: true }))) return;
    try {
      await Api.deleteHabitCategory(c.id);
      onChanged();
    } catch {
      /* client toasts the backend message */
    }
  };

  return (
    <Modal title="Categorías de hábitos" onClose={onClose}>
      <div className="mb-3 space-y-1">
        {categories.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">Sin categorías.</p>
        )}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 last:border-none">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 text-sm text-[var(--text-body)]">{c.name}</span>
            <span className="tabular text-xs text-[var(--text-muted)]">
              {c.habit_count} hábito{c.habit_count === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => remove(c)}
              title={c.habit_count > 0 ? "En uso — reasigna esos hábitos primero" : "Eliminar"}
              className={`${c.habit_count > 0 ? "text-[var(--text-faint)] opacity-40" : "text-[var(--text-faint)] hover:text-[var(--gr-oxblood)]"}`}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </div>

      <Field label="Nueva categoría">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            value={name}
            placeholder="p. ej. Música"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <input type="color" className="input h-9 w-12 shrink-0 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
          <button className="btn shrink-0" onClick={add} disabled={busy}><IconPlus size={13} /></button>
        </div>
      </Field>
      <p className="text-xs italic text-[var(--text-muted)]">
        Solo se pueden eliminar categorías que ningún hábito esté usando.
      </p>

      <div className="mt-3 flex justify-end">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

/**
 * El detalle de un hábito, como pliego suelto sobre la vista.
 *
 * Era una card más en la columna derecha, debajo del heatmap: para leer la
 * racha de un hábito había que buscar dónde había aparecido el panel, y con la
 * constelación al lado competían dos cosas por el mismo sitio. Abierto encima
 * y centrado, el hábito es lo único que hay mientras se mira.
 *
 * Las cuatro cifras van en cajas hundidas y grandes —es lo que se viene a ver—,
 * y tres de las cuatro en oro: racha, mejor racha y XP son lo que se ganó.
 * «Completado» es un porcentaje, o sea dato, y se queda en tinta.
 */
function DetailPanel({ habit, logs, xpSeries, onClose, onArchive, onEdit }: {
  habit: Habit; logs: HabitLog[]; xpSeries: { date: string; xp: number }[]; onClose: () => void; onArchive: (h: Habit) => void; onEdit: () => void;
}) {
  return (
    <Overlay onClose={onClose} align="start">
      <div
        className="card card-rubric w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={habit.name}
      >
        <span className="gr-nudo gr-nudo--oro" />
        <span className="gr-nudo gr-nudo--oro gr-nudo--contra" />

        <div className="gr-sangrado mb-4 flex items-center gap-3">
          <h2 className="gr-rubrica">{habit.name}</h2>
          <button onClick={onClose} title="Cerrar"
                  className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <IconX size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* La unidad la manda la cadencia: la racha de un hábito semanal se
              cuenta en semanas, y «4 días» donde son cuatro semanas es un dato
              distinto, no una abreviatura. */}
          <Metric label="Racha actual" value={`${habit.streak} ${streakUnit(habit, habit.streak)}`} icon={<IconFlame size={16} />} gold />
          <Metric label="Mejor racha" value={`${habit.best_streak} ${streakUnit(habit, habit.best_streak)}`} gold />
          <Metric label="Completado" value={`${habit.completion_rate}%`} />
          <Metric label="XP total" value={habit.total_xp.toLocaleString("es")} gold />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="font-label text-xs text-[var(--text-muted)]">XP acumulado</span>
            <span className="gr-filete" />
            <span className="gr-rombo" />
          </div>
          <HabitXPChart series={xpSeries} />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="font-label text-xs text-[var(--text-muted)]">Historial</span>
            <span className="gr-filete" />
            <span className="gr-rombo" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {logs.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin registros.</p>}
            {logs.map((l) => (
              <div key={l.id} className="border-b border-[var(--gr-edge)] py-2 text-sm tabular text-[var(--text-body)] last:border-none">
                {new Date(l.completed_at).toLocaleString("es", {
                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2.5">
          <button className="btn flex-1 justify-center" onClick={onEdit}><IconEdit size={13} /> Editar</button>
          <button className="btn flex-1 justify-center" onClick={() => onArchive(habit)}><IconArchive size={13} /> Archivar</button>
        </div>
      </div>
    </Overlay>
  );
}

/** `gold` marca lo que el usuario se ha ganado; el resto es dato, y va en tinta. */
function Metric({ label, value, icon, gold }: { label: string; value: string; icon?: React.ReactNode; gold?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--gr-edge)] bg-[var(--gr-surface-sunken)] px-3.5 py-3">
      <div className="text-2xs font-label text-[var(--text-muted)]">{label}</div>
      <div
        className="mt-1.5 flex items-center gap-1.5 text-2xl tabular"
        style={{ color: gold ? "var(--gr-gilded)" : "var(--text-primary)" }}
      >
        {icon}{value}
      </div>
    </div>
  );
}

function HabitForm({ habit, categories, onClose, onSaved }: {
  habit: Habit | null; categories: HabitCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const catColor = (n: string) =>
    categories.find((c) => c.name === n)?.color ?? CATEGORY_COLORS[n] ?? "var(--gr-arcane)";
  const [name, setName] = useState(habit?.name ?? "");
  const [category, setCategory] = useState(habit?.category ?? categories[0]?.name ?? "Otro");
  const [frequency, setFrequency] = useState(habit?.frequency ?? "daily");
  // vacío = todos los días, que es lo que guarda el backend como NULL
  const [days, setDays] = useState<number[]>(habitDays(habit?.days ?? null) ?? []);
  const [targetPerWeek, setTargetPerWeek] = useState(habit?.target_per_week ?? 1);
  const [xp, setXp] = useState(habit?.xp_reward ?? 20);
  const [color, setColor] = useState(
    habit?.color ?? catColor(habit?.category ?? categories[0]?.name ?? "Otro")
  );
  const [notes, setNotes] = useState(habit?.notes ?? "");
  const [tags, setTags] = useState<string>(habit?.tags ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const payload = {
      name, category, frequency,
      days: frequency === "daily" && days.length && days.length < 7 ? days.join(",") : null,
      target_per_week: frequency === "weekly" ? targetPerWeek : 1,
      xp_reward: xp, color, notes, tags: tags || null,
    };
    try {
      if (habit) await Api.updateHabit(habit.id, payload);
      else await Api.createHabit(payload);
      onSaved();
    } catch {
      // el cliente ya avisa; el modal conserva lo escrito
      setSaving(false);
    }
  };

  return (
    <Modal title={habit ? "Editar hábito" : "Nuevo hábito"} onClose={onClose}>
      <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setColor(catColor(e.target.value)); }}>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            {/* keep a habit's legacy category selectable even if it left the catalog */}
            {category && !categories.some((c) => c.name === category) && <option value={category}>{category}</option>}
          </select>
        </Field>
        <Field label="Frecuencia">
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
          </select>
        </Field>
      </div>
      {frequency === "daily" ? (
        <Field label="Días en que toca">
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS_ES.map((label, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={days.includes(i)}
                aria-label={WEEKDAY_NAMES_ES[i]}
                title={WEEKDAY_NAMES_ES[i]}
                className={`btn w-9 justify-center px-0 ${days.includes(i) ? "btn-primary" : ""}`}
                onClick={() => setDays((prev) =>
                  prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="gr-meta mt-1.5" style={{ color: "var(--gr-ink-faint)" }}>
            {days.length === 0 || days.length === 7
              ? "Sin marcar: cuenta todos los días."
              : "Los días sin marcar no suman racha ni la rompen."}
          </p>
        </Field>
      ) : (
        <Field label="Veces por semana">
          <select className="input" value={targetPerWeek}
                  onChange={(e) => setTargetPerWeek(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n}× por semana</option>
            ))}
          </select>
          <p className="gr-meta mt-1.5" style={{ color: "var(--gr-ink-faint)" }}>
            La semana cuenta como hecha al alcanzar la meta; máximo una marca por día.
          </p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`XP por completar (${xp})`}>
          <input type="range" min={10} max={100} step={5} value={xp} onChange={(e) => setXp(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="input h-9 p-1" />
        </Field>
      </div>
      <Field label="Notas (opcional)"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="Etiquetas"><TagInput value={tags} onChange={setTags} /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
