import { api, BASE as API_BASE } from "./client";
import type {
  User, Habit, HabitCategory, HabitLog, Project, Task, ChecklistItem, PomodoroSession, CalendarEvent,
  DiaryEntry, Checkin, Achievement, Quest, StreakEval, WeeklyReview, XPEventResponse, IcsImportResult,
  DaySummary, Stats, WeekSummary,
  BackupEntry,
  Account, LedgerCategory, LedgerEntry, LedgerSummary,
  LedgerMonthReview, LedgerEntryCreated, SavingsGoal, LedgerStats, BudgetMonth,
} from "../types";

export const Api = {
  // user
  getUser: () => api.get<User>("/user"),
  updateUser: (data: { name?: string; obsidian_vault_path?: string | null }) =>
    api.patch<User>("/user", data),
  evaluateStreaks: () => api.post<StreakEval>("/user/evaluate-streaks"),

  // habits
  listHabits: (includeArchived = false) =>
    api.get<Habit[]>(`/habits?include_archived=${includeArchived}`),
  getHabit: (id: number) => api.get<Habit>(`/habits/${id}`),
  habitLogs: (id: number) => api.get<HabitLog[]>(`/habits/${id}/logs`),
  // habit categories (user-managed catalog)
  listHabitCategories: () => api.get<HabitCategory[]>("/habit-categories"),
  createHabitCategory: (name: string, color: string) =>
    api.post<HabitCategory>("/habit-categories", { name, color }),
  deleteHabitCategory: (id: number) => api.del<void>(`/habit-categories/${id}`),
  habitXpSeries: (id: number) => api.get<{ date: string; xp: number }[]>(`/habits/${id}/xp-series`),
  createHabit: (data: Partial<Habit>) => api.post<Habit>("/habits", data),
  updateHabit: (id: number, data: Partial<Habit>) => api.patch<Habit>(`/habits/${id}`, data),
  archiveHabit: (id: number) => api.del<void>(`/habits/${id}`),
  completeHabit: (id: number) => api.post<XPEventResponse>(`/habits/${id}/complete`),
  uncompleteHabit: (id: number) => api.del<XPEventResponse>(`/habits/${id}/complete`),

  // projects
  listProjects: () => api.get<Project[]>("/projects"),
  createProject: (data: Partial<Project>) => api.post<Project>("/projects", data),
  updateProject: (id: number, data: Partial<Project>) => api.patch<Project>(`/projects/${id}`, data),
  deleteProject: (id: number) => api.del<void>(`/projects/${id}`),

  // tasks
  listTasks: (params = "") => api.get<Task[]>(`/tasks${params}`),
  createTask: (data: Partial<Task>) => api.post<Task>("/tasks", data),
  updateTask: (id: number, data: Partial<Task>) => api.patch<Task>(`/tasks/${id}`, data),
  deleteTask: (id: number) => api.del<void>(`/tasks/${id}`),
  completeTask: (id: number) => api.post<XPEventResponse>(`/tasks/${id}/complete`),
  uncompleteTask: (id: number) => api.post<XPEventResponse>(`/tasks/${id}/uncomplete`),
  // checklist (subtasks)
  addChecklistItem: (taskId: number, text: string) =>
    api.post<ChecklistItem>(`/tasks/${taskId}/checklist`, { text }),
  updateChecklistItem: (itemId: number, data: Partial<ChecklistItem>) =>
    api.patch<ChecklistItem>(`/tasks/checklist/${itemId}`, data),
  deleteChecklistItem: (itemId: number) => api.del<void>(`/tasks/checklist/${itemId}`),

  // quests
  listQuests: () => api.get<Quest[]>("/quests"),
  claimQuest: (id: number) => api.post<XPEventResponse>(`/quests/${id}/claim`),

  // tags
  listTags: () => api.get<string[]>("/tags"),

  // respaldo y exportación
  listBackups: () => api.get<{ dir: string; backups: BackupEntry[] }>("/backup"),
  createBackup: () => api.post<{ created: string; size_kb: number; dir: string }>("/backup"),
  restoreBackup: (filename: string) =>
    api.post<{ restored: string; safety_copy: string; restart_required: boolean; message: string }>(
      `/backup/restore/${encodeURIComponent(filename)}`
    ),
  /** URLs de descarga directa (el navegador las baja como archivo) */
  backupDownloadUrl: (kind: "json" | "db") => `${API_BASE}/backup/export.${kind}`,

  // pomodoro
  createSession: (data: {
    task_id?: number | null;
    project_id?: number | null;
    work_minutes: number;
    /** false = bloque abandonado: se registra, pero no puntúa */
    completed?: boolean;
    /** ISO del arranque real del bloque */
    started_at?: string;
  }) => api.post<XPEventResponse>("/pomodoro/sessions", data),
  todaySessions: () => api.get<PomodoroSession[]>("/pomodoro/today"),
  sessionsRange: (start: string, end: string) =>
    api.get<PomodoroSession[]>(`/pomodoro/range?start=${start}&end=${end}`),

  // calendar
  listEvents: (start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    const qs = q.toString();
    return api.get<CalendarEvent[]>(`/calendar/events${qs ? "?" + qs : ""}`);
  },
  createEvent: (data: Partial<CalendarEvent>) => api.post<CalendarEvent>("/calendar/events", data),
  updateEvent: (id: number, data: Partial<CalendarEvent>) =>
    api.patch<CalendarEvent>(`/calendar/events/${id}`, data),
  deleteEvent: (id: number) => api.del<void>(`/calendar/events/${id}`),
  importIcs: (content: string, color?: string, category?: string | null) =>
    api.post<IcsImportResult>("/calendar/import-ics", { content, ...(color ? { color } : {}), ...(category !== undefined ? { category } : {}) }),

  // diary
  getDiary: (date: string) => api.get<DiaryEntry>(`/diary/${date}`),
  saveDiary: (date: string, content: string, tags?: string | null) =>
    api.patch<DiaryEntry>(`/diary/${date}`, { content, ...(tags !== undefined ? { tags } : {}) }),
  searchDiary: (q: string) => api.get<{ entry_date: string; content: string }[]>(`/diary/search?q=${encodeURIComponent(q)}`),
  diaryDates: () => api.get<string[]>("/diary/dates"),
  diaryVolume: () => api.get<{ entry_date: string; length: number }[]>("/diary/volume"),
  daySummary: (date: string) => api.get<DaySummary>(`/diary/${date}/summary`),
  exportDiaryObsidian: (date: string) =>
    api.post<{ exported: boolean; path: string }>(`/diary/${date}/export-obsidian`),

  // checkins
  getCheckin: (date: string) => api.get<Checkin | null>(`/checkins/${date}`),
  saveCheckin: (date: string, data: { energy: number; mood: number; note?: string }) =>
    api.post<XPEventResponse>(`/checkins/${date}`, data),

  // stats
  stats: (period: string) => api.get<Stats>(`/stats?period=${period}`),

  // achievements
  listAchievements: () => api.get<Achievement[]>("/achievements"),

  // reviews
  listReviews: () => api.get<WeeklyReview[]>("/weekly-reviews"),
  weekSummary: () => api.get<WeekSummary>("/weekly-reviews/summary"),
  saveReview: (data: Partial<WeeklyReview>) => api.post<XPEventResponse>("/weekly-reviews", data),

  // erario — arcas
  listAccounts: (includeArchived = false) =>
    api.get<Account[]>(`/ledger/accounts?include_archived=${includeArchived}`),
  createAccount: (data: Partial<Account>) => api.post<Account>("/ledger/accounts", data),
  updateAccount: (id: number, data: Partial<Account>) =>
    api.patch<Account>(`/ledger/accounts/${id}`, data),
  deleteAccount: (id: number) => api.del<void>(`/ledger/accounts/${id}`),

  // erario — partidas
  listLedgerCategories: (includeArchived = false) =>
    api.get<LedgerCategory[]>(`/ledger/categories?include_archived=${includeArchived}`),
  createLedgerCategory: (data: Partial<LedgerCategory>) =>
    api.post<LedgerCategory>("/ledger/categories", data),
  updateLedgerCategory: (id: number, data: Partial<LedgerCategory>) =>
    api.patch<LedgerCategory>(`/ledger/categories/${id}`, data),
  deleteLedgerCategory: (id: number) => api.del<void>(`/ledger/categories/${id}`),

  // erario — asientos
  listEntries: (params = "") => api.get<LedgerEntry[]>(`/ledger/entries${params}`),
  createEntry: (data: Partial<LedgerEntry>) =>
    api.post<LedgerEntryCreated>("/ledger/entries", data),
  updateEntry: (id: number, data: Partial<LedgerEntry>) =>
    api.patch<LedgerEntry>(`/ledger/entries/${id}`, data),
  deleteEntry: (id: number) => api.del<void>(`/ledger/entries/${id}`),
  ledgerSummary: (month: string) => api.get<LedgerSummary>(`/ledger/summary?month=${month}`),

  // erario — cercos (siempre de un mes concreto)
  ledgerBudgets: (month: string) => api.get<BudgetMonth>(`/ledger/budgets?month=${month}`),
  saveBudgets: (month: string, items: { category_id: number; amount_minor: number }[]) =>
    api.put<BudgetMonth>("/ledger/budgets", { month, items }),

  // erario — reliquias
  listGoals: (includeArchived = false) =>
    api.get<SavingsGoal[]>(`/ledger/goals?include_archived=${includeArchived}`),
  createGoal: (data: Partial<SavingsGoal>) => api.post<SavingsGoal>("/ledger/goals", data),
  updateGoal: (id: number, data: Partial<SavingsGoal>) =>
    api.patch<SavingsGoal>(`/ledger/goals/${id}`, data),
  deleteGoal: (id: number) => api.del<void>(`/ledger/goals/${id}`),

  // erario — la mirada larga
  ledgerStats: (months = 6) => api.get<LedgerStats>(`/ledger/stats?months=${months}`),

  // erario — cierre del mes
  monthReview: (month: string) =>
    api.get<LedgerMonthReview | null>(`/ledger/reviews/${month}`),
  closeMonth: (data: Partial<LedgerMonthReview> & { month_key: string }) =>
    api.post<XPEventResponse>("/ledger/reviews", data),
};
