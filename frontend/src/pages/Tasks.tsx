import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconFolder, IconTrash, IconEdit, IconList, IconLayoutKanban, IconChecklist } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { TaskCard } from "../components/ui/TaskCard";
import { KanbanBoard } from "../components/ui/KanbanBoard";
import { TagInput } from "../components/ui/TagInput";
import { TagFilterBar } from "../components/ui/TagFilterBar";
import { VaultNoteField } from "../components/ui/VaultNoteField";
import { Modal, Field } from "../components/ui/Modal";
import { confirm } from "../confirm";
import { CATEGORY_COLORS } from "../utils";
import type { Task, Project, ChecklistItem } from "../types";

const PROJECT_CATEGORIES = ["Académico", "Personal", "TCG", "Trabajo"];
const STATUS_LABEL: Record<string, string> = { active: "Activo", paused: "Pausado", closed: "Cerrado" };

export default function Tasks() {
  const { handleXP } = useApp();
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="gr-title-module">Tareas y Proyectos</h1>
        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Projects */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {projects.map((p) => (
          <div key={p.id} className="card" style={{ borderLeft: `2px solid ${p.color}` }}>
            <div className="flex items-center gap-1">
              <span className="truncate font-display text-sm text-[var(--text-primary)]">{p.name}</span>
              <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--purple-main)]" title="Editar" onClick={() => openEditProject(p)}>
                <IconEdit size={12} />
              </button>
              <button className="text-[var(--text-faint)] hover:text-[var(--gr-oxblood)]" title="Eliminar" onClick={() => removeProject(p)}>
                <IconTrash size={12} />
              </button>
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">{STATUS_LABEL[p.status]} · {p.category ?? "—"}</div>
            <div className="mt-2 flex justify-between text-xs tabular text-[var(--text-body)]">
              <span>{p.tasks_pending}/{p.tasks_total} pend.</span>
              <span>{p.pomodoro_hours}h foco</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-xs">
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

      {/* Tasks */}
      {view === "board" ? (
        <KanbanBoard tasks={tasks} projectColor={projColor} onReorder={handleReorder} onEdit={openEditTask} />
      ) : (
        <div className="space-y-2">
          {tasks.length === 0 && <Card><p className="text-xs text-[var(--text-muted)]">Sin tareas.</p></Card>}
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} projectColor={projColor(t.project_id)}
              onComplete={complete} onUncomplete={uncomplete} onEdit={openEditTask} onDelete={remove} />
          ))}
        </div>
      )}

      {taskModal && <TaskForm task={editTask} projects={projects} onClose={() => setTaskModal(false)} onSaved={() => { setTaskModal(false); load(); }} />}
      {projectModal && <ProjectForm project={editProject} onClose={() => setProjectModal(false)} onSaved={() => { setProjectModal(false); load(); }} />}
    </div>
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

  const save = async () => {
    if (!title.trim()) return;
    const payload = {
      title, description: description || null, category: category || null, priority: priority as any,
      project_id: projectId ? Number(projectId) : null, due_date: dueDate || null,
      remind_at: remindAt ? remindAt : null, tags: tags || null,
      vault_note_path: vaultNotePath.trim() || null, xp_reward: xp,
    };
    if (task) await Api.updateTask(task.id, payload);
    else await Api.createTask(payload);
    onSaved();
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
        <button className="btn btn-primary" onClick={save}>Guardar</button>
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

  const save = async () => {
    if (!name.trim()) return;
    const payload = { name, description: description || null, status, category, color, vault_note_path: vaultNotePath.trim() || null };
    if (project) await Api.updateProject(project.id, payload);
    else await Api.createProject(payload);
    onSaved();
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
        <button className="btn btn-primary" onClick={save}>Guardar</button>
      </div>
    </Modal>
  );
}
