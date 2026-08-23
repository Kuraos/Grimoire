from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select, func, distinct
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    Achievement, Habit, HabitLog, PomodoroSession, DiaryEntry, WeeklyReview, Task,
    DailyCheckin, Quest, LedgerEntry, LedgerMonthReview, SavingsGoal, User,
    TrainingSession, StrengthGoal,
)
from schemas import AchievementOut
from services import get_user
from achievements import _max_current_streak, _consecutive_days_count

router = APIRouter(prefix="/achievements", tags=["achievements"])


def _best_week_kinds(rows: list[tuple[str, date]]) -> int:
    """Cuántas modalidades distintas juntó la mejor semana ISO."""
    weeks: dict[date, set[str]] = defaultdict(set)
    for kind, day in rows:
        weeks[day - timedelta(days=day.weekday())].add(kind)
    return max((len(k) for k in weeks.values()), default=0)


# Clave del logro -> (métrica, meta). Lo que la barra de un logro bloqueado
# enseña, y lo que ordena «El más cercano».
#
# Estaban calculadas seis de veintisiete. Las otras veintiuna devolvían 0.0
# fijo, y como la pieza del más cercano descarta lo que tiene progreso cero
# —«más cercano» tiene que significar empezado—, ninguna podía proponerse jamás:
# ni las rachas, ni las tareas, ni las misiones, ni ninguno de los siete del
# erario. La vista prometía «qué sigue» y contestaba con un subconjunto
# arbitrario de seis.
#
# Faltan tres a propósito: `total_discipline`, `project_master` y `full_ledger`
# no son «lo que llevas de N» sino un sí o un no, y media barra ahí sería una
# cifra inventada.
PROGRESS_METRICS: dict[str, tuple[str, int]] = {
    # hábitos
    "first_blood": ("habit_logs", 1),
    "iron_constancy": ("max_streak", 7),
    "iron_month": ("max_streak", 30),
    "streak_60": ("max_streak", 60),
    "streak_centurion": ("max_streak", 100),
    "polymath": ("habit_categories", 4),
    # foco
    "focus_centurion": ("pomodoros", 100),
    "focus_legend": ("pomodoros", 250),
    # nivel
    "ascension": ("level", 5),
    "contemplator": ("level", 10),
    "archon": ("level", 15),
    "ether_being": ("level", 20),
    # diario, tareas, ritos
    "archivist": ("diary_entries", 30),
    "diary_century": ("diary_entries", 100),
    "task_centurion": ("tasks_done", 100),
    "introspection": ("checkin_streak", 14),
    "great_review": ("reviews", 4),
    "quest_devotee": ("quests_claimed", 10),
    # erario
    "first_entry": ("ledger_entries", 1),
    "ledger_30": ("ledger_days", 30),
    "ledger_180": ("ledger_days", 180),
    "closed_books": ("months_closed", 3),
    "first_relic": ("relics", 1),
    "relic_hoard": ("relics", 3),
    # palestra
    "first_session": ("training_sessions", 1),
    "training_50": ("training_sessions", 50),
    "training_200": ("training_sessions", 200),
    "training_month": ("training_month_days", 12),
    # «las tres armas» parece un sí o un no, pero sí es «lo que llevas de N»:
    # cuántas modalidades distintas juntó la mejor semana. Dos de tres es un
    # progreso real y merece verse.
    "triathlete": ("training_kinds_best_week", 3),
    "first_strength_goal": ("strength_goals", 1),
    "strength_goal_hoard": ("strength_goals", 3),
}


async def _metrics(db: AsyncSession, user: User) -> dict[str, int]:
    """Los contadores que alimentan el progreso, calculados UNA vez por carga.

    Antes cada logro hacía sus propias consultas dentro del bucle de la lista.
    Con la racha máxima —que recorre todos los hábitos, cada uno con su propia
    consulta— eso habría sido O(logros × hábitos) por cada vez que se abre la
    vista.
    """
    async def count(stmt) -> int:
        return (await db.execute(stmt)).scalar_one()

    checkin_days = set((await db.execute(select(DailyCheckin.checkin_date))).scalars().all())

    return {
        "habit_logs": await count(select(func.count(HabitLog.id))),
        "max_streak": await _max_current_streak(db),
        "habit_categories": await count(
            select(func.count(distinct(Habit.category))).where(Habit.active == True)  # noqa: E712
        ),
        "pomodoros": await count(
            select(func.count(PomodoroSession.id)).where(PomodoroSession.completed == True)  # noqa: E712
        ),
        "level": user.level,
        "diary_entries": await count(
            select(func.count(DiaryEntry.id)).where(DiaryEntry.content != "")
        ),
        "tasks_done": await count(
            select(func.count(Task.id)).where(Task.completed == True)  # noqa: E712
        ),
        "checkin_streak": await _consecutive_days_count(checkin_days),
        "reviews": await count(select(func.count(WeeklyReview.id))),
        "quests_claimed": await count(
            select(func.count(Quest.id)).where(Quest.claimed == True)  # noqa: E712
        ),
        "ledger_entries": await count(select(func.count(LedgerEntry.id))),
        # el día del ACTO, igual que su XP: rellenar el mes de una sentada es un
        # día de constancia, no treinta
        "ledger_days": await count(
            select(func.count(distinct(func.date(LedgerEntry.created_at))))
        ),
        "months_closed": await count(select(func.count(LedgerMonthReview.id))),
        "relics": await count(
            select(func.count(SavingsGoal.id)).where(SavingsGoal.achieved_at.is_not(None))
        ),
        "training_sessions": await count(select(func.count(TrainingSession.id))),
        # Los dos del entrenamiento van por `occurred_on` y no por `created_at`,
        # al revés que los del erario: aquí el logro premia haber entrenado, y
        # una sesión del martes anotada el jueves ocurrió el martes. En el erario
        # el acto ES anotar, y por eso allí manda el día del acto.
        "training_month_days": (await db.execute(
            select(func.count(distinct(TrainingSession.occurred_on)))
            .group_by(func.strftime("%Y-%m", TrainingSession.occurred_on))
            .order_by(func.count(distinct(TrainingSession.occurred_on)).desc())
            .limit(1)
        )).scalar_one_or_none() or 0,
        "training_kinds_best_week": _best_week_kinds(
            (await db.execute(
                select(TrainingSession.kind, TrainingSession.occurred_on)
            )).all()
        ),
        "strength_goals": await count(
            select(func.count(StrengthGoal.id)).where(StrengthGoal.achieved_at.is_not(None))
        ),
    }


@router.get("", response_model=list[AchievementOut])
async def list_achievements(db: AsyncSession = Depends(get_db)):
    user = await get_user(db)
    rows = (await db.execute(select(Achievement).order_by(Achievement.id))).scalars().all()
    values = await _metrics(db, user)
    out = []
    for a in rows:
        o = AchievementOut.model_validate(a)
        if a.unlocked:
            o.progress = 1.0
        else:
            metric, target = PROGRESS_METRICS.get(a.key, (None, 0))
            o.progress = min(1.0, values.get(metric, 0) / target) if metric else 0.0
        out.append(o)
    return out
