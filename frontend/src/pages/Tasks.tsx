import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus, IconFolder, IconTrash, IconEdit, IconList, IconLayoutKanban, IconChecklist } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { usePomodoroCtx } from "../pomodoro-context";
import { Card } from "../components/ui/Card";
import { SectionBand } from "../components/ui/SectionBand";
import { ProgressSigil } from "../components/ui/ProgressSigil";
import { PageHeader } from "../components/layout/PageHeader";
import { TaskCard } from "../components/ui/TaskCard";
import { KanbanBoard } from "../components/ui/KanbanBoard";
import { TagInput } from "../components/ui/TagInput";
import { TagFilterBar } from "../components/ui/TagFilterBar";
import { VaultNoteField } from "../components/ui/VaultNoteField";
import { Modal, Field } from "../components/ui/Modal";
import { confirm } from "../confirm";
import { CATEGORY_COLORS, isoDate } from "../utils";
import type { Task, Project, ChecklistItem } from "../types";

const PROJECT_CATEGORIES = ["Académico", "Personal", "TCG", "Trabajo"];
const STATUS_LABEL: Record<string, string> = { active: "Activo", paused: "Pausado", closed: "Cerrado" };

export default function Tasks() {
  const { handleXP } = useApp();
  const { startWithTask } = usePomodoroCtx();
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filterProject, setFilterProject] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterCompleted, setFilterCompleted] = useState<string>("false");
  const [sort, setSort] = useState<string>("priority");
  const [view, setView] = useState<"list" | "board">("list");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [taskModal, setTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [projectModal, setProjectModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (filterProject) q.set("project_id", filterProject);
      if (filterPriority) q.set("priority", filterPriority);
      // the board needs every status, so only filter by completed in list view
      if (view === "list" && filterCompleted) q.set("completed", filterCompleted);
      if (filterTag) q.set("tag", filterTag);
      q.set("sort", sort);
      const [t, p, tags] = await Promise.all([
        Api.listTasks("?" + q.toString()), Api.listProjects(), Api.listTags(),
      ]);
      setTasks(t);
      setProjects(p);
      setAllTags(tags);
    } catch {
      /* ignore */
    }
  }, [filterProject, filterPriority, filterCompleted, filterTag, sort, view]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReorder = async (t: Task, status: Task["status"], orderedIds: number[]) => {
    try {
      // XP semantics on crossing the "done" boundary
      if (status === "done" && !t.completed) {
        handleXP(await Api.completeTask(t.id));
      } else if (status !== "done" && t.completed) {
        handleXP(await Api.uncompleteTask(t.id));
      }
      // persist the column order (and the target status for the moved card)
      await Promise.all(orderedIds.map((id, i) => Api.updateTask(id, { position: i, status })));
      load();
    } catch {
      /* ignore */
    }
  };

  const complete = async (t: Task) => {
    try {
      handleXP(await Api.completeTask(t.id));
      load();
    } catch {
      /* ignore */
    }
  };
  const uncomplete = async (t: Task) => {
    try {
      handleXP(await Api.uncompleteTask(t.id));
      load();
    } catch {
      /* ignore */
    }
  };
  const remove = async (t: Task) => {
    if (!(await confirm({ message: `¿Eliminar la tarea «${t.title}»?`, danger: true }))) return;
    await Api.deleteTask(t.id);
    load();
  };
  const removeProject = async (p: Project) => {
    if (!(await confirm({ message: `¿Eliminar el proyecto «${p.name}»? Sus tareas quedarán sin proyecto.`, danger: true }))) return;
    await Api.deleteProject(p.id);
    load();
  };
  const openNewTask = () => { setEditTask(null); setTaskModal(true); };
  const openEditTask = (t: Task) => { setEditTask(t); setTaskModal(true); };
  const openNewProject = () => { setEditProject(null); setProjectModal(true); };
  const openEditProject = (p: Project) => { setEditProject(p); setProjectModal(true); };

  const projColor = (id: number | null) => projects.find((p) => p.id === id)?.color;

  // La línea de contexto de la cabecera. Cuenta sobre `projects`, que llega sin
  // filtrar, y no sobre `tasks`, que sí los lleva puestos: si no, elegir un
  // proyecto en el filtro haría que la cabecera dijera que sólo queda ese.
  const pending = projects.reduce((s, p) => s + p.tasks_pending, 0);
  /* Vencido y «vence esta semana» son dos estados, no uno.
   *
   * La cuenta era `due_date <= hoy+7`, así que se tragaba también todo lo que ya
   * había pasado de plazo: con once tareas vencidas y siete próximas, la
   * cabecera decía «17 vencen esta semana» y lo urgente —lo que ya se pasó—
   * desaparecía dentro de lo simplemente próximo. La banda de vencimientos
   * tampoco las pinta: empieza en hoy. */
  const hoy = isoDate(new Date());
  const enUnaSemana = isoDate(new Date(Date.now() + 7 * 864e5));
  const conPlazo = tasks.filter((t) => !t.completed && t.due_date);
  const vencidas = conPlazo.filter((t) => t.due_date! < hoy).length;
  const dueSoon = conPlazo.filter((t) => t.due_date! >= hoy && t.due_date! <= enUnaSemana).length;
  const headerContext =
    `${pending} pendientes en ${projects.length} proyecto${projects.length === 1 ? "" : "s"}` +
    (vencidas > 0 ? ` · ${vencidas} vencida${vencidas === 1 ? "" : "s"}` : "") +
    (dueSoon > 0 ? ` · ${dueSoon} vence${dueSoon === 1 ? "" : "n"} esta semana` : "");

  // Vincular, arrancar y llevar al temporizador: pulsar «iniciar» y quedarse en
  // Tareas dejaría el pomodoro corriendo sin nada que lo muestre.
  const startFocus = (t: Task) => {
    startWithTask(t);
    nav("/pomodoro");
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Tareas y Proyectos" context={headerContext}>
        <div className="flex overflow-hidden rounded-md border border-[var(--border-accent)]">
          <button onClick={() => setView("list")} title="Lista"
            className={`px-2 py-1 ${view === "list" ? "bg-[var(--bg-elevated)] text-[var(--purple-main)]" : "text-[var(--text-muted)]"}`}>
            <IconList size={15} />
          </button>
          <button onClick={() => setView("board")} title="Tablero"
            className={`px-2 py-1 ${view === "board" ? "bg-[var(--bg-elevated)] text-[var(--purple-main)]" : "text-[var(--text-muted)]"}`}>
            <IconLayoutKanban size={15} />
          </button>
        </div>
        <button className="btn" onClick={openNewProject}><IconFolder size={14} /> Proyecto</button>
        <button className="btn btn-primary" onClick={openNewTask}><IconPlus size={14} /> Tarea</button>
      </PageHeader>

      {/* Projects */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {projects.map((p) => (
          <div key={p.id} className="card flex items-start gap-3" style={{ borderLeft: `2px solid ${p.color}` }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-display text-sm text-[var(--text-primary)]">{p.name}</span>
                <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--purple-main)]" title="Editar" onClick={() => openEditProject(p)}>
                  <IconEdit size={12} />
                </button>
                <button className="text-[var(--text-faint)] hover:text-[var(--gr-oxblood)]" title="Eliminar" onClick={() => removeProject(p)}>
                  <IconTrash size={12} />
                </button>
              </div>
              <div className="mt-1 font-label text-2xs text-[var(--text-muted)]">
                {STATUS_LABEL[p.status]} · {p.category ?? "—"}
              </div>
              <div className="mt-2.5 flex justify-between text-xs tabular text-[var(--text-body)]">
                {/* La cifra son las HECHAS, que es lo que cuenta la rueda de al
                    lado. Decía «pend.», así que un proyecto con las cinco tareas
                    por hacer anunciaba «0/5 pend.» — se leía como que no queda
                    nada pendiente, justo lo contrario. */}
                <span>{p.tasks_total - p.tasks_pending}/{p.tasks_total} hechas</span>
                <span className="text-[var(--purple-main)]">{p.pomodoro_hours}h foco</span>
              </div>
            </div>
            {/* La rueda cuenta las tareas cerradas del proyecto. Al lado del
                «7/12» dice lo mismo, pero se lee sin leer. */}
            <ProgressSigil done={p.tasks_total - p.tasks_pending} total={p.tasks_total} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="gr-sangrado flex flex-wrap items-center gap-2 text-xs">
          <select className="input w-auto" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input w-auto" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">Toda prioridad</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          <select className="input w-auto" value={filterCompleted} onChange={(e) => setFilterCompleted(e.target.value)}>
            <option value="false">Pendientes</option>
            <option value="true">Completadas</option>
            <option value="">Todas</option>
          </select>
          {view === "list" && (
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="priority">Por prioridad</option>
              <option value="due_date">Por fecha límite</option>
            </select>
          )}
          <div className="ml-auto"><TagFilterBar tags={allTags} active={filterTag} onSelect={setFilterTag} /></div>
        </div>
      </Card>

      {/* La rúbrica va antes que la banda: el tablero es a lo que se viene, y
          los vencimientos son el contexto con el que se cierra la vista.
          Al revés, lo primero que se leía era un calendario de plazos —lo que
          aprieta— en vez del trabajo. */}
      <Card rank="rubric" title={view === "board" ? "Tablero" : "Tareas"} right={
        <span className="normal-case tracking-normal text-xs italic text-[var(--text-faint)]">
          arrastra entre columnas; cruzar a Hecho concede el XP
        </span>
      }>
        {view === "board" ? (
          <KanbanBoard tasks={tasks} projectColor={projColor} onReorder={handleReorder} onEdit={openEditTask} />
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin tareas.</p>}
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} projectColor={projColor(t.project_id)}
                onComplete={complete} onUncomplete={uncomplete} onEdit={openEditTask} onDelete={remove}
                onFocus={startFocus} />
            ))}
          </div>
        )}
      </Card>

      <DueBand tasks={tasks} projectColor={projColor} />

      {taskModal && <TaskForm task={editTask} projects={projects} onClose={() => setTaskModal(false)} onSaved={() => { setTaskModal(false); load(); }} />}
      {projectModal && <ProjectForm project={editProject} onClose={() => setProjectModal(false)} onSaved={() => { setProjectModal(false); load(); }} />}
    </div>
  );
}

/* La banda de vencimientos: veintiún días desde hoy, en línea.
 *
 * La lista ordenada por fecha ya dice qué vence antes; lo que no dice es si
 * vencen repartidos o los cinco el mismo jueves. Eso sólo se ve en una recta.
 *
 * Se calla si no hay nada en el horizonte: una banda vacía con su rótulo
 * ocupa el mismo sitio que una llena y no informa de nada. */
const DUE_DAYS = 21;

function DueBand({ tasks, projectColor }: {
  tasks: Task[];
  projectColor: (id: number | null) => string | undefined;
}) {
  const today = new Date(isoDate(new Date()) + "T00:00");
  const due = tasks
    .filter((t) => !t.completed && t.due_date)
    .map((t) => ({
      task: t,
      day: Math.round((new Date(t.due_date! + "T00:00").getTime() - today.getTime()) / 864e5),
    }))
    .filter((m) => m.day >= 0 && m.day <= DUE_DAYS);

  /* Una marca por día, no por tarea.
   *
   * Con una por tarea, los diecisiete vencimientos reales de este mes salían
   * apilados: cinco rótulos en la misma abscisa, superpuestos e ilegibles, y el
   * único caso donde la banda sirve de algo —varias cosas el mismo día— era
   * justo el que no se podía leer. Agrupadas, el día dice cuántas caen y el
   * `title` las nombra. */
  const marks = Object.values(
    due.reduce<Record<number, { day: number; items: Task[] }>>((acc, m) => {
      (acc[m.day] ??= { day: m.day, items: [] }).items.push(m.task);
      return acc;
    }, {}),
  ).sort((a, b) => a.day - b.day);

  if (marks.length === 0) return null;

  return (
    <Card>
      {/* La única cadena de Tareas: la banda es la sección que ordena la vista
          en el tiempo, y el tablero —que es la rúbrica— manda por su nudo. */}
      <div className="gr-sangrado">
        <SectionBand sigil="reloj" label={`Los vencimientos · próximos ${DUE_DAYS} días`}
                     count={marks.length} fill="cadena" />
      </div>
      <div className="relative ml-7 mt-3 h-[76px]">
        <div
          className="absolute inset-x-0 top-11 h-px"
          style={{ background: "repeating-linear-gradient(to right, var(--gr-edge) 0 2px, transparent 2px 7px)" }}
        />
        {Array.from({ length: DUE_DAYS + 1 }, (_, i) => {
          const d = new Date(today.getTime() + i * 864e5);
          const major = i === 0 || d.getDate() % 5 === 0;
          return (
            <span key={i} className="absolute" style={{ left: `${(i / DUE_DAYS) * 100}%` }}>
              <span
                className="absolute top-11 block w-px bg-[var(--gr-edge)]"
                style={{ height: major ? 7 : 4 }}
              />
              {major && (
                <span className="absolute top-[54px] block -translate-x-1/2 text-2xs tabular text-[var(--text-faint)]">
                  {d.getDate()}
                </span>
              )}
            </span>
          );
        })}
        {marks.map((m, i) => {
          /* La etiqueta crece hacia la derecha desde su día, y la recta llega
             hasta el borde de la card: cualquier vencimiento del último tramo
             sacaba su caja de 120px fuera de la ventana y ponía scroll
             horizontal a la vista entera. Pasado el 80% se ancla al otro lado.
             El conector no se mueve: sigue clavado en el día. */
          const pct = (m.day / DUE_DAYS) * 100;
          const alFinal = pct > 80;
          return (
            <span
              key={m.day}
              /* Ancho cero: la marca es un punto en la recta, no una caja. Con
                 la etiqueta en flujo, el ancho de ésta se sumaba al del padre y
                 la vista entera acababa con scroll horizontal aunque el rótulo
                 ya estuviera volteado. */
              className="absolute w-0"
              style={{ left: `${pct}%`, top: i % 2 ? 22 : 2 }}
              title={m.items.map((t) => t.title).join("\n")}
            >
              <span
                className="absolute left-0 top-4 block w-px bg-[var(--gr-edge-strong)]"
                style={{ height: i % 2 ? 22 : 42 }}
              />
              <span
                className={`absolute top-0 flex w-max max-w-[120px] items-center gap-1 rounded-sm bg-[var(--bg-elevated)] px-1.5 py-0.5 text-2xs text-[var(--text-body)] ${
                  alFinal ? "right-0 border-r-2" : "left-0 border-l-2"
                }`}
                style={{
                  [alFinal ? "borderRightColor" : "borderLeftColor"]:
                    projectColor(m.items[0].project_id) ?? "var(--border-accent)",
                }}
              >
                <span className="truncate">{m.items[0].title}</span>
                {m.items.length > 1 && (
                  <span className="shrink-0 tabular text-[var(--text-faint)]">+{m.items.length - 1}</span>
                )}
              </span>
            </span>
          );
        })}
      </div>
      {/* La prioridad es dato, no acento: tres colores semánticos y ningún oro.
          Un vencimiento cercano no es una recompensa. */}
      <div className="ml-7 mt-2 flex flex-wrap items-center gap-4 font-label text-2xs text-[var(--text-faint)]">
        {([["Alta", "var(--gr-oxblood)"], ["Media", "var(--gr-amber)"], ["Baja", "var(--gr-ink-dim)"]] as const).map(
          ([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{l}
            </span>
          ),
        )}
        <span className="ml-auto font-normal normal-case italic tracking-normal">
          la prioridad es dato, no acento: el oro no entra aquí
        </span>
      </div>
    </Card>
  );
}

function TaskForm({ task, projects, onClose, onSaved }: { task: Task | null; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [priority, setPriority] = useState<string>(task?.priority ?? "medium");
  const [projectId, setProjectId] = useState<string>(task?.project_id ? String(task.project_id) : "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [remindAt, setRemindAt] = useState(task?.remind_at ? task.remind_at.slice(0, 16) : "");
  const [tags, setTags] = useState<string>(task?.tags ?? "");
  const [vaultNotePath, setVaultNotePath] = useState<string>(task?.vault_note_path ?? "");
  const [xp, setXp] = useState(task?.xp_reward ?? 15);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const payload = {
      title, description: description || null, category: category || null, priority: priority as any,
      project_id: projectId ? Number(projectId) : null, due_date: dueDate || null,
      remind_at: remindAt ? remindAt : null, tags: tags || null,
      vault_note_path: vaultNotePath.trim() || null, xp_reward: xp,
    };
    try {
      if (task) await Api.updateTask(task.id, payload);
      else await Api.createTask(payload);
      onSaved();
    } catch {
      // el cliente ya avisa del error; el modal se queda con lo escrito en vez
      // de morir en silencio con una promesa rechazada
      setSaving(false);
    }
  };

  return (
    <Modal title={task ? "Editar tarea" : "Nueva tarea"} onClose={onClose}>
      <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Descripción"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proyecto">
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Ninguno</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha límite"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Recordatorio"><input type="datetime-local" className="input" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} /></Field>
      </div>
      <Field label="Categoría"><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
      <Field label="Etiquetas"><TagInput value={tags} onChange={setTags} /></Field>
      <Field label="Nota en Obsidian"><VaultNoteField value={vaultNotePath} onChange={setVaultNotePath} /></Field>
      <Field label={`XP reward (${xp})`}>
        <input type="range" min={5} max={50} step={5} value={xp} onChange={(e) => setXp(Number(e.target.value))} className="w-full" />
      </Field>
      {task && <ChecklistEditor task={task} />}
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

function ChecklistEditor({ task }: { task: Task }) {
  const [items, setItems] = useState<ChecklistItem[]>(task.checklist ?? []);
  const [draft, setDraft] = useState("");

  const add = async () => {
    if (!draft.trim()) return;
    try { const it = await Api.addChecklistItem(task.id, draft.trim()); setItems((xs) => [...xs, it]); setDraft(""); } catch { /* */ }
  };
  const toggle = async (it: ChecklistItem) => {
    try { const up = await Api.updateChecklistItem(it.id, { done: !it.done }); setItems((xs) => xs.map((x) => x.id === it.id ? up : x)); } catch { /* */ }
  };
  const del = async (it: ChecklistItem) => {
    try { await Api.deleteChecklistItem(it.id); setItems((xs) => xs.filter((x) => x.id !== it.id)); } catch { /* */ }
  };

  return (
    <Field label={`Subtareas (${items.filter((i) => i.done).length}/${items.length})`}>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-xs">
            <button onClick={() => toggle(it)} className="text-[var(--purple-main)]">
              <IconChecklist size={14} className={it.done ? "opacity-100" : "opacity-40"} />
            </button>
            <span className={`flex-1 ${it.done ? "text-[var(--text-faint)] line-through" : "text-[var(--text-body)]"}`}>{it.text}</span>
            <button onClick={() => del(it)} className="text-[var(--text-faint)] hover:text-[var(--gr-oxblood)]"><IconTrash size={12} /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Añadir subtarea…" value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button className="btn" onClick={add}><IconPlus size={13} /></button>
        </div>
      </div>
    </Field>
  );
}

function ProjectForm({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [category, setCategory] = useState(project?.category ?? "Académico");
  const [color, setColor] = useState(project?.color ?? CATEGORY_COLORS["Académico"]);
  const [vaultNotePath, setVaultNotePath] = useState<string>(project?.vault_note_path ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const payload = { name, description: description || null, status, category, color, vault_note_path: vaultNotePath.trim() || null };
    try {
      if (project) await Api.updateProject(project.id, payload);
      else await Api.createProject(payload);
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal title={project ? "Editar proyecto" : "Nuevo proyecto"} onClose={onClose}>
      <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Descripción"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Estado">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
            <option value="closed">Cerrado</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setColor(CATEGORY_COLORS[e.target.value] ?? color); }}>
            {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Color"><input type="color" className="input h-9 p-1" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="Nota en Obsidian"><VaultNoteField value={vaultNotePath} onChange={setVaultNotePath} /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
