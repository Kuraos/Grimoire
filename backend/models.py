"""SQLAlchemy ORM models mapping the Grimoire schema."""
from datetime import datetime, date
from sqlalchemy import (
    Integer, String, Text, Boolean, DateTime, Date, ForeignKey, CheckConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from tz import now as _now
# All timestamps default to LOCAL time (via tz._now, honoring GRIMOIRE_TZ) rather
# than SQLite's UTC CURRENT_TIMESTAMP, so `func.date(...)` comparisons against the
# app's local "today" stay consistent across the date boundary.


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="Grimoirista")
    xp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String, default="Iniciado")
    lives: Mapped[int] = mapped_column(Integer, default=3)
    last_streak_eval: Mapped[date | None] = mapped_column(Date, nullable=True)
    obsidian_vault_path: Mapped[str | None] = mapped_column(String, nullable=True)  # Obsidian export target
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Habit(Base):
    __tablename__ = "habits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    frequency: Mapped[str] = mapped_column(String, default="daily")
    # Cadencia fina. Las dos columnas se excluyen: `days` sólo cuenta si
    # frequency="daily", `target_per_week` sólo si frequency="weekly".
    #   days: "0,1,5" (0=lunes) -> sólo esos días cuentan para racha y penalización.
    #         NULL = todos los días, que es el comportamiento histórico.
    #   target_per_week: cuántas marcas hacen falta para dar la semana por hecha.
    days: Mapped[str | None] = mapped_column(String, nullable=True)
    target_per_week: Mapped[int] = mapped_column(Integer, default=1)
    xp_reward: Mapped[int] = mapped_column(Integer, default=20)
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # comma-separated
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    logs: Mapped[list["HabitLog"]] = relationship(back_populates="habit", cascade="all, delete-orphan")


class HabitCategory(Base):
    """Catalog of habit categories. `habits.category` stays a plain string (no FK)
    so existing rows keep working; this table is what the UI offers and manages."""
    __tablename__ = "habit_categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class HabitLog(Base):
    __tablename__ = "habit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"))
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    habit: Mapped["Habit"] = relationship(back_populates="logs")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    vault_note_path: Mapped[str | None] = mapped_column(String, nullable=True)  # pointer to an Obsidian note
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    tasks: Mapped[list["Task"]] = relationship(back_populates="project")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    priority: Mapped[str] = mapped_column(String, default="medium")
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    xp_reward: Mapped[int] = mapped_column(Integer, default=15)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="todo")  # todo|doing|done (kanban)
    position: Mapped[int] = mapped_column(Integer, default=0)
    remind_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # comma-separated
    vault_note_path: Mapped[str | None] = mapped_column(String, nullable=True)  # pointer to an Obsidian note
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    project: Mapped["Project | None"] = relationship(back_populates="tasks")
    checklist: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="ChecklistItem.position"
    )


class PomodoroSession(Base):
    __tablename__ = "pomodoro_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    work_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    start_dt: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_dt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurrence: Mapped[str] = mapped_column(String, default="none")  # none|daily|weekly
    recurrence_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    # natural key of an imported .ics occurrence -> re-importing updates, never duplicates
    ics_uid: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DiaryEntry(Base):
    __tablename__ = "diary_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # comma-separated
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class DailyCheckin(Base):
    __tablename__ = "daily_checkins"
    __table_args__ = (
        CheckConstraint("energy BETWEEN 1 AND 5"),
        CheckConstraint("mood BETWEEN 1 AND 5"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    checkin_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    energy: Mapped[int] = mapped_column(Integer)
    mood: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Achievement(Base):
    __tablename__ = "achievements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[str] = mapped_column(String, default="common")  # common|rare|epic|legendary
    unlocked: Mapped[bool] = mapped_column(Boolean, default=False)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WeeklyReview(Base):
    __tablename__ = "weekly_reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    week_iso: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    what_worked: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_failed: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_change: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class XPLog(Base):
    __tablename__ = "xp_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Quest(Base):
    """A daily/weekly mission seeded per period; progress is computed live."""
    __tablename__ = "quests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String, nullable=False)       # daily|weekly
    period_key: Mapped[str] = mapped_column(String, nullable=False)  # ISO date or YYYY-W##
    template_key: Mapped[str] = mapped_column(String, nullable=False)
    metric: Mapped[str] = mapped_column(String, nullable=False)
    target: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(String, default="target")
    xp_reward: Mapped[int] = mapped_column(Integer, default=25)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    text: Mapped[str] = mapped_column(String, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    task: Mapped["Task"] = relationship(back_populates="checklist")
