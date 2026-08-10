"""Pydantic request/response schemas."""
from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

Priority = Literal["high", "medium", "low"]
TaskStatus = Literal["todo", "doing", "done"]
Frequency = Literal["daily", "weekly"]
ProjectStatus = Literal["active", "paused", "closed"]
Recurrence = Literal["none", "daily", "weekly"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- User ----------
class UserOut(ORMModel):
    id: int
    name: str
    xp: int
    level: int
    title: str
    lives: int = 3
    obsidian_vault_path: str | None = None
    xp_for_current_level: int = 0
    xp_for_next_level: int = 0
    xp_into_level: int = 0
    xp_span: int = 0


class UserUpdate(BaseModel):
    name: str | None = None
    obsidian_vault_path: str | None = None


# ---------- Habits ----------
class HabitCategoryCreate(BaseModel):
    name: str
    color: str = "#9b7fc4"


class HabitCategoryOut(ORMModel):
    id: int
    name: str
    color: str
    habit_count: int = 0  # active + archived habits using this category name


def _normalize_days(v: str | None) -> str | None:
    """"3,0,0" -> "0,3". Vacío o None -> None (= todos los días)."""
    if v is None:
        return None
    raw = str(v).strip()
    if not raw:
        return None
    try:
        nums = sorted({int(p) for p in raw.split(",") if p.strip()})
    except ValueError:
        raise ValueError("days debe ser una lista de enteros separados por comas")
    if not nums:
        return None
    if nums[0] < 0 or nums[-1] > 6:
        raise ValueError("days sólo acepta 0–6 (0 = lunes)")
    return ",".join(str(n) for n in nums)


class HabitBase(BaseModel):
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    frequency: Frequency = "daily"
    # días de la semana en que toca (0=lunes). None = todos. Sólo aplica a "daily".
    days: str | None = None
    # marcas necesarias para dar la semana por hecha. Sólo aplica a "weekly".
    target_per_week: int = Field(default=1, ge=1, le=7)
    xp_reward: int = Field(default=20, ge=10, le=100)
    color: str = "#9b7fc4"
    notes: str | None = None
    tags: str | None = None

    @field_validator("days")
    @classmethod
    def _norm_days(cls, v: str | None) -> str | None:
        return _normalize_days(v)


class HabitCreate(HabitBase):
    pass


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, min_length=1)
    frequency: Frequency | None = None
    days: str | None = None
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    xp_reward: int | None = Field(default=None, ge=10, le=100)
    color: str | None = None
    notes: str | None = None
    tags: str | None = None
    active: bool | None = None

    @field_validator("days")
    @classmethod
    def _norm_days(cls, v: str | None) -> str | None:
        return _normalize_days(v)


class HabitOut(ORMModel):
    id: int
    name: str
    category: str
    frequency: str
    days: str | None = None
    target_per_week: int = 1
    xp_reward: int
    color: str
    active: bool
    notes: str | None
    tags: str | None = None
    created_at: datetime
    streak: int = 0
    best_streak: int = 0
    total_xp: int = 0
    completion_rate: float = 0.0
    done_today: bool = False
    last_completed: datetime | None = None


class HabitLogOut(ORMModel):
    id: int
    habit_id: int
    completed_at: datetime
    notes: str | None


# ---------- Projects ----------
class ProjectBase(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    status: ProjectStatus = "active"
    color: str = "#9b7fc4"
    category: str | None = None
    vault_note_path: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: ProjectStatus | None = None
    color: str | None = None
    category: str | None = None
    vault_note_path: str | None = None


class ProjectOut(ORMModel):
    id: int
    name: str
    description: str | None
    status: str
    color: str
    category: str | None
    vault_note_path: str | None = None
    created_at: datetime
    tasks_total: int = 0
    tasks_pending: int = 0
    pomodoro_hours: float = 0.0


# ---------- Tasks ----------
class ChecklistItemCreate(BaseModel):
    text: str


class ChecklistItemUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None
    position: int | None = None


class ChecklistItemOut(ORMModel):
    id: int
    task_id: int
    text: str
    done: bool
    position: int


class TaskBase(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    category: str | None = None
    priority: Priority = "medium"
    project_id: int | None = None
    due_date: date | None = None
    xp_reward: int = Field(default=15, ge=5, le=50)
    status: TaskStatus = "todo"
    remind_at: datetime | None = None
    tags: str | None = None
    vault_note_path: str | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    category: str | None = None
    priority: Priority | None = None
    project_id: int | None = None
    due_date: date | None = None
    xp_reward: int | None = Field(default=None, ge=5, le=50)
    completed: bool | None = None
    status: TaskStatus | None = None
    position: int | None = None
    remind_at: datetime | None = None
    tags: str | None = None
    vault_note_path: str | None = None


class TaskOut(ORMModel):
    id: int
    title: str
    description: str | None
    category: str | None
    priority: str
    project_id: int | None
    due_date: date | None
    xp_reward: int
    completed: bool
    completed_at: datetime | None
    status: str = "todo"
    position: int = 0
    remind_at: datetime | None = None
    tags: str | None = None
    vault_note_path: str | None = None
    created_at: datetime
    checklist: list[ChecklistItemOut] = []
    checklist_done: int = 0
    checklist_total: int = 0


# ---------- Pomodoro ----------
class PomodoroCreate(BaseModel):
    task_id: int | None = None
    project_id: int | None = None
    work_minutes: int = 25
    # False = el bloque se abandonó a medias. Queda registrado para que las horas
    # cuadren, pero no otorga XP ni cuenta para logros ni misiones.
    completed: bool = True
    # Arranque real del bloque. Sin esto, `started_at` tomaba su default y
    # guardaba la hora de fin, que es la única que el servidor puede conocer.
    started_at: datetime | None = None


class PomodoroOut(ORMModel):
    id: int
    task_id: int | None
    project_id: int | None
    work_minutes: int
    completed: bool
    started_at: datetime
    finished_at: datetime | None
    task_title: str | None = None


# ---------- Calendar ----------
class EventBase(BaseModel):
    title: str = Field(min_length=1)
    category: str | None = None
    color: str = "#9b7fc4"
    start_dt: datetime
    end_dt: datetime | None = None
    notes: str | None = None
    recurrence: Recurrence = "none"
    recurrence_until: date | None = None


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    category: str | None = None
    color: str | None = None
    start_dt: datetime | None = None
    end_dt: datetime | None = None
    notes: str | None = None
    recurrence: Recurrence | None = None
    recurrence_until: date | None = None


class IcsImportRequest(BaseModel):
    content: str
    color: str = "#7f8fc4"
    category: str | None = "Importado"


class IcsImportResult(BaseModel):
    created: int = 0
    updated: int = 0
    events_in_file: int = 0
    titles: list[str] = []
    warnings: list[str] = []


class EventOut(ORMModel):
    id: int
    title: str
    category: str | None
    color: str
    start_dt: datetime
    end_dt: datetime | None
    notes: str | None
    recurrence: str = "none"
    recurrence_until: date | None = None
    is_occurrence: bool = False


# ---------- Diary ----------
class DiaryOut(ORMModel):
    id: int | None = None  # null when the day has no persisted row yet
    entry_date: date
    content: str
    tags: str | None = None
    updated_at: datetime


class DiaryUpdate(BaseModel):
    content: str
    tags: str | None = None


class DiarySearchResult(ORMModel):
    entry_date: date
    content: str


# ---------- Check-ins ----------
class CheckinCreate(BaseModel):
    energy: int = Field(ge=1, le=5)
    mood: int = Field(ge=1, le=5)
    note: str | None = None


class CheckinOut(ORMModel):
    id: int
    checkin_date: date
    energy: int
    mood: int
    note: str | None


# ---------- Achievements ----------
class AchievementOut(ORMModel):
    id: int
    key: str
    name: str
    description: str
    icon: str
    tier: str = "common"
    unlocked: bool
    unlocked_at: datetime | None
    progress: float = 0.0


# ---------- Quests ----------
class QuestOut(ORMModel):
    id: int
    scope: str
    metric: str
    target: int
    title: str
    icon: str
    xp_reward: int
    claimed: bool
    progress: int = 0
    completed: bool = False


# ---------- Streak / lives ----------
class StreakEvalResponse(BaseModel):
    lives: int
    life_lost: bool = False
    lives_gained: int = 0
    broken_habits: list[str] = []
    xp_penalty: int = 0
    new_xp: int = 0


# ---------- Weekly reviews ----------
class ReviewCreate(BaseModel):
    week_iso: str | None = None
    what_worked: str | None = None
    what_failed: str | None = None
    next_change: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)


class ReviewOut(ORMModel):
    id: int
    week_iso: str
    what_worked: str | None
    what_failed: str | None
    next_change: str | None
    rating: int | None
    created_at: datetime


# ---------- Generic XP-event response wrapper ----------
class XPEventResponse(BaseModel):
    xp_earned: int = 0
    new_xp: int = 0
    new_level: int = 1
    title: str = ""
    leveled_up: bool = False
    streak: int | None = None
    total_today_minutes: int | None = None
    achievement_unlocked: AchievementOut | None = None
