import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconArchive, IconFlame, IconEdit, IconX, IconTag, IconTrash } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { HabitCardGothic } from "../components/ui/HabitCardGothic";
import { Modal, Field } from "../components/ui/Modal";
import { HabitHeatmap } from "../components/charts/HabitHeatmap";
import { HabitXPChart } from "../components/charts/HabitXPChart";
import { TagInput } from "../components/ui/TagInput";
import { confirm } from "../confirm";
import { CATEGORY_COLORS, WEEKDAYS_ES, WEEKDAY_NAMES_ES, habitDays } from "../utils";
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

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex items-center justify-between lg:col-span-3">
        <h1 className="gr-title-module">Hábitos</h1>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="space-y-3 lg:col-span-2">
        {byCategory.length === 0 && (
          <Card><p className="text-xs text-[var(--text-muted)]">Aún no hay hábitos activos.</p></Card>
        )}
        {byCategory.map((g) => (
          <section key={g.cat}>
            <h2 className="section-title mb-2">{g.cat}</h2>
            <div className="space-y-2">
              {g.items.map((h) => (
                <HabitCardGothic key={h.id} habit={h} onComplete={complete} onUndo={undo} onOpen={openDetail} onRestore={restore} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="space-y-3">
        <Card title="Consistencia · 12 meses">
          <HabitHeatmap data={heat} />
        </Card>
        {detail && (
          <DetailPanel habit={detail} logs={logs} xpSeries={xpSeries} onClose={() => setDetail(null)} onArchive={archive} onEdit={() => { setEditing(detail); setDetail(null); }} />
        )}
      </div>

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

function DetailPanel({ habit, logs, xpSeries, onClose, onArchive, onEdit }: {
  habit: Habit; logs: HabitLog[]; xpSeries: { date: string; xp: number }[]; onClose: () => void; onArchive: (h: Habit) => void; onEdit: () => void;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-center">
        <span className="font-display text-sm text-[var(--text-primary)]">{habit.name}</span>
        <button onClick={onClose} className="ml-auto text-[var(--text-muted)]"><IconX size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Racha actual" value={`${habit.streak} días`} icon={<IconFlame size={11} />} gold />
        <Metric label="Mejor racha" value={`${habit.best_streak} días`} gold />
        <Metric label="Completado" value={`${habit.completion_rate}%`} />
        <Metric label="XP total" value={`${habit.total_xp}`} gold />
      </div>
      <div className="mt-3">
        <div className="section-title mb-1">XP acumulado</div>
        <HabitXPChart series={xpSeries} />
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto">
        <div className="section-title mb-1">Historial</div>
        {logs.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin registros.</p>}
        {logs.map((l) => (
          <div key={l.id} className="border-b border-[var(--gr-edge)] py-1 text-xs tabular text-[var(--text-body)]">
            {new Date(l.completed_at).toLocaleString()}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn flex-1 justify-center" onClick={onEdit}><IconEdit size={13} /> Editar</button>
        <button className="btn flex-1 justify-center" onClick={() => onArchive(habit)}><IconArchive size={13} /> Archivar</button>
      </div>
    </Card>
  );
}

/** `gold` marca lo que el usuario se ha ganado; el resto es dato, y va en tinta. */
function Metric({ label, value, icon, gold }: { label: string; value: string; icon?: React.ReactNode; gold?: boolean }) {
  return (
    <div className="rounded-md bg-[var(--bg-elevated)] p-2">
      <div className="text-2xs font-label text-[var(--text-muted)]">{label}</div>
      <div
        className="flex items-center gap-1 text-base tabular"
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

  const save = async () => {
    if (!name.trim()) return;
    const payload = {
      name, category, frequency,
      days: frequency === "daily" && days.length && days.length < 7 ? days.join(",") : null,
      target_per_week: frequency === "weekly" ? targetPerWeek : 1,
      xp_reward: xp, color, notes, tags: tags || null,
    };
    if (habit) await Api.updateHabit(habit.id, payload);
    else await Api.createHabit(payload);
    onSaved();
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
        <button className="btn btn-primary" onClick={save}>Guardar</button>
      </div>
    </Modal>
  );
}
