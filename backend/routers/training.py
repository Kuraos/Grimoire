"""La palestra: sesiones, series, ejercicios, metas de fuerza y medidas del cuerpo.

La tesis cabe en una línea, y es la del erario con otras unidades: **el XP premia
el acto de asentar, jamás la carga.** Pagar por kilos levantados premia la
genética, el descanso, el material — y sobre todo un número que teclea el usuario
sin validación posible. Premiar el registro es lo que sostiene la práctica.

De ahí sale todo lo demás:

- Un récord personal se MUESTRA y no se paga. Se dibuja en la curva, en tinta,
  como el dato que es. Lo que sí lleva oro es una meta de fuerza declarada ANTES
  y cumplida, que es la reliquia del erario con kilos: el usuario la fijó, igual
  que una misión.
- El peso corporal no da XP, ni racha, ni logro. Convertirlo en objetivo con
  recompensa crea un incentivo perverso justo donde más daño hace.
- No hay penalización. No entrenar simplemente no paga; nunca resta XP ni cuesta
  una vida. Una racha rota por no poder entrenar produce ansiedad en quien menos
  margen tiene, que es exactamente a quien hay que no empujar.
"""
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    BodyMetric, Exercise, Habit, MuscleGroup, StrengthGoal, TrainingSession,
    TrainingSet, XPLog,
)
from schemas import (
    MuscleGroupCreate, MuscleGroupUpdate, MuscleGroupOut,
    ExerciseCreate, ExerciseUpdate, ExerciseOut,
    TrainingSessionCreate, TrainingSessionUpdate, TrainingSessionOut,
    TrainingSessionCreated, TrainingSetOut,
    StrengthGoalCreate, StrengthGoalUpdate, StrengthGoalOut,
    BodyMetricCreate, BodyMetricUpdate, BodyMetricOut, BodyMetricSeriesOut,
    BodyMetricPointOut, TrainingSummaryOut, TrainingStatsOut,
    ExerciseProgressOut, ExercisePointOut, VolumeWeekOut, VolumeGroupOut,
    XPEventResponse, AchievementOut,
)
from services import (
    get_user, award_xp, mark_habit_done, like_escape,
    HABIT_DONE_TODAY, HABIT_WEEK_TARGET_MET,
)
from constants import (
    BASE_XP, BODY_METRIC_UNITS, EPLEY_CONFIDENT_REPS, MUSCLE_GROUP_DEFAULTS,
    estimated_1rm_g,
)
from achievements import check_achievements
from tz import now as _now, today as _today

router = APIRouter(prefix="/training", tags=["training"])


def _week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


# --------------------------------------------------------------------------
# Derivados. Nada de esto se guarda, por lo mismo que no se guarda el saldo de
# un arca: un total persistido y la lista de la que sale son dos fuentes de
# verdad del mismo dato, y acaban discrepando.
# --------------------------------------------------------------------------

def _pace_s_per_km(distance_m: int | None, duration_s: int | None) -> int | None:
    """Segundos por kilómetro, o None si no se puede saber.

    El guardia de `distance_m > 0` no es defensivo por costumbre: una sesión de
    cinta o de remo se anota con duración y sin distancia, y sin él eso divide
    entre cero. Es la misma clase de bug que el erario tenía repartiendo el
    disponible entre los días que quedan del mes ya cerrado.
    """
    if not distance_m or not duration_s or distance_m <= 0:
        return None
    return round(duration_s * 1000 / distance_m)


def _set_out(s: TrainingSet) -> TrainingSetOut:
    out = TrainingSetOut.model_validate(s)
    out.est_1rm_g = estimated_1rm_g(s.weight_g, s.reps)
    out.low_confidence = s.reps > EPLEY_CONFIDENT_REPS
    return out


def _session_out(s: TrainingSession) -> TrainingSessionOut:
    out = TrainingSessionOut.model_validate(s)
    out.sets = [_set_out(x) for x in s.sets]
    out.volume_g = sum(x.reps * x.weight_g for x in s.sets)
    out.set_count = len(s.sets)
    out.pace_s_per_km = _pace_s_per_km(s.distance_m, s.duration_s)
    return out


async def _load(db: AsyncSession, session_id: int) -> TrainingSession:
    """Carga una sesión con sus series YA traídas.

    `selectinload` no es una optimización aquí, es lo único que funciona: la
    sesión es async y Pydantic valida en un contexto síncrono, así que una
    colección perezosa revienta con `MissingGreenlet` en cuanto alguien la lee
    para serializarla. Traerla por delante convierte el problema en una segunda
    consulta, que es lo que costaba de todos modos.
    """
    s = (await db.execute(
        select(TrainingSession)
        .options(selectinload(TrainingSession.sets))
        .where(TrainingSession.id == session_id)
    )).scalar_one_or_none()
    if s is None:
        raise HTTPException(404, "Sesión no encontrada")
    return s


# --------------------------------------------------------------------------
# XP
# --------------------------------------------------------------------------

async def _award_training_day(db: AsyncSession) -> tuple[dict | None, object | None]:
    """5 XP por dejar el entrenamiento asentado. Una sola vez por día natural.

    Las prohibiciones del módulo viven en estas líneas:

    - No es retroactivo. Se sella contra `earned_at` —el día del ACTO— y nunca
      contra `occurred_on`. Anotar de una sentada las cuatro sesiones de la
      semana pasada es un día de constancia, no cuatro.
    - Anotar una sesión con fecha vieja SÍ paga, y es a propósito: el XP premia
      el acto de asentar, no el de entrenar. No pagarlo empujaría a no rellenar
      los huecos, y rellenarlos es justo lo que mantiene el registro honesto. Lo
      que la fecha vieja no puede hacer es marcar el rito, porque eso sí sería
      constancia inventada.
    - No se farmea. La marca vive en `xp_log`, no en el número de sesiones:
      borrar y reponer no vuelve a pagar.
    - No lleva multiplicador de racha. `streak_multiplier()` es de hábitos;
      aplicarlo aquí haría que un mes de gimnasio inflara el XP de apuntar una
      serie, que es la misma trampa que el erario prohíbe.
    - No hay penalización por lo que diga la báscula ni por saltarse un día.
    """
    today = _today()
    already = (await db.execute(
        select(func.count(XPLog.id)).where(
            XPLog.source == "training_day",
            func.date(XPLog.earned_at) == today.isoformat(),
        )
    )).scalar_one()
    if already:
        return None, None
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["training_day"], "training_day")
    ach = await check_achievements(db, user, "training_session")
    return result, ach


def _merge_xp(events: list[tuple[dict | None, object | None]]) -> XPEventResponse | None:
    """Una misma sesión puede pagar tres cosas: el día, el rito y una meta.

    Devolver sólo una haría que la cabecera dijera «+5» mientras el usuario acaba
    de ganar 73, y la cifra de XP dejaría de cuadrar con el total.
    """
    done = [(r, a) for r, a in events if r]
    if not done:
        return None
    last = done[-1][0]
    ach = next((a for _, a in done if a), None)
    return XPEventResponse(
        xp_earned=sum(r["xp_earned"] for r, _ in done),
        new_xp=last["new_xp"],
        new_level=last["new_level"],
        title=last["title"],
        leveled_up=any(r["leveled_up"] for r, _ in done),
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )


async def _mark_rite(
    db: AsyncSession, s: TrainingSession
) -> tuple[dict | None, object | None, bool, str | None]:
    """Marca el rito que esta sesión eligió, si de verdad toca.

    Dos reglas, y ninguna es negociable:

    1. **Sólo una sesión de HOY marca.** `complete_habit` sólo sabe marcar el día
       en curso: escribe la marca con la hora actual. Con una sesión de fecha
       pasada eso apuntaría el rito al día equivocado —inflando la racha y
       mintiendo en el mapa de consistencia— y pagaría constancia que no ocurrió.
       La sesión se guarda igual; lo que no hace es marcar.
    2. **Nunca puede tumbar el guardado.** Que el rito ya estuviera marcado, o que
       un semanal ya alcanzara su meta, son estados legítimos y frecuentes —la
       tercera sesión de HEMA de una semana de 2×—. Marcar a mano responde 400;
       aquí se sigue adelante y se cuenta en una nota. Perder el detalle de una
       sesión por intentar ser amable sería el peor intercambio posible.
    """
    if s.habit_id is None:
        return None, None, False, None
    habit = await db.get(Habit, s.habit_id)
    if habit is None:
        return None, None, False, "El rito elegido ya no existe."
    if not habit.active:
        return None, None, False, f"«{habit.name}» está archivado, así que no se marcó."
    if s.occurred_on != _today():
        return None, None, False, (
            f"Fecha pasada: no se marcó «{habit.name}». El rito se marca el día "
            "en que se entrena, nunca a toro pasado."
        )

    result, log, _streak, reason = await mark_habit_done(db, habit)
    if reason == HABIT_DONE_TODAY:
        return None, None, False, f"«{habit.name}» ya estaba marcado hoy."
    if reason == HABIT_WEEK_TARGET_MET:
        target = max(1, habit.target_per_week or 1)
        return None, None, False, (
            f"«{habit.name}» ya alcanzó su meta de {target}× esta semana; "
            "el rito no se marca dos veces."
        )

    s.habit_log_id = log.id if log else None
    user = await get_user(db)
    ach = await check_achievements(db, user, "habit_complete", habit_id=habit.id)
    return result, ach, True, f"«{habit.name}» marcado."


# --------------------------------------------------------------------------
# Metas de fuerza
# --------------------------------------------------------------------------

async def _goal_progress(
    db: AsyncSession, goals: list[StrengthGoal]
) -> dict[int, tuple[int, int]]:
    """(mejor peso, series que califican) por meta, deducido de las series.

    Califica una serie del mismo ejercicio con al menos `target_reps`
    repeticiones. El contador no es adorno: una meta de 0 kg —diez dominadas sin
    lastre— se daría por cumplida con cero series si sólo se comparara el peso,
    porque 0 >= 0.
    """
    if not goals:
        return {}
    out = {g.id: (0, 0) for g in goals}
    rows = (await db.execute(
        select(TrainingSet.exercise_id, TrainingSet.reps, TrainingSet.weight_g)
    )).all()
    by_exercise: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for ex_id, reps, weight in rows:
        by_exercise[ex_id].append((reps, weight))
    for g in goals:
        best, n = 0, 0
        for reps, weight in by_exercise.get(g.exercise_id, ()):
            if reps >= g.target_reps:
                n += 1
                best = max(best, weight)
        out[g.id] = (best, n)
    return out


async def _seal_reached_goals(
    db: AsyncSession, exercise_ids: set[int]
) -> list[tuple[dict | None, object | None]]:
    """Sella las metas alcanzadas de esos ejercicios y paga sus 50 XP, una vez.

    Tres cosas viven aquí, y son las mismas tres de la reliquia:

    - El XP es PLANO. Proporcional al peso significaría que levantar más da más
      XP, y el nivel dejaría de medir constancia para medir fuerza bruta.
    - `achieved_at` no se reabre. Borrar las series después baja el progreso pero
      no desella la meta, así que el ciclo anotar-borrar-anotar no cobra dos veces.
    - Bajar la cifra por debajo de lo que ya se levanta NO la marca sola: esto
      sólo se llama al escribir series, jamás al editar la meta. Hace falta una
      serie POSTERIOR que la alcance, que es lo que de verdad significa haberla
      cumplido. Sin esta línea, editar el objetivo sería la forma más barata de
      cobrar 50 XP que existe en toda la app.
    """
    if not exercise_ids:
        return []
    goals = (await db.execute(
        select(StrengthGoal).where(
            StrengthGoal.exercise_id.in_(exercise_ids),
            StrengthGoal.achieved_at.is_(None),
            StrengthGoal.archived == False,  # noqa: E712
        )
    )).scalars().all()
    if not goals:
        return []
    prog = await _goal_progress(db, goals)
    events = []
    for g in goals:
        best, qualifying = prog[g.id]
        if qualifying == 0 or best < g.target_weight_g:
            continue
        g.achieved_at = _now()
        user = await get_user(db)
        result = await award_xp(
            db, user, BASE_XP["strength_goal_achieved"], "strength_goal", g.id
        )
        ach = await check_achievements(db, user, "strength_goal")
        events.append((result, ach))
    return events


# --------------------------------------------------------------------------
# Catálogos
# --------------------------------------------------------------------------

@router.get("/muscle-groups", response_model=list[MuscleGroupOut])
async def list_muscle_groups(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(MuscleGroup).order_by(MuscleGroup.id))).scalars().all()


@router.post("/muscle-groups", response_model=MuscleGroupOut, status_code=201)
async def create_muscle_group(payload: MuscleGroupCreate, db: AsyncSession = Depends(get_db)):
    dup = (await db.execute(
        select(MuscleGroup).where(func.lower(MuscleGroup.name) == payload.name.lower())
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(400, f"Ya existe un grupo llamado «{dup.name}»")
    g = MuscleGroup(**payload.model_dump())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return g


@router.patch("/muscle-groups/{group_id}", response_model=MuscleGroupOut)
async def update_muscle_group(group_id: int, payload: MuscleGroupUpdate, db: AsyncSession = Depends(get_db)):
    g = await db.get(MuscleGroup, group_id)
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    await db.commit()
    await db.refresh(g)
    return g


@router.delete("/muscle-groups/{group_id}", status_code=204)
async def delete_muscle_group(group_id: int, db: AsyncSession = Depends(get_db)):
    """Sólo si nadie lo usa. Los ejercicios que lo usen se quedan sin grupo, y el
    volumen de meses pasados cambiaría de forma: mejor negarse."""
    g = await db.get(MuscleGroup, group_id)
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    used = (await db.execute(
        select(func.count(Exercise.id)).where(Exercise.muscle_group_id == group_id)
    )).scalar_one()
    if used:
        raise HTTPException(400, f"«{g.name}» lo usan {used} ejercicios")
    await db.delete(g)
    await db.commit()


@router.get("/exercises", response_model=list[ExerciseOut])
async def list_exercises(
    include_archived: bool = False,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    sel = select(Exercise)
    if not include_archived:
        sel = sel.where(Exercise.archived == False)  # noqa: E712
    if q:
        sel = sel.where(Exercise.name.ilike(f"%{like_escape(q)}%", escape="\\"))
    return (await db.execute(sel.order_by(Exercise.name))).scalars().all()


@router.post("/exercises", response_model=ExerciseOut, status_code=201)
async def create_exercise(payload: ExerciseCreate, db: AsyncSession = Depends(get_db)):
    """Idempotente por nombre, sin distinguir mayúsculas.

    Es lo que hace usable el formulario: se escribe «press banca» al vuelo y, si
    ya existe, se reutiliza la fila en vez de abrir una segunda con otra caja.
    Dos ejercicios con el mismo nombre parten la curva de progresión en dos y
    nadie entiende por qué.
    """
    existing = (await db.execute(
        select(Exercise).where(func.lower(Exercise.name) == payload.name.strip().lower())
    )).scalar_one_or_none()
    if existing:
        if existing.archived:
            existing.archived = False
        if payload.muscle_group_id is not None:
            existing.muscle_group_id = payload.muscle_group_id
        await db.commit()
        await db.refresh(existing)
        return existing
    if payload.muscle_group_id is not None and not await db.get(MuscleGroup, payload.muscle_group_id):
        raise HTTPException(404, "Grupo muscular no encontrado")
    ex = Exercise(name=payload.name.strip(), muscle_group_id=payload.muscle_group_id)
    db.add(ex)
    await db.commit()
    await db.refresh(ex)
    return ex


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
async def update_exercise(exercise_id: int, payload: ExerciseUpdate, db: AsyncSession = Depends(get_db)):
    ex = await db.get(Exercise, exercise_id)
    if not ex:
        raise HTTPException(404, "Ejercicio no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if data.get("muscle_group_id") is not None and not await db.get(MuscleGroup, data["muscle_group_id"]):
        raise HTTPException(404, "Grupo muscular no encontrado")
    for k, v in data.items():
        setattr(ex, k, v)
    await db.commit()
    await db.refresh(ex)
    return ex


@router.delete("/exercises/{exercise_id}", status_code=204)
async def delete_exercise(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """Con series anotadas se ARCHIVA, no se borra: la misma decisión que una
    partida usada del erario. Borrarlo se llevaría por delante el historial que
    dibuja la curva."""
    ex = await db.get(Exercise, exercise_id)
    if not ex:
        raise HTTPException(404, "Ejercicio no encontrado")
    used = (await db.execute(
        select(func.count(TrainingSet.id)).where(TrainingSet.exercise_id == exercise_id)
    )).scalar_one()
    goals = (await db.execute(
        select(func.count(StrengthGoal.id)).where(StrengthGoal.exercise_id == exercise_id)
    )).scalar_one()
    if used or goals:
        ex.archived = True
    else:
        await db.delete(ex)
    await db.commit()


# --------------------------------------------------------------------------
# Sesiones
# --------------------------------------------------------------------------

async def _validate_session(db: AsyncSession, data: dict, kind: str):
    if data.get("habit_id") is not None and not await db.get(Habit, data["habit_id"]):
        raise HTTPException(404, "Rito no encontrado")
    if kind != "cardio" and (data.get("distance_m") or data.get("cardio_kind")):
        raise HTTPException(400, "Distancia y tipo de cardio sólo valen en una sesión de cardio")
    if kind != "hema" and (data.get("intensity") or data.get("techniques")):
        raise HTTPException(400, "Intensidad y técnicas sólo valen en una sesión de HEMA")


async def _replace_sets(db: AsyncSession, s: TrainingSession, rows: list) -> set[int]:
    """Reescribe las series de una sesión. Devuelve los ejercicios tocados.

    Borra con un DELETE explícito en vez de recorrer `s.sets`: leer la colección
    la cargaría perezosamente, y en una sesión async eso revienta. De paso es una
    consulta en lugar de una por serie.
    """
    if s.kind != "strength" and rows:
        raise HTTPException(400, "Sólo una sesión de fuerza lleva series")
    ids = {r.exercise_id for r in rows}
    if ids:
        known = set((await db.execute(
            select(Exercise.id).where(Exercise.id.in_(ids))
        )).scalars().all())
        if missing := ids - known:
            raise HTTPException(404, f"Ejercicio no encontrado: {sorted(missing)[0]}")
    await db.execute(delete(TrainingSet).where(TrainingSet.session_id == s.id))
    for i, r in enumerate(rows):
        db.add(TrainingSet(session_id=s.id, position=i, **r.model_dump()))
    await db.flush()
    return ids


@router.get("/sessions", response_model=list[TrainingSessionOut])
async def list_sessions(
    kind: str | None = None,
    since: date | None = None,
    until: date | None = None,
    limit: int = Query(default=60, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    sel = select(TrainingSession).options(selectinload(TrainingSession.sets))
    if kind:
        sel = sel.where(TrainingSession.kind == kind)
    if since:
        sel = sel.where(TrainingSession.occurred_on >= since)
    if until:
        sel = sel.where(TrainingSession.occurred_on <= until)
    rows = (await db.execute(
        sel.order_by(TrainingSession.occurred_on.desc(), TrainingSession.id.desc()).limit(limit)
    )).scalars().all()
    return [_session_out(r) for r in rows]


@router.post("/sessions", response_model=TrainingSessionCreated, status_code=201)
async def create_session(payload: TrainingSessionCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump(exclude={"sets"})
    await _validate_session(db, data, payload.kind)
    s = TrainingSession(**data)
    db.add(s)
    await db.flush()
    touched = await _replace_sets(db, s, payload.sets)

    xp_result, xp_ach, marked, note = await _mark_rite(db, s)
    events = [(xp_result, xp_ach), await _award_training_day(db)]
    events += await _seal_reached_goals(db, touched)

    await db.commit()
    s = await _load(db, s.id)
    return TrainingSessionCreated(
        session=_session_out(s), xp=_merge_xp(events),
        habit_marked=marked, habit_note=note,
    )


@router.get("/sessions/{session_id}", response_model=TrainingSessionOut)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    return _session_out(await _load(db, session_id))


@router.patch("/sessions/{session_id}", response_model=TrainingSessionOut)
async def update_session(session_id: int, payload: TrainingSessionUpdate, db: AsyncSession = Depends(get_db)):
    s = await _load(db, session_id)
    data = payload.model_dump(exclude_unset=True, exclude={"sets"})
    await _validate_session(db, {**data, "habit_id": s.habit_id}, s.kind)
    for k, v in data.items():
        setattr(s, k, v)

    touched: set[int] = set()
    if payload.sets is not None:
        touched = await _replace_sets(db, s, payload.sets)

    # Editar series puede completar una meta igual que crearlas. No se vuelve a
    # marcar el rito ni se repaga el día: los dos ya se sellaron al asentar, y
    # editar dos veces no es entrenar dos veces.
    await _seal_reached_goals(db, touched)
    await db.commit()
    return _session_out(await _load(db, session_id))


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)):
    """Borra la sesión y sus series. NO retira la marca del rito ni devuelve XP.

    Es la prohibición del farmeo, escrita: si borrar desmarcara, el ciclo
    asentar-borrar-asentar cobraría el rito una y otra vez. La marca vive en
    `habit_logs` y el pago en `xp_log`, y ninguno de los dos es propiedad de esta
    fila. Desmarcar un rito se hace desde Hábitos, a mano y a la vista.
    """
    s = await db.get(TrainingSession, session_id)
    if not s:
        raise HTTPException(404, "Sesión no encontrada")
    await db.delete(s)
    await db.commit()


@router.get("/summary", response_model=TrainingSummaryOut)
async def summary(db: AsyncSession = Depends(get_db)):
    today = _today()
    monday = _week_monday(today)

    todays = (await db.execute(
        select(TrainingSession)
        .options(selectinload(TrainingSession.sets))
        .where(TrainingSession.occurred_on == today)
        .order_by(TrainingSession.id.desc()).limit(1)
    )).scalar_one_or_none()

    week = (await db.execute(
        select(TrainingSession).where(
            TrainingSession.occurred_on >= monday,
            TrainingSession.occurred_on <= monday + timedelta(days=6),
        )
    )).scalars().all()
    week_ids = [w.id for w in week]
    volume = 0
    if week_ids:
        volume = (await db.execute(
            select(func.coalesce(func.sum(TrainingSet.reps * TrainingSet.weight_g), 0))
            .where(TrainingSet.session_id.in_(week_ids))
        )).scalar_one()

    # El rito a sugerir por modalidad sale de la última sesión de esa modalidad
    # que eligió uno. Deducirlo evita una columna nueva en `habits` y, con ella,
    # una segunda fuente de verdad de la misma relación.
    suggested: dict[str, int] = {}
    for k in ("strength", "hema", "cardio"):
        hid = (await db.execute(
            select(TrainingSession.habit_id)
            .where(TrainingSession.kind == k, TrainingSession.habit_id.is_not(None))
            .order_by(TrainingSession.occurred_on.desc(), TrainingSession.id.desc())
            .limit(1)
        )).scalar_one_or_none()
        if hid is not None:
            suggested[k] = hid

    user = await get_user(db)
    return TrainingSummaryOut(
        today=_session_out(todays) if todays else None,
        sessions_this_week=len(week),
        volume_this_week_g=volume,
        days_this_week=len({w.occurred_on for w in week}),
        suggested_habit=suggested,
        weight_unit=user.weight_unit or "kg",
    )


# --------------------------------------------------------------------------
# Metas de fuerza
# --------------------------------------------------------------------------

@router.get("/goals", response_model=list[StrengthGoalOut])
async def list_goals(include_archived: bool = False, db: AsyncSession = Depends(get_db)):
    sel = select(StrengthGoal)
    if not include_archived:
        sel = sel.where(StrengthGoal.archived == False)  # noqa: E712
    goals = (await db.execute(sel.order_by(StrengthGoal.id))).scalars().all()
    prog = await _goal_progress(db, goals)
    out = []
    for g in goals:
        item = StrengthGoalOut.model_validate(g)
        item.best_weight_g, item.qualifying_sets = prog.get(g.id, (0, 0))
        out.append(item)
    return out


@router.post("/goals", response_model=StrengthGoalOut, status_code=201)
async def create_goal(payload: StrengthGoalCreate, db: AsyncSession = Depends(get_db)):
    if not await db.get(Exercise, payload.exercise_id):
        raise HTTPException(404, "Ejercicio no encontrado")
    g = StrengthGoal(**payload.model_dump())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    out = StrengthGoalOut.model_validate(g)
    out.best_weight_g, out.qualifying_sets = (await _goal_progress(db, [g]))[g.id]
    return out


@router.patch("/goals/{goal_id}", response_model=StrengthGoalOut)
async def update_goal(goal_id: int, payload: StrengthGoalUpdate, db: AsyncSession = Depends(get_db)):
    """Editar una meta NUNCA la sella, ni siquiera si la cifra nueva ya está
    superada. Sellar sólo ocurre al escribir series; ver `_seal_reached_goals`."""
    g = await db.get(StrengthGoal, goal_id)
    if not g:
        raise HTTPException(404, "Meta no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    await db.commit()
    await db.refresh(g)
    out = StrengthGoalOut.model_validate(g)
    out.best_weight_g, out.qualifying_sets = (await _goal_progress(db, [g]))[g.id]
    return out


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(goal_id: int, db: AsyncSession = Depends(get_db)):
    """Una meta ya sellada se archiva en vez de borrarse: es un hecho del
    historial, y su XP está pagado. Una sin sellar sí se puede tirar."""
    g = await db.get(StrengthGoal, goal_id)
    if not g:
        raise HTTPException(404, "Meta no encontrada")
    if g.achieved_at is not None:
        g.archived = True
    else:
        await db.delete(g)
    await db.commit()


# --------------------------------------------------------------------------
# Métricas corporales
# --------------------------------------------------------------------------

@router.get("/body-metrics", response_model=list[BodyMetricOut])
async def list_body_metrics(
    kind: str | None = None,
    limit: int = Query(default=180, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    sel = select(BodyMetric)
    if kind:
        sel = sel.where(BodyMetric.kind == kind)
    rows = (await db.execute(
        sel.order_by(BodyMetric.measured_on.desc()).limit(limit)
    )).scalars().all()
    out = []
    for r in rows:
        item = BodyMetricOut.model_validate(r)
        item.unit = BODY_METRIC_UNITS.get(r.kind, "kg")
        out.append(item)
    return out


@router.post("/body-metrics", response_model=BodyMetricOut, status_code=201)
async def create_body_metric(payload: BodyMetricCreate, db: AsyncSession = Depends(get_db)):
    """Anotar una medida no paga XP, no hace racha y no desbloquea nada.

    Es la regla más importante del módulo y la más fácil de romper por descuido:
    en cuanto el peso corporal da recompensa, deja de ser un dato de tendencia y
    pasa a ser un marcador que se persigue. Aquí no se llama a `award_xp` ni a
    `check_achievements`, y no es un olvido.

    Medir dos veces el mismo día es corregirse, no acumular: la segunda pisa a la
    primera en vez de meter dos puntos en la tendencia.
    """
    existing = (await db.execute(
        select(BodyMetric).where(
            BodyMetric.kind == payload.kind,
            BodyMetric.measured_on == payload.measured_on,
        )
    )).scalar_one_or_none()
    if existing:
        existing.value_milli = payload.value_milli
        existing.note = payload.note
        m = existing
    else:
        m = BodyMetric(**payload.model_dump())
        db.add(m)
    await db.commit()
    await db.refresh(m)
    out = BodyMetricOut.model_validate(m)
    out.unit = BODY_METRIC_UNITS.get(m.kind, "kg")
    return out


@router.patch("/body-metrics/{metric_id}", response_model=BodyMetricOut)
async def update_body_metric(metric_id: int, payload: BodyMetricUpdate, db: AsyncSession = Depends(get_db)):
    m = await db.get(BodyMetric, metric_id)
    if not m:
        raise HTTPException(404, "Medida no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    out = BodyMetricOut.model_validate(m)
    out.unit = BODY_METRIC_UNITS.get(m.kind, "kg")
    return out


@router.delete("/body-metrics/{metric_id}", status_code=204)
async def delete_body_metric(metric_id: int, db: AsyncSession = Depends(get_db)):
    m = await db.get(BodyMetric, metric_id)
    if not m:
        raise HTTPException(404, "Medida no encontrada")
    await db.delete(m)
    await db.commit()


@router.get("/body-metrics/series", response_model=BodyMetricSeriesOut)
async def body_metric_series(
    kind: str = Query(default="weight"),
    limit: int = Query(default=90, ge=2, le=730),
    db: AsyncSession = Depends(get_db),
):
    """La serie con su media móvil de cuatro medidas.

    La tendencia se calcula y no se guarda, como todo lo demás. Existe porque la
    pregunta real no es «¿cuánto peso hoy?» sino «¿esto baja o es ruido?», y una
    sola medida no la contesta: el peso corporal oscila un kilo entre la mañana y
    la noche por razones que no tienen nada que ver con entrenar.
    """
    rows = (await db.execute(
        select(BodyMetric)
        .where(BodyMetric.kind == kind)
        .order_by(BodyMetric.measured_on.desc()).limit(limit)
    )).scalars().all()
    rows = sorted(rows, key=lambda r: r.measured_on)
    points = []
    for i, r in enumerate(rows):
        window = rows[max(0, i - 3): i + 1]
        trend = round(sum(w.value_milli for w in window) / len(window))
        points.append(BodyMetricPointOut(
            measured_on=r.measured_on, value_milli=r.value_milli, trend_milli=trend
        ))
    return BodyMetricSeriesOut(
        kind=kind, unit=BODY_METRIC_UNITS.get(kind, "kg"), points=points
    )


# --------------------------------------------------------------------------
# Progresión y volumen
# --------------------------------------------------------------------------

@router.get("/exercises/{exercise_id}/progress", response_model=ExerciseProgressOut)
async def exercise_progress(
    exercise_id: int,
    limit: int = Query(default=40, ge=2, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Peso máximo y 1RM estimado por sesión, con los récords marcados.

    `is_record` marca la sesión en que el peso máximo superó todo lo anterior. Se
    devuelve para DIBUJARLO, no para premiarlo: en la curva es un rombo de tinta.
    Un récord no declarado de antemano es circunstancia, y el oro de este módulo
    está reservado a las metas que el usuario fijó antes de cumplirlas.
    """
    if not await db.get(Exercise, exercise_id):
        raise HTTPException(404, "Ejercicio no encontrado")
    rows = (await db.execute(
        select(TrainingSession.occurred_on, TrainingSet.reps, TrainingSet.weight_g)
        .join(TrainingSet, TrainingSet.session_id == TrainingSession.id)
        .where(TrainingSet.exercise_id == exercise_id)
        .order_by(TrainingSession.occurred_on)
    )).all()

    by_day: dict[date, list[tuple[int, int]]] = defaultdict(list)
    for day, reps, weight in rows:
        by_day[day].append((reps, weight))

    points, record = [], 0
    for day in sorted(by_day)[-limit:]:
        sets = by_day[day]
        top_weight = max(w for _, w in sets)
        # entre las series del peso máximo, la de más repeticiones: es la que
        # mejor estima la máxima real de ese día
        reps_at_top = max(r for r, w in sets if w == top_weight)
        best_1rm, best_reps = 0, 1
        for reps, weight in sets:
            est = estimated_1rm_g(weight, reps)
            if est > best_1rm:
                best_1rm, best_reps = est, reps
        is_record = top_weight > record
        record = max(record, top_weight)
        points.append(ExercisePointOut(
            occurred_on=day, top_weight_g=top_weight, est_1rm_g=best_1rm,
            reps_at_top=reps_at_top, low_confidence=best_reps > EPLEY_CONFIDENT_REPS,
            is_record=is_record,
        ))
    return ExerciseProgressOut(exercise_id=exercise_id, points=points)


@router.get("/stats", response_model=TrainingStatsOut)
async def stats(
    weeks: int = Query(default=10, ge=1, le=52),
    db: AsyncSession = Depends(get_db),
):
    """Volumen semanal por grupo muscular, y los totales de la cabecera.

    El volumen es kg×reps y sólo lo produce la fuerza: HEMA y cardio no tienen
    series, así que no suman aquí. Por eso el rótulo de la gráfica dice «volumen
    de fuerza» y no «volumen de entrenamiento» — lo segundo dejaría fuera dos
    tercios del módulo sin avisar.
    """
    monday = _week_monday(_today())
    start = monday - timedelta(weeks=weeks - 1)

    rows = (await db.execute(
        select(TrainingSession.occurred_on, Exercise.muscle_group_id,
               func.sum(TrainingSet.reps * TrainingSet.weight_g))
        .join(TrainingSet, TrainingSet.session_id == TrainingSession.id)
        .join(Exercise, Exercise.id == TrainingSet.exercise_id)
        .where(TrainingSession.occurred_on >= start)
        .group_by(TrainingSession.occurred_on, Exercise.muscle_group_id)
    )).all()

    buckets: dict[date, dict[int | None, int]] = {
        start + timedelta(weeks=i): defaultdict(int) for i in range(weeks)
    }
    for day, group_id, volume in rows:
        wk = _week_monday(day)
        if wk in buckets:
            buckets[wk][group_id] += volume or 0

    volume_weeks = [
        VolumeWeekOut(
            week_start=wk,
            groups=[VolumeGroupOut(muscle_group_id=g, volume_g=v)
                    for g, v in sorted(groups.items(), key=lambda kv: (kv[0] is None, kv[0]))],
        )
        for wk, groups in sorted(buckets.items())
    ]

    by_kind = dict((await db.execute(
        select(TrainingSession.kind, func.count(TrainingSession.id))
        .group_by(TrainingSession.kind)
    )).all())
    total_volume = (await db.execute(
        select(func.coalesce(func.sum(TrainingSet.reps * TrainingSet.weight_g), 0))
    )).scalar_one()

    return TrainingStatsOut(
        volume_weeks=volume_weeks,
        sessions_by_kind={k: v for k, v in by_kind.items()},
        total_sessions=sum(by_kind.values()),
        total_volume_g=total_volume,
    )


async def seed_muscle_groups(db: AsyncSession):
    """Siembra el catálogo en el primer arranque, idempotente por nombre."""
    known = set((await db.execute(select(MuscleGroup.name))).scalars().all())
    for name, color, icon in MUSCLE_GROUP_DEFAULTS:
        if name not in known:
            db.add(MuscleGroup(name=name, color=color, icon=icon))
