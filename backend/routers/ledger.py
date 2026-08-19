"""El erario: arcas, partidas, asientos, asignaciones y cierre del mes.

La capa de juego entró la última a propósito: una capa de recompensa sobre una
herramienta que todavía no sirve es el patrón que fracasa. Y entró con una regla
que ordena todo lo demás: **el XP premia el acto de asentar y revisar, jamás el
monto.** Premiar la cifra produce conducta transaccional de corto plazo; premiar
el registro y la revisión es lo que sostiene la práctica.

Por lo mismo, aquí no hay penalizaciones: gastarse la asignación no resta XP ni
cuesta una vida. Se penaliza no anotar —no cobrando—, nunca gastar de más. Una
racha rota por dinero produce ansiedad justo en quien tiene menos margen.
"""
from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    Account, CategoryBudget, LedgerCategory, LedgerEntry, LedgerMonthReview,
    SavingsGoal, XPLog,
)
from schemas import (
    AccountCreate, AccountUpdate, AccountOut,
    LedgerCategoryCreate, LedgerCategoryUpdate, LedgerCategoryOut,
    LedgerEntryCreate, LedgerEntryUpdate, LedgerEntryOut, LedgerEntryCreated,
    LedgerSummaryOut, CategoryTotalOut,
    LedgerMonthReviewCreate, LedgerMonthReviewOut,
    SavingsGoalCreate, SavingsGoalUpdate, SavingsGoalOut,
    BudgetMonthIn, BudgetMonthOut, BudgetLineOut,
    LedgerStatsOut, DailySpendOut, MonthTotalOut, CategoryMonthOut,
    XPEventResponse, AchievementOut,
)
from services import like_escape, get_user, award_xp
from constants import DEFAULT_CURRENCY, BASE_XP
from achievements import check_achievements
from tz import now as _now, today as _today

router = APIRouter(prefix="/ledger", tags=["ledger"])


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def month_bounds(month: str) -> tuple[date, date]:
    """"2026-08" -> (2026-08-01, 2026-08-31). Lanza 400 si no parsea."""
    try:
        year, mon = (int(p) for p in month.split("-"))
        first = date(year, mon, 1)
    except (ValueError, TypeError):
        raise HTTPException(400, "El mes debe tener el formato YYYY-MM")
    return first, date(year, mon, monthrange(year, mon)[1])


def current_month() -> str:
    t = _today()
    return f"{t.year:04d}-{t.month:02d}"


def days_left(first: date, last: date) -> int:
    """Días del mes que quedan, hoy incluido.

    Un mes ya cerrado devuelve 0 y uno futuro devuelve el mes entero. Importa
    porque el margen diario divide por esto: sin el caso del mes pasado, repartir
    el disponible entre cero días daría infinito el día 1 de cada mes.
    """
    t = _today()
    if t > last:
        return 0
    if t < first:
        return (last - first).days + 1
    return (last - t).days + 1


async def ledger_currency(db: AsyncSession) -> str:
    """La moneda del erario es la de la primera arca. Sin arcas, la de la casa."""
    cur = (await db.execute(select(Account.currency).limit(1))).scalar_one_or_none()
    return cur or DEFAULT_CURRENCY


async def _balances(db: AsyncSession) -> dict[int, int]:
    """Saldo de cada arca, deducido de los asientos.

    Nunca se persiste: un saldo guardado y una lista de movimientos son dos
    fuentes de verdad del mismo dato y acaban discrepando. Cuatro agregados en
    vez de uno por arca, para no hacer N+1 con la lista.
    """
    rows = (await db.execute(
        select(Account.id, Account.opening_minor)
    )).all()
    bal = {aid: opening for aid, opening in rows}

    # lo que entra y sale del arca de origen
    moved = (await db.execute(
        select(LedgerEntry.account_id, LedgerEntry.kind,
               func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .group_by(LedgerEntry.account_id, LedgerEntry.kind)
    )).all()
    for aid, kind, total in moved:
        if aid not in bal:
            continue
        # un traspaso SALE del arca de origen, igual que un gasto
        bal[aid] += total if kind == "income" else -total

    # y lo que entra por el otro lado de un traspaso
    incoming = (await db.execute(
        select(LedgerEntry.counter_account_id,
               func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .where(LedgerEntry.kind == "transfer", LedgerEntry.counter_account_id.is_not(None))
        .group_by(LedgerEntry.counter_account_id)
    )).all()
    for aid, total in incoming:
        if aid in bal:
            bal[aid] += total

    return bal


async def effective_budgets(db: AsyncSession, month: str) -> dict[int, tuple[int, str]]:
    """Cerco vigente de cada partida en `month`: {category_id: (monto, mes_origen)}.

    Se arrastra desde la fila explícita más reciente cuyo mes sea <= el pedido.
    Fijar 500.000 en agosto vale también para septiembre sin repetirlo, y crear
    la fila de noviembre deja agosto exactamente como estaba — que es justo lo
    que la columna única no podía hacer.

    Un cero es una fila como cualquier otra: corta el arrastre y significa «este
    mes, sin cerco». Las partidas sin cerco vigente no salen en el diccionario.
    """
    rows = (await db.execute(
        select(CategoryBudget.category_id, CategoryBudget.month_key, CategoryBudget.amount_minor)
        .where(CategoryBudget.month_key <= month)
        .order_by(CategoryBudget.category_id, CategoryBudget.month_key)
    )).all()
    # ordenadas por mes ascendente, la última que se ve de cada partida es la vigente
    latest: dict[int, tuple[int, str]] = {}
    for cid, mkey, amount in rows:
        latest[cid] = (amount, mkey)
    return {cid: v for cid, v in latest.items() if v[0] > 0}


def _drop_transfer_fields(data: dict, current: LedgerEntry) -> dict:
    """Un asiento que deja de ser traspaso suelta lo que sólo un traspaso lleva.

    Va ANTES de validar, y ahí está el arreglo. La limpieza vivía al final de
    `update_entry`, pero `_validate_entry` ya había heredado del asiento actual
    el `goal_id` que el PATCH no manda y cortaba con «Sólo un traspaso puede
    aportar a una reliquia»: un aporte mal anotado no se podía rectificar desde
    ningún sitio, porque el código que lo arreglaba estaba detrás del que lo
    rechazaba.

    Sólo se aplica al editar. En un alta los campos vienen explícitos del
    cliente, y una contradicción declarada merece el 400 en vez del silencio.
    """
    if data.get("kind", current.kind) != "transfer":
        data["counter_account_id"] = None
        data["goal_id"] = None
    return data


async def _validate_entry(db: AsyncSession, data: dict, current: LedgerEntry | None = None) -> None:
    """Reglas que el esquema no puede comprobar solo, porque miran otras filas."""
    kind = data.get("kind", current.kind if current else "expense")
    account_id = data.get("account_id", current.account_id if current else None)
    counter_id = data.get("counter_account_id", current.counter_account_id if current else None)
    category_id = data.get("category_id", current.category_id if current else None)
    goal_id = data.get("goal_id", current.goal_id if current else None)

    if not await db.get(Account, account_id):
        raise HTTPException(404, "Arca no encontrada")

    if goal_id is not None:
        # Ahorrar es mover dinero de un arca a otra, no gastarlo: un gasto
        # marcado como aporte inflaría la reliquia sin que el dinero exista.
        if kind != "transfer":
            raise HTTPException(400, "Sólo un traspaso puede aportar a una reliquia")
        goal = await db.get(SavingsGoal, goal_id)
        if not goal:
            raise HTTPException(404, "Reliquia no encontrada")
        if goal.account_id not in (account_id, counter_id):
            raise HTTPException(
                400, f"El aporte tiene que entrar o salir del arca de «{goal.name}»"
            )

    if kind == "transfer":
        # Un traspaso mueve dinero entre arcas propias: no es gasto ni ingreso, y
        # por eso no se clasifica. Si contara como gasto, el resumen del mes
        # mentiría cada vez que se pasa dinero al ahorro.
        if counter_id is None:
            raise HTTPException(400, "Un traspaso necesita un arca de destino")
        if counter_id == account_id:
            raise HTTPException(400, "El traspaso no puede ir al arca de origen")
        if not await db.get(Account, counter_id):
            raise HTTPException(404, "Arca de destino no encontrada")
        if category_id is not None:
            raise HTTPException(400, "Un traspaso no lleva partida")
        return

    if counter_id is not None:
        raise HTTPException(400, "Sólo un traspaso lleva arca de destino")
    if category_id is not None:
        cat = await db.get(LedgerCategory, category_id)
        if not cat:
            raise HTTPException(404, "Partida no encontrada")
        if cat.kind != kind:
            raise HTTPException(400, f"La partida «{cat.name}» no es de {kind}")


# --------------------------------------------------------------------------
# Arcas
# --------------------------------------------------------------------------

@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(include_archived: bool = False, db: AsyncSession = Depends(get_db)):
    q = select(Account)
    if not include_archived:
        q = q.where(Account.archived == False)  # noqa: E712
    accounts = (await db.execute(q.order_by(Account.id))).scalars().all()
    bal = await _balances(db)
    out = []
    for a in accounts:
        item = AccountOut.model_validate(a)
        item.balance_minor = bal.get(a.id, a.opening_minor)
        out.append(item)
    return out


@router.post("/accounts", response_model=AccountOut, status_code=201)
async def create_account(payload: AccountCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Account.currency).limit(1))).scalar_one_or_none()
    if existing and existing != payload.currency:
        # Sumar dos monedas sin tasas da un total que parece bueno y no lo es.
        # Mejor negarse aquí que servir un saldo inventado en la rúbrica.
        raise HTTPException(
            400, f"El erario ya lleva sus cuentas en {existing}; no se pueden mezclar monedas"
        )
    a = Account(**payload.model_dump())
    db.add(a)
    await db.commit()
    await db.refresh(a)
    out = AccountOut.model_validate(a)
    out.balance_minor = a.opening_minor
    return out


@router.patch("/accounts/{account_id}", response_model=AccountOut)
async def update_account(account_id: int, payload: AccountUpdate, db: AsyncSession = Depends(get_db)):
    a = await db.get(Account, account_id)
    if not a:
        raise HTTPException(404, "Arca no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    await db.commit()
    await db.refresh(a)
    out = AccountOut.model_validate(a)
    out.balance_minor = (await _balances(db)).get(a.id, a.opening_minor)
    return out


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Archiva si tiene historia, borra si nunca se usó.

    Borrar un arca con asientos dejaría filas huérfanas y un libro que no cuadra;
    archivarla la saca de la vista sin romper lo ya anotado.
    """
    a = await db.get(Account, account_id)
    if not a:
        raise HTTPException(404, "Arca no encontrada")
    used = (await db.execute(
        select(func.count(LedgerEntry.id)).where(
            or_(LedgerEntry.account_id == account_id,
                LedgerEntry.counter_account_id == account_id)
        )
    )).scalar_one()
    if used:
        a.archived = True
    else:
        await db.delete(a)
    await db.commit()


# --------------------------------------------------------------------------
# Partidas
# --------------------------------------------------------------------------

@router.get("/categories", response_model=list[LedgerCategoryOut])
async def list_categories(include_archived: bool = False, db: AsyncSession = Depends(get_db)):
    q = select(LedgerCategory)
    if not include_archived:
        q = q.where(LedgerCategory.archived == False)  # noqa: E712
    cats = (await db.execute(q.order_by(LedgerCategory.kind, LedgerCategory.name))).scalars().all()
    counts = dict((await db.execute(
        select(LedgerEntry.category_id, func.count(LedgerEntry.id))
        .where(LedgerEntry.category_id.is_not(None))
        .group_by(LedgerEntry.category_id)
    )).all())
    out = []
    for c in cats:
        item = LedgerCategoryOut.model_validate(c)
        item.entry_count = counts.get(c.id, 0)
        out.append(item)
    return out


@router.post("/categories", response_model=LedgerCategoryOut, status_code=201)
async def create_category(payload: LedgerCategoryCreate, db: AsyncSession = Depends(get_db)):
    dup = (await db.execute(
        select(LedgerCategory).where(
            LedgerCategory.name == payload.name, LedgerCategory.kind == payload.kind
        )
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(400, "Ya existe una partida con ese nombre y tipo")
    c = LedgerCategory(**payload.model_dump())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return LedgerCategoryOut.model_validate(c)


@router.patch("/categories/{category_id}", response_model=LedgerCategoryOut)
async def update_category(category_id: int, payload: LedgerCategoryUpdate, db: AsyncSession = Depends(get_db)):
    c = await db.get(LedgerCategory, category_id)
    if not c:
        raise HTTPException(404, "Partida no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != c.name:
        dup = (await db.execute(
            select(LedgerCategory).where(
                LedgerCategory.name == data["name"], LedgerCategory.kind == c.kind,
                LedgerCategory.id != category_id,
            )
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(400, "Ya existe una partida con ese nombre y tipo")
    for k, v in data.items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return LedgerCategoryOut.model_validate(c)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Archiva si tiene asientos, borra si no. Los asientos que la usaban quedan
    sin clasificar, que es un estado válido — no se pierde el movimiento."""
    c = await db.get(LedgerCategory, category_id)
    if not c:
        raise HTTPException(404, "Partida no encontrada")
    used = (await db.execute(
        select(func.count(LedgerEntry.id)).where(LedgerEntry.category_id == category_id)
    )).scalar_one()
    if used:
        c.archived = True
    else:
        await db.delete(c)
    await db.commit()


# --------------------------------------------------------------------------
# Cercos
# --------------------------------------------------------------------------

@router.get("/budgets", response_model=BudgetMonthOut)
async def get_budgets(month: str | None = None, db: AsyncSession = Depends(get_db)):
    """Los cercos vigentes de un mes, con el mes del que vienen."""
    month = month or current_month()
    month_bounds(month)  # valida el formato
    budgets = await effective_budgets(db, month)
    cats = (await db.execute(
        select(LedgerCategory)
        .where(LedgerCategory.archived == False, LedgerCategory.kind == "expense")  # noqa: E712
        .order_by(LedgerCategory.name)
    )).scalars().all()
    lines = []
    for c in cats:
        amount, src = budgets.get(c.id, (0, None))
        lines.append(BudgetLineOut(
            category_id=c.id, name=c.name, color=c.color,
            amount_minor=amount, source_month=src,
        ))
    return BudgetMonthOut(
        month=month,
        currency=await ledger_currency(db),
        total_minor=sum(l.amount_minor for l in lines),
        lines=lines,
    )


@router.put("/budgets", response_model=BudgetMonthOut)
async def set_budgets(payload: BudgetMonthIn, db: AsyncSession = Depends(get_db)):
    """Fija los cercos DE ESE MES.

    Escribe filas del mes pedido y no toca ninguna anterior: cambiar el
    presupuesto en noviembre deja intacto lo que decía agosto. Los meses
    posteriores que no tengan fila propia heredan lo nuevo, que es lo que
    significa cambiar un presupuesto de aquí en adelante.
    """
    month = payload.month or current_month()
    month_bounds(month)
    for item in payload.items:
        if not await db.get(LedgerCategory, item.category_id):
            raise HTTPException(404, f"Partida {item.category_id} no encontrada")
        row = (await db.execute(
            select(CategoryBudget).where(
                CategoryBudget.category_id == item.category_id,
                CategoryBudget.month_key == month,
            )
        )).scalar_one_or_none()
        if row:
            row.amount_minor = item.amount_minor
        else:
            db.add(CategoryBudget(category_id=item.category_id, month_key=month,
                                  amount_minor=item.amount_minor))
    await db.commit()
    return await get_budgets(month, db)


# --------------------------------------------------------------------------
# Asientos
# --------------------------------------------------------------------------

@router.get("/entries", response_model=list[LedgerEntryOut])
async def list_entries(
    month: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    kind: str | None = None,
    unclassified: bool = False,
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LedgerEntry)
    if month:
        first, last = month_bounds(month)
        stmt = stmt.where(LedgerEntry.occurred_on >= first, LedgerEntry.occurred_on <= last)
    if account_id is not None:
        stmt = stmt.where(or_(LedgerEntry.account_id == account_id,
                              LedgerEntry.counter_account_id == account_id))
    if category_id is not None:
        stmt = stmt.where(LedgerEntry.category_id == category_id)
    if kind:
        stmt = stmt.where(LedgerEntry.kind == kind)
    if unclassified:
        # los traspasos no llevan partida por diseño: no son "sin clasificar"
        stmt = stmt.where(LedgerEntry.category_id.is_(None), LedgerEntry.kind != "transfer")
    if q:
        stmt = stmt.where(LedgerEntry.concept.ilike(f"%{like_escape(q)}%", escape="\\"))
    # el día manda; dentro del día, lo último anotado primero
    stmt = stmt.order_by(LedgerEntry.occurred_on.desc(), LedgerEntry.id.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


async def _award_ledger_day(db: AsyncSession) -> tuple[dict | None, object | None]:
    """5 XP por llevar el libro al día. Una sola vez por día natural.

    Cuatro de las cinco prohibiciones del módulo viven en estas líneas:

    - No es retroactivo. Se sella contra `earned_at`, el día del ACTO, y nunca
      contra `occurred_on`. Si no, una sentada de veinte minutos rellenando el
      mes entero cobraría un mes de constancia. Es la misma regla que «no
      registrar tiempo que nadie vio correr».
    - No se farmea borrando y reponiendo: la marca vive en `xp_log`, no en el
      número de asientos, y borrar un asiento no borra el día ya pagado.
    - No lleva multiplicador de racha. `streak_multiplier()` es de hábitos, y
      aplicarlo aquí haría que un mes de gimnasio inflara el XP de apuntar el
      almuerzo.
    - No hay penalización. No anotar simplemente no paga; nunca resta XP ni
      cuesta una vida.
    """
    today = _today()
    already = (await db.execute(
        select(func.count(XPLog.id)).where(
            XPLog.source == "ledger_day",
            func.date(XPLog.earned_at) == today.isoformat(),
        )
    )).scalar_one()
    if already:
        return None, None
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["ledger_day"], "ledger_day", None)
    ach = await check_achievements(db, user, "ledger_entry")
    return result, ach


def _merge_xp(events: list[tuple[dict | None, object | None]]) -> XPEventResponse | None:
    """Un mismo asiento puede pagar dos cosas: el día y una reliquia alcanzada.

    Devolver sólo una de las dos haría que la cabecera dijera «+5» mientras el
    usuario acaba de ganar 55, y la cifra de XP dejaría de cuadrar con el total.
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


@router.post("/entries", response_model=LedgerEntryCreated, status_code=201)
async def create_entry(payload: LedgerEntryCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    await _validate_entry(db, data)
    e = LedgerEntry(**data)
    db.add(e)
    await db.flush()
    events = [await _award_ledger_day(db), await _seal_reached_goal(db, e.goal_id)]
    await db.commit()
    await db.refresh(e)
    return LedgerEntryCreated(entry=LedgerEntryOut.model_validate(e), xp=_merge_xp(events))


@router.patch("/entries/{entry_id}", response_model=LedgerEntryOut)
async def update_entry(entry_id: int, payload: LedgerEntryUpdate, db: AsyncSession = Depends(get_db)):
    e = await db.get(LedgerEntry, entry_id)
    if not e:
        raise HTTPException(404, "Asiento no encontrado")
    # pasar a gasto/ingreso suelta el arca de destino y la reliquia, o queda un
    # traspaso a medias que descuadraría el saldo del arca que ya no participa
    data = _drop_transfer_fields(payload.model_dump(exclude_unset=True), current=e)
    await _validate_entry(db, data, current=e)
    for k, v in data.items():
        setattr(e, k, v)
    # editar un asiento puede completar una reliquia igual que crearlo
    await _seal_reached_goal(db, e.goal_id)
    await db.commit()
    await db.refresh(e)
    return e


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    e = await db.get(LedgerEntry, entry_id)
    if not e:
        raise HTTPException(404, "Asiento no encontrado")
    await db.delete(e)
    await db.commit()


# --------------------------------------------------------------------------
# Resumen del mes
# --------------------------------------------------------------------------

@router.get("/summary", response_model=LedgerSummaryOut)
async def month_summary(month: str | None = None, db: AsyncSession = Depends(get_db)):
    """Totales planos del mes. Los traspasos quedan fuera de ingresos y gastos:
    pasar dinero al ahorro no es gastarlo."""
    month = month or current_month()
    first, last = month_bounds(month)
    in_month = (LedgerEntry.occurred_on >= first, LedgerEntry.occurred_on <= last)

    totals = dict((await db.execute(
        select(LedgerEntry.kind, func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .where(*in_month).group_by(LedgerEntry.kind)
    )).all())
    income = totals.get("income", 0)
    expense = totals.get("expense", 0)

    entry_count = (await db.execute(
        select(func.count(LedgerEntry.id)).where(*in_month)
    )).scalar_one()
    unclassified = (await db.execute(
        select(func.count(LedgerEntry.id))
        .where(*in_month, LedgerEntry.category_id.is_(None), LedgerEntry.kind != "transfer")
    )).scalar_one()
    days = (await db.execute(
        select(func.count(func.distinct(LedgerEntry.occurred_on))).where(*in_month)
    )).scalar_one()

    # El cerco de ESTE mes, no el que esté puesto hoy: mirar agosto en noviembre
    # tiene que enseñar lo que agosto tenía.
    budgets = await effective_budgets(db, month)

    rows = (await db.execute(
        select(LedgerCategory.id, LedgerCategory.name, LedgerCategory.color, LedgerCategory.kind,
               func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .join(LedgerEntry, LedgerEntry.category_id == LedgerCategory.id)
        .where(*in_month)
        .group_by(LedgerCategory.id)
    )).all()
    by_category = [
        CategoryTotalOut(category_id=cid, name=name, color=color, kind=kind,
                         total_minor=total,
                         budget_minor=budgets.get(cid, (None,))[0])
        for cid, name, color, kind, total in rows
    ]

    # Una partida con cerco y sin gasto también tiene carril: el hueco vacío es
    # justo la información («todavía no has tocado esto»), y sin ella el carril
    # aparecería de golpe el día del primer gasto.
    seen = {c.category_id for c in by_category}
    catalog = {
        c.id: c for c in (await db.execute(
            select(LedgerCategory).where(LedgerCategory.archived == False,  # noqa: E712
                                         LedgerCategory.kind == "expense")
        )).scalars().all()
    }
    for cid, (amount, _src) in budgets.items():
        c = catalog.get(cid)
        if c is not None and cid not in seen:
            by_category.append(CategoryTotalOut(
                category_id=c.id, name=c.name, color=c.color, kind=c.kind,
                total_minor=0, budget_minor=amount,
            ))

    if unclassified:
        pending = (await db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
            .where(*in_month, LedgerEntry.category_id.is_(None), LedgerEntry.kind != "transfer")
        )).scalar_one()
        by_category.append(CategoryTotalOut(
            category_id=None, name="Sin partida", color="#9a90b5",
            kind="expense", total_minor=pending,
        ))

    by_category.sort(key=lambda c: c.total_minor, reverse=True)

    # sólo cuentan las partidas de gasto vivas: un cerco de una partida archivada
    # inflaría el asignado sin que nadie pueda gastarlo
    budgeted_ids = {cid for cid in budgets if cid in catalog}
    budget_total = sum(budgets[cid][0] for cid in budgeted_ids)
    budgeted_spent = sum(
        c.total_minor for c in by_category
        if c.kind == "expense" and c.category_id in budgeted_ids
    )

    return LedgerSummaryOut(
        month=month,
        currency=await ledger_currency(db),
        income_minor=income,
        expense_minor=expense,
        net_minor=income - expense,
        entry_count=entry_count,
        unclassified_count=unclassified,
        days_with_entries=days,
        budget_total_minor=budget_total,
        budgeted_spent_minor=budgeted_spent,
        unbudgeted_spent_minor=expense - budgeted_spent,
        available_minor=budget_total - budgeted_spent,
        days_left=days_left(first, last),
        by_category=by_category,
    )


# --------------------------------------------------------------------------
# Cierre del mes
# --------------------------------------------------------------------------

@router.get("/reviews", response_model=list[LedgerMonthReviewOut])
async def list_month_reviews(db: AsyncSession = Depends(get_db)):
    return (await db.execute(
        select(LedgerMonthReview).order_by(LedgerMonthReview.month_key.desc())
    )).scalars().all()


@router.get("/reviews/{month}", response_model=LedgerMonthReviewOut | None)
async def get_month_review(month: str, db: AsyncSession = Depends(get_db)):
    month_bounds(month)  # valida el formato
    return (await db.execute(
        select(LedgerMonthReview).where(LedgerMonthReview.month_key == month)
    )).scalar_one_or_none()


@router.post("/reviews", response_model=XPEventResponse)
async def close_month(payload: LedgerMonthReviewCreate, db: AsyncSession = Depends(get_db)):
    """Cierra un mes: guarda la reflexión, congela las cifras y paga una vez.

    Editar un cierre ya hecho actualiza el texto y NO vuelve a pagar. Es la
    quinta prohibición: si reabrir pagara, cerrar el mismo mes doce veces daría
    360 XP por un mes de vida.
    """
    month = payload.month_key or current_month()
    first, _ = month_bounds(month)
    if first > _today().replace(day=1):
        raise HTTPException(400, "No se puede cerrar un mes que todavía no empieza")

    existing = (await db.execute(
        select(LedgerMonthReview).where(LedgerMonthReview.month_key == month)
    )).scalar_one_or_none()
    if existing:
        existing.what_worked = payload.what_worked
        existing.what_leaked = payload.what_leaked
        existing.next_change = payload.next_change
        existing.rating = payload.rating
        await db.commit()
        return XPEventResponse(new_xp=(await get_user(db)).xp)

    snap = await month_summary(month, db)
    db.add(LedgerMonthReview(
        month_key=month,
        what_worked=payload.what_worked,
        what_leaked=payload.what_leaked,
        next_change=payload.next_change,
        rating=payload.rating,
        budget_total_minor=snap.budget_total_minor,
        spent_minor=snap.expense_minor,
        unclassified_count=snap.unclassified_count,
    ))
    await db.flush()
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["ledger_month_close"], "ledger_month_close", None)
    ach = await check_achievements(db, user, "ledger_month_close")
    await db.commit()
    return XPEventResponse(
        **result,
        achievement_unlocked=AchievementOut.model_validate(ach) if ach else None,
    )


# --------------------------------------------------------------------------
# Reliquias
# --------------------------------------------------------------------------

async def _goal_progress(db: AsyncSession, goals: list[SavingsGoal]) -> dict[int, int]:
    """Lo aportado a cada reliquia, deducido de los traspasos marcados.

    Un traspaso que ENTRA en su arca suma; uno que SALE resta, que es como se
    registra sacar dinero de la hucha. Nunca se persiste: así dos reliquias sobre
    la misma arca llevan cada una su cuenta en vez de mostrar las dos el saldo
    entero, y ninguna puede discrepar del libro.
    """
    if not goals:
        return {}
    acct = {g.id: g.account_id for g in goals}
    prog = {g.id: 0 for g in goals}
    rows = (await db.execute(
        select(LedgerEntry.goal_id, LedgerEntry.account_id,
               LedgerEntry.counter_account_id, LedgerEntry.amount_minor)
        .where(LedgerEntry.goal_id.is_not(None), LedgerEntry.kind == "transfer")
    )).all()
    for gid, src, dst, amount in rows:
        if gid not in prog:
            continue
        if dst == acct[gid]:
            prog[gid] += amount
        elif src == acct[gid]:
            prog[gid] -= amount
    return prog


async def _seal_reached_goal(db: AsyncSession, goal_id: int | None):
    """Sella una reliquia alcanzada y paga sus 50 XP, una sola vez.

    Tres cosas viven aquí:

    - El XP es PLANO. Proporcional al monto significaría que tener más dinero da
      más XP, y el nivel dejaría de medir constancia para medir renta.
    - `achieved_at` no se reabre. Borrar los aportes después baja el progreso
      pero no desellá la reliquia, así que el ciclo aportar-borrar-aportar no
      cobra dos veces.
    - Bajar la meta por debajo de lo ya ahorrado NO la marca sola: esto sólo se
      llama al mover dinero, nunca al editar la meta. Hace falta un aporte
      posterior, que es lo que de verdad significa haberla alcanzado.
    """
    if goal_id is None:
        return None, None
    goal = await db.get(SavingsGoal, goal_id)
    if goal is None or goal.achieved_at is not None:
        return None, None
    if (await _goal_progress(db, [goal]))[goal.id] < goal.target_minor:
        return None, None

    goal.achieved_at = _now()
    user = await get_user(db)
    result = await award_xp(db, user, BASE_XP["relic_achieved"], "relic", goal.id)
    ach = await check_achievements(db, user, "relic_achieved")
    return result, ach


@router.get("/goals", response_model=list[SavingsGoalOut])
async def list_goals(include_archived: bool = False, db: AsyncSession = Depends(get_db)):
    q = select(SavingsGoal)
    if not include_archived:
        q = q.where(SavingsGoal.archived == False)  # noqa: E712
    goals = (await db.execute(q.order_by(SavingsGoal.id))).scalars().all()
    prog = await _goal_progress(db, goals)
    out = []
    for g in goals:
        item = SavingsGoalOut.model_validate(g)
        item.saved_minor = prog.get(g.id, 0)
        out.append(item)
    return out


@router.post("/goals", response_model=SavingsGoalOut, status_code=201)
async def create_goal(payload: SavingsGoalCreate, db: AsyncSession = Depends(get_db)):
    if not await db.get(Account, payload.account_id):
        raise HTTPException(404, "Arca no encontrada")
    g = SavingsGoal(**payload.model_dump())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return SavingsGoalOut.model_validate(g)


@router.patch("/goals/{goal_id}", response_model=SavingsGoalOut)
async def update_goal(goal_id: int, payload: SavingsGoalUpdate, db: AsyncSession = Depends(get_db)):
    g = await db.get(SavingsGoal, goal_id)
    if not g:
        raise HTTPException(404, "Reliquia no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    # A propósito NO se comprueba aquí si la meta quedó alcanzada: bajar el
    # objetivo por debajo de lo ahorrado no es haber ahorrado, y si sellara,
    # editar la cifra sería la forma más barata de cobrar 50 XP.
    await db.commit()
    await db.refresh(g)
    out = SavingsGoalOut.model_validate(g)
    out.saved_minor = (await _goal_progress(db, [g]))[g.id]
    return out


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(goal_id: int, db: AsyncSession = Depends(get_db)):
    """Archiva si tiene aportes, borra si nunca se usó. Los aportes son traspasos
    de verdad: borrarlos movería dinero que sí se movió."""
    g = await db.get(SavingsGoal, goal_id)
    if not g:
        raise HTTPException(404, "Reliquia no encontrada")
    used = (await db.execute(
        select(func.count(LedgerEntry.id)).where(LedgerEntry.goal_id == goal_id)
    )).scalar_one()
    if used:
        g.archived = True
    else:
        await db.delete(g)
    await db.commit()


# --------------------------------------------------------------------------
# La mirada larga
# --------------------------------------------------------------------------

@router.get("/stats", response_model=LedgerStatsOut)
async def ledger_stats(months: int = Query(default=6, ge=1, le=24),
                       db: AsyncSession = Depends(get_db)):
    """Serie diaria de gasto para el mapa de calor y serie mensual por partida.

    Los traspasos quedan fuera de las dos: pasar dinero al ahorro no es gasto, y
    pintarlo como tal haría que ahorrar se viera igual de rojo que derrochar.
    """
    today = _today()
    first_month = date(today.year, today.month, 1)
    for _ in range(months - 1):
        first_month = date(first_month.year, first_month.month, 1) - timedelta(days=1)
        first_month = date(first_month.year, first_month.month, 1)

    daily_rows = (await db.execute(
        select(LedgerEntry.occurred_on, func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .where(LedgerEntry.kind == "expense", LedgerEntry.occurred_on >= first_month)
        .group_by(LedgerEntry.occurred_on)
        .order_by(LedgerEntry.occurred_on)
    )).all()

    month_rows = (await db.execute(
        select(func.strftime("%Y-%m", LedgerEntry.occurred_on), LedgerEntry.kind,
               func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .where(LedgerEntry.kind != "transfer", LedgerEntry.occurred_on >= first_month)
        .group_by(func.strftime("%Y-%m", LedgerEntry.occurred_on), LedgerEntry.kind)
    )).all()
    per_month: dict[str, dict[str, int]] = {}
    for month, kind, total in month_rows:
        per_month.setdefault(month, {})[kind] = total

    series_rows = (await db.execute(
        select(func.strftime("%Y-%m", LedgerEntry.occurred_on), LedgerCategory.id,
               LedgerCategory.name, LedgerCategory.color,
               func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .join(LedgerCategory, LedgerEntry.category_id == LedgerCategory.id)
        .where(LedgerEntry.kind == "expense", LedgerEntry.occurred_on >= first_month)
        .group_by(func.strftime("%Y-%m", LedgerEntry.occurred_on), LedgerCategory.id)
    )).all()

    return LedgerStatsOut(
        currency=await ledger_currency(db),
        daily=[DailySpendOut(date=d.isoformat(), expense_minor=t) for d, t in daily_rows],
        monthly=[
            MonthTotalOut(month=m, expense_minor=v.get("expense", 0),
                          income_minor=v.get("income", 0))
            for m, v in sorted(per_month.items())
        ],
        series=[
            CategoryMonthOut(month=m, category_id=cid, name=name, color=color, total_minor=t)
            for m, cid, name, color, t in series_rows
        ],
    )
