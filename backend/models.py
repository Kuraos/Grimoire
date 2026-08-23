"""SQLAlchemy ORM models mapping the Grimoire schema."""
from datetime import datetime, date
from sqlalchemy import (
    Integer, String, Text, Boolean, DateTime, Date, ForeignKey, CheckConstraint,
    UniqueConstraint, func
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
    # Unidad en que se MUESTRA el peso del entrenamiento. Los gramos guardados no
    # cambian nunca; esto sólo decide cómo se pintan y cómo se leen del
    # formulario. Vive aquí, una sola vez, y no en el ejercicio: por ejercicio, el
    # volumen semanal sumaría kilos con libras en la misma barra.
    weight_unit: Mapped[str] = mapped_column(String, default="kg")  # kg|lb
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


class Account(Base):
    """Un arca: dónde está el dinero.

    El saldo NO se guarda. Se deduce de `opening_minor` más los asientos, así que
    no puede desincronizarse: un saldo persistido y una lista de movimientos son
    dos fuentes de verdad para el mismo dato, y tarde o temprano discrepan.
    """
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, default="bank")  # cash|bank|savings|debt
    # ISO 4217. El erario no soporta mezclar monedas: sumar sin tasas daría un
    # total que parece bueno y no lo es, así que el router rechaza la segunda.
    currency: Mapped[str] = mapped_column(String, default="COP")
    opening_minor: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class LedgerCategory(Base):
    """Una partida: en qué se va o de dónde viene el dinero.

    El cerco NO vive aquí: vive en `category_budgets`, con un mes. Estuvo aquí
    como columna única y era mentira —cambiarlo en noviembre reescribía lo que
    decía agosto—, porque un presupuesto es un dato de un mes concreto, no una
    propiedad permanente de la partida.
    """
    __tablename__ = "ledger_categories"
    # (nombre, tipo) y no sólo nombre: "Beca" puede ser gasto e ingreso a la vez.
    __table_args__ = (UniqueConstraint("name", "kind"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, default="expense")  # expense|income
    color: Mapped[str] = mapped_column(String, default="#9b7fc4")
    icon: Mapped[str] = mapped_column(String, default="circle")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CategoryBudget(Base):
    """El cerco de una partida en un mes.

    Se arrastra: el cerco vigente de un mes es el de la fila explícita más
    reciente cuyo mes sea <= ese. Así fijar 500.000 en agosto vale también para
    septiembre y octubre sin tener que repetirlo, y cambiarlo en noviembre crea
    la fila de noviembre —dejando agosto exactamente como estaba.

    `amount_minor = 0` es «este mes, sin cerco», y es distinto de no tener fila:
    sin fila se hereda, con un cero se corta la herencia a propósito.
    """
    __tablename__ = "category_budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "month_key"),
        CheckConstraint("amount_minor >= 0"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("ledger_categories.id"))
    month_key: Mapped[str] = mapped_column(String, nullable=False)  # "YYYY-MM"
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class LedgerEntry(Base):
    """Un asiento: un movimiento del libro.

    `amount_minor` es SIEMPRE positivo y el signo lo pone `kind`. Guardar montos
    con signo deja escribir un gasto negativo, que suma en vez de restar y no se
    ve en la lista porque el «−» de la interfaz lo pinta el tipo, no el dato.

    Se guarda en unidades menores como entero. Un float no representa 18.000,10
    de forma exacta y el error se acumula en cada suma; ver MONEY_DECIMALS en
    constants.py para el exponente que usa cada moneda.

    `occurred_on` es Date, no DateTime: un gasto pertenece a un día, no a un
    instante, y así no hay ventana de zona horaria que corregir.
    """
    __tablename__ = "ledger_entries"
    __table_args__ = (CheckConstraint("amount_minor > 0"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    # NULL = sin clasificar. Es un estado legítimo y visible, no un error: anotar
    # rápido y clasificar después es lo que hace que el libro se mantenga al día.
    category_id: Mapped[int | None] = mapped_column(ForeignKey("ledger_categories.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String, default="expense")  # expense|income|transfer
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    concept: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # comma-separated
    # Destino del traspaso. Sólo se llena si kind="transfer"; un traspaso sale de
    # `account_id` y entra en éste, y no cuenta como gasto ni como ingreso.
    counter_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    # Aporte a una reliquia. Sólo tiene sentido en un traspaso: ahorrar es mover
    # dinero de un arca a otra, no gastarlo.
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("savings_goals.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class SavingsGoal(Base):
    """Una reliquia: algo hacia lo que se ahorra.

    El progreso NO se guarda: se deduce de los traspasos marcados con esta meta,
    igual que el saldo de un arca se deduce de sus asientos. Así una reliquia no
    puede discrepar del libro, y dos reliquias sobre la misma arca llevan cada
    una su propia cuenta en vez de mostrar las dos el saldo entero.

    `achieved_at` se sella una vez y no se reabre: es la única forma de que el XP
    no se pueda cobrar dos veces bajando y subiendo la meta.
    """
    __tablename__ = "savings_goals"
    __table_args__ = (CheckConstraint("target_minor > 0"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    target_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    # el arca donde vive el dinero de esta reliquia
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#a98bf0")
    icon: Mapped[str] = mapped_column(String, default="diamond")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class LedgerMonthReview(Base):
    """El cierre de un mes del erario.

    No cabe como `Quest` —su `scope` sólo admite daily|weekly—, así que va como
    tabla propia, igual que `weekly_reviews` con su `week_iso`.

    Guarda el asignado y el gastado del momento del cierre porque
    `ledger_categories.budget_minor` es global, no por mes: cambiar un cerco en
    noviembre reescribiría lo que decía la revisión de agosto. El snapshot es lo
    que hace que la revisión sea un registro y no una vista.
    """
    __tablename__ = "ledger_month_reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)  # "YYYY-MM"
    what_worked: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_leaked: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_change: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_total_minor: Mapped[int] = mapped_column(Integer, default=0)
    spent_minor: Mapped[int] = mapped_column(Integer, default=0)
    unclassified_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class MuscleGroup(Base):
    """Catálogo de grupos musculares.

    `exercises.muscle_group_id` apunta aquí en vez de guardar texto libre porque
    el volumen semanal AGRUPA por esto, y una clave de agrupación en texto libre
    se fragmenta sola: «Pecho», «pecho» y «pectoral» salen como tres barras. Es
    el mismo motivo por el que las partidas del erario son tabla y no cadena.
    """
    __tablename__ = "muscle_groups"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#9a90b5")
    icon: Mapped[str] = mapped_column(String, default="circle")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Exercise(Base):
    """Un ejercicio del catálogo: se crea una vez y se reutiliza en cada serie.

    NO lleva unidad de peso, y es deliberado. La unidad es preferencia de
    presentación y vive una sola vez, en `users.weight_unit`. Colgada del
    ejercicio, el volumen semanal sumaría kilos con libras dentro de la misma
    barra, y cambiarla reinterpretaría todo el historial de ese ejercicio —el
    mismo desastre que cambiarle el exponente a una moneda ya usada.
    """
    __tablename__ = "exercises"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    muscle_group_id: Mapped[int | None] = mapped_column(ForeignKey("muscle_groups.id"), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class TrainingSession(Base):
    """Una sesión de entrenamiento. UNA tabla para las tres modalidades.

    `kind` discrimina, igual que `ledger_entries` mete gasto, ingreso y traspaso
    —tres cosas semánticamente distintas— en una sola tabla con las columnas de
    cada una anulables. Tres tablas habrían costado tres routers, tres
    formularios y un UNION cada vez que alguien pregunta cuántas sesiones lleva
    la semana; y una cuarta modalidad sería una migración en vez de una
    constante.

    `occurred_on` es Date y no DateTime por lo mismo que un asiento del erario:
    una sesión pertenece a un día, no a un instante.

    `habit_id` es el rito que el usuario eligió que marque esta modalidad;
    `habit_log_id` es la marca que de verdad se creó, y es NULL si no se creó
    ninguna —fecha pasada, meta semanal ya cumplida, o ya estaba marcado—. Se
    guarda para poder decirlo en la lista, no para deshacerlo: borrar la sesión
    NO retira la marca ni devuelve el XP, que es la prohibición del farmeo.
    """
    __tablename__ = "training_sessions"
    __table_args__ = (
        CheckConstraint("duration_s IS NULL OR duration_s > 0"),
        CheckConstraint("distance_m IS NULL OR distance_m >= 0"),
        CheckConstraint("intensity IS NULL OR intensity BETWEEN 1 AND 5"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, default="strength")  # strength|hema|cardio
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # sólo HEMA
    intensity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    techniques: Mapped[str | None] = mapped_column(String, nullable=True)  # comma-separated
    # sólo cardio. El ritmo NO se guarda: sale de distancia y duración.
    cardio_kind: Mapped[str | None] = mapped_column(String, nullable=True)  # run|bike|other
    distance_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    habit_id: Mapped[int | None] = mapped_column(ForeignKey("habits.id"), nullable=True)
    habit_log_id: Mapped[int | None] = mapped_column(ForeignKey("habit_logs.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    sets: Mapped[list["TrainingSet"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="TrainingSet.position"
    )


class TrainingSet(Base):
    """Una serie. Sólo la usan las sesiones de fuerza.

    `weight_g` es entero en GRAMOS por la misma razón que `amount_minor` es
    entero en unidades menores: un float pierde exactitud al sumar y el volumen
    semanal suma peso×reps sobre miles de series. 2,5 kg se guarda como 2500.

    Un cero es legítimo: una dominada sin lastre pesa 0 g de carga añadida.

    El 1RM estimado no está aquí porque se deduce de `reps` y `weight_g`, igual
    que el saldo de un arca se deduce de sus asientos.
    """
    __tablename__ = "training_sets"
    __table_args__ = (
        CheckConstraint("reps > 0"),
        CheckConstraint("weight_g >= 0"),
        CheckConstraint("rpe IS NULL OR rpe BETWEEN 1 AND 10"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("training_sessions.id"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_g: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)

    session: Mapped["TrainingSession"] = relationship(back_populates="sets")


class StrengthGoal(Base):
    """Una meta de fuerza: la reliquia del erario, en kilos.

    Es el mismo objeto con otras unidades, y por las mismas razones:

    - El progreso NO se guarda: sale de las series de ese ejercicio. Un máximo
      persistido y una lista de series son dos fuentes de verdad del mismo dato.
    - `achieved_at` se sella una vez y no se reabre.
    - Bajar la cifra por debajo de lo que ya se levanta no la marca sola: hace
      falta una serie POSTERIOR que la alcance. Sin eso, editar el objetivo
      sería la forma más barata de cobrar 50 XP.

    Existe para reemplazar el «logro por PR» que pedía la propuesta. Un récord
    es la cifra, y la cifra la teclea el usuario sin validación posible:
    premiarlo premia la genética y la sinceridad. Una meta se fija ANTES, igual
    que una misión, y por eso sí puede llevar oro.
    """
    __tablename__ = "strength_goals"
    __table_args__ = (
        CheckConstraint("target_weight_g >= 0"),
        CheckConstraint("target_reps > 0"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    target_weight_g: Mapped[int] = mapped_column(Integer, nullable=False)
    target_reps: Mapped[int] = mapped_column(Integer, default=1)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#a98bf0")
    icon: Mapped[str] = mapped_column(String, default="target-arrow")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class BodyMetric(Base):
    """Una medida del cuerpo. Serie temporal, aparte de las sesiones.

    No cuelga de ninguna sesión a propósito: uno se pesa el martes sin haber
    entrenado. Y no da XP, ni racha, ni logro. Convertir el peso corporal en un
    objetivo con recompensa crea un incentivo perverso justo donde más daño
    hace; aquí es dato neutro de tendencia, ni bueno ni malo.

    `value_milli` son milésimas de la unidad canónica del tipo —kg para el peso,
    cm para las medidas—, que declara `BODY_METRIC_UNITS` en constants.py. Es
    entero por lo mismo que todo lo demás, y su espejo en `utils.ts` lo ata un
    test: 76,9 kg se guarda como 76900.
    """
    __tablename__ = "body_metrics"
    __table_args__ = (
        # una medida por tipo y día: pesarse dos veces el martes es corregirse,
        # no acumular dos puntos en la tendencia
        UniqueConstraint("kind", "measured_on"),
        CheckConstraint("value_milli > 0"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)  # weight|waist|chest|arm|thigh|hip
    measured_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value_milli: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    text: Mapped[str] = mapped_column(String, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    task: Mapped["Task"] = relationship(back_populates="checklist")
