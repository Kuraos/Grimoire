import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconChevronLeft, IconChevronRight, IconPlus, IconSearch, IconPencil,
  IconTrash, IconArrowsExchange, IconAlertTriangle, IconAdjustments,
  IconLock, IconCheck,
} from "@tabler/icons-react";
import { BudgetRail } from "../components/ui/BudgetRail";
import { RelicRail } from "../components/ui/RelicRail";
import { SpendHeatmap } from "../components/charts/SpendHeatmap";
import { CategoryTrend } from "../components/charts/CategoryTrend";
import { Api } from "../api/endpoints";
import { Card } from "../components/ui/Card";
import { Modal, Field } from "../components/ui/Modal";
import { confirm } from "../confirm";
import {
  MONTHS_ES, toRoman, todayISO, formatMoney, parseMoney, entrySign, moneyDecimals,
} from "../utils";
import { useApp } from "../context";
import type {
  Account, CategoryTotal, LedgerCategory, LedgerEntry, LedgerSummary,
  LedgerMonthReview, XPEventResponse, SavingsGoal, LedgerStats, BudgetMonth,
} from "../types";

/** "2026-08" del día de hoy. */
function currentMonth(): string {
  return todayISO().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

type Filter = "all" | "expense" | "income" | "transfer" | "unclassified";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "expense", label: "Gastos" },
  { key: "income", label: "Ingresos" },
  { key: "transfer", label: "Traspasos" },
  { key: "unclassified", label: "Sin partida" },
];

export default function Erario() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LedgerEntry | "new" | null>(null);
  const [budgets, setBudgets] = useState(false);
  const [closing, setClosing] = useState(false);
  const [review, setReview] = useState<LedgerMonthReview | null>(null);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalForm, setGoalForm] = useState<"new" | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const { handleXP } = useApp();

  const currency = summary?.currency ?? accounts[0]?.currency ?? "COP";

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month });
    if (filter === "unclassified") params.set("unclassified", "true");
    else if (filter !== "all") params.set("kind", filter);
    if (search.trim()) params.set("q", search.trim());
    try {
      const [sum, ents, accs, cats, rev, gls, st] = await Promise.all([
        Api.ledgerSummary(month),
        Api.listEntries(`?${params}`),
        Api.listAccounts(),
        Api.listLedgerCategories(),
        Api.monthReview(month),
        Api.listGoals(),
        Api.ledgerStats(6),
      ]);
      setSummary(sum);
      setEntries(ents);
      setAccounts(accs);
      setCategories(cats);
      setReview(rev);
      setGoals(gls);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, [month, filter, search]);

  // la búsqueda se debounce; mes y filtro entran directos
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const removeEntry = async (e: LedgerEntry) => {
    const ok = await confirm({
      title: "Borrar asiento",
      message: `«${e.concept}» — ${formatMoney(e.amount_minor, currency)}. Esto no se puede deshacer.`,
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!ok) return;
    await Api.deleteEntry(e.id);
    load();
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex flex-wrap items-center gap-2 lg:col-span-3">
        <h1 className="gr-title-module">Erario</h1>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn" onClick={() => setMonth(shiftMonth(month, -1))} title="Mes anterior">
            <IconChevronLeft size={14} />
          </button>
          <span className="px-2 font-label text-xs tabular text-[var(--text-body)]">
            {monthLabel(month)}
          </span>
          <button className="btn" onClick={() => setMonth(shiftMonth(month, 1))} title="Mes siguiente">
            <IconChevronRight size={14} />
          </button>
          <button className="btn btn-primary ml-2" onClick={() => setEditing("new")}>
            <IconPlus size={13} /> Nuevo asiento
          </button>
        </div>
      </div>

      {/* La rúbrica de la vista. En esta fase son totales planos: «lo que queda»
          necesita las asignaciones, que llegan en la fase siguiente. */}
      <div className="lg:col-span-3">
        <Card rank="rubric" title={monthLabel(month)}>
          {/* Un mes vacío no se anuncia con cuatro ceros de 34px: leen como una
              vista rota, no como un mes sin empezar. */}
          {(summary?.entry_count ?? 0) === 0 ? (
            /* Un estado vacío que sólo describe el vacío es un callejón sin
               salida: la rúbrica es «lo que el día exige», y lo que exige aquí
               es empezar. Las dos acciones viven lejos —una arriba del todo,
               otra en la cabecera de una card—, así que se repiten donde de
               verdad se están leyendo. */
            <div>
              <p className="font-prose text-[var(--text-body)]">
                {month === currentMonth()
                  ? "Todavía no has asentado nada este mes."
                  : "Este mes quedó sin asentar."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={() => setEditing("new")}>
                  <IconPlus size={13} /> Anota el primero
                </button>
                {(summary?.budget_total_minor ?? 0) === 0 && (
                  <button className="btn" onClick={() => setBudgets(true)}>
                    <IconAdjustments size={12} /> Asignar el mes
                  </button>
                )}
              </div>
            </div>
          ) : summary!.budget_total_minor > 0 ? (
            /* Con asignaciones, la rúbrica responde la pregunta que se hace
               alguien al abrir esto: cuánto queda y para cuántos días.
               Sólo esas dos van en cifra. Con las cuatro al mismo tamaño se
               leían como una serie de iguales, y encima «gastado» ganaba la
               vista por tener más dígitos: el contexto tapando al dato. */
            <div>
              <div className="flex flex-wrap gap-x-12 gap-y-4">
                <Figure
                  label={summary!.available_minor < 0 ? "pasado del cerco" : "disponible"}
                  value={formatMoney(summary!.available_minor, currency)}
                  tone={summary!.available_minor < 0 ? "danger" : "ok"}
                />
                {summary!.days_left > 0 && summary!.available_minor > 0 && (
                  <Figure
                    label={`por día · quedan ${summary!.days_left}`}
                    value={formatMoney(
                      Math.floor(summary!.available_minor / summary!.days_left), currency,
                    )}
                    muted
                  />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>
                  Gastado{" "}
                  <span className="tabular text-[var(--text-body)]">
                    {formatMoney(summary!.budgeted_spent_minor, currency)}
                  </span>{" "}
                  de{" "}
                  <span className="tabular text-[var(--text-body)]">
                    {formatMoney(summary!.budget_total_minor, currency)}
                  </span>{" "}
                  asignados
                </span>
                {/* El gasto sin cerco no se resta del disponible —comería del
                    presupuesto ajeno— pero tampoco se calla: es por donde se
                    escapa el dinero sin que ninguna barra se entere. */}
                {summary!.unbudgeted_spent_minor > 0 && (
                  <span>
                    <span className="tabular text-[var(--text-body)]">
                      {formatMoney(summary!.unbudgeted_spent_minor, currency)}
                    </span>{" "}
                    fuera de asignación
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <Figure
                label="gastado"
                value={formatMoney(summary!.expense_minor, currency)}
              />
              <Figure
                label="ingresado"
                value={formatMoney(summary!.income_minor, currency)}
                muted
              />
              <Figure
                label={summary!.net_minor < 0 ? "en rojo" : "diferencia"}
                value={formatMoney(summary!.net_minor, currency)}
                tone={summary!.net_minor < 0 ? "danger" : "ok"}
              />
              {/* La cifra es lo anotado y el rótulo dice en cuántos días. Al
                  revés —cifra de días, rótulo «N asientos»— se leía como
                  «0 asientos · días con anotación», que no significa nada. */}
              <Figure
                label={
                  summary!.days_with_entries > 0
                    ? `asientos en ${summary!.days_with_entries} días`
                    : "asientos"
                }
                value={String(summary!.entry_count)}
                muted
              />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {(summary?.unclassified_count ?? 0) > 0 && (
              <button
                className="flex items-center gap-1.5 text-xs text-[var(--gr-amber)] hover:underline"
                onClick={() => setFilter("unclassified")}
              >
                <IconAlertTriangle size={13} />
                {summary!.unclassified_count} sin partida — clasifícalos antes de cerrar el mes
              </button>
            )}
            {/* El cierre es de lo poco dorado del módulo, y con razón: es una
                meta que el usuario se fijó y cumplió, no un saldo que tenía. */}
            {(summary?.entry_count ?? 0) > 0 && month <= currentMonth() && (
              <button
                className={`ml-auto flex items-center gap-1.5 text-xs hover:underline ${
                  review ? "text-[var(--gr-gilded)]" : "text-[var(--purple-main)]"
                }`}
                onClick={() => setClosing(true)}
              >
                {review ? <IconCheck size={13} /> : <IconLock size={13} />}
                {review ? "Mes cerrado — ver la revisión" : "Cerrar el mes"}
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* El libro de cuentas */}
      <div className="lg:col-span-2">
        <Card
          title="El libro de cuentas"
          right={
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <IconSearch
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                {/* `.input` es de 15px, pensada para formularios. En la cabecera
                    de una card, junto a un rótulo de 11px, pesaba más que el
                    título: baja al suelo de interfaz. */}
                <input
                  className="input w-52 pl-7 text-xs"
                  placeholder="Buscar concepto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  filter === f.key
                    ? "border-[var(--border-accent)] bg-[var(--gr-arcane-deep)] text-[var(--gr-arcane-bright)]"
                    : "border-[var(--gr-edge)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">Cargando…</p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-[var(--text-muted)]">
              {filter === "all" && !search
                ? "Ningún asiento este mes. El libro empieza vacío."
                : "Nada que coincida."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--gr-edge-strong)] font-label uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    <th className="w-12 pb-2 pr-3 font-semibold">Día</th>
                    {/* `w-full` en Concepto absorbe todo el sobrante y empuja
                        partida y monto a formar pareja a la derecha. Sin esto,
                        en pantalla ancha quedaban 500px de vacío entre el
                        nombre de la partida y su cifra, y el ojo tenía que
                        cruzar la fila entera para juntar las dos: justo lo que
                        el pautado de un libro de cuentas existe para evitar. */}
                    <th className="w-full pb-2 pr-3 font-semibold">Concepto</th>
                    <th className="pb-2 pr-3 font-semibold">Partida</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Monto</th>
                    <th className="w-14 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const cat = e.category_id != null ? categoryById[e.category_id] : null;
                    const day = Number(e.occurred_on.slice(8, 10));
                    return (
                      <tr
                        key={e.id}
                        className="group border-b border-[var(--gr-edge)] last:border-none"
                      >
                        {/* El día es rótulo, no dato que cambie de ancho: puede ir
                            en display. Todo lo demás va en Inter tabular. */}
                        <td className="py-2 pr-3 font-display text-[var(--text-muted)]">
                          {toRoman(day)}
                        </td>
                        <td className="py-2 pr-3 text-[var(--text-body)]">
                          <span className="flex items-center gap-1.5">
                            {e.kind === "transfer" && (
                              <IconArrowsExchange size={12} className="text-[var(--text-muted)]" />
                            )}
                            {e.concept}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {accountById[e.account_id]?.name}
                            {e.kind === "transfer" && e.counter_account_id != null &&
                              ` → ${accountById[e.counter_account_id]?.name ?? "—"}`}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {cat ? (
                            <span style={{ color: cat.color }}>{cat.name}</span>
                          ) : e.kind === "transfer" ? (
                            <span className="text-[var(--text-muted)]">Traspaso</span>
                          ) : (
                            <span className="rounded-full border border-[var(--gr-edge)] px-2 py-0.5 text-[var(--gr-amber)]">
                              sin partida
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right tabular font-semibold whitespace-nowrap ${
                            e.kind === "income"
                              ? "text-[var(--gr-verdigris)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {entrySign(e.kind)}
                          {formatMoney(e.amount_minor, currency)}
                        </td>
                        <td className="py-2 text-right">
                          <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              className="text-[var(--text-muted)] hover:text-[var(--purple-main)]"
                              title="Editar"
                              onClick={() => setEditing(e)}
                            >
                              <IconPencil size={13} />
                            </button>
                            <button
                              className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                              title="Borrar"
                              onClick={() => removeEntry(e)}
                            >
                              <IconTrash size={13} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Arcas">
          {accounts.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Ninguna arca todavía.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--text-body)]">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: a.color }}
                    />
                    {a.name}
                  </span>
                  <span
                    className={`tabular font-semibold ${
                      a.balance_minor < 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {formatMoney(a.balance_minor, a.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Totales por partida. NO son carriles de presupuesto: sin asignación
            no hay contra qué medir, y pintar una barra llena al 100% sugeriría
            un cerco que no existe. Los carriles llegan con las asignaciones. */}
        <Card
          title="Partidas del mes"
          right={
            <button
              className="btn"
              onClick={() => setBudgets(true)}
              title="Fijar el cerco mensual de cada partida"
            >
              <IconAdjustments size={12} /> Asignar
            </button>
          }
        >
          {!summary || summary.by_category.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Nada anotado este mes, y ninguna partida con asignación.
            </p>
          ) : (
            <CategoryTotals rows={summary.by_category} currency={currency} />
          )}
        </Card>

        <Card
          title="Reliquias"
          right={
            <button className="btn" onClick={() => setGoalForm("new")} title="Nueva meta de ahorro">
              <IconPlus size={12} /> Nueva
            </button>
          }
        >
          {goals.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Ninguna meta de ahorro. Una reliquia es lo único del erario que se gana.
            </p>
          ) : (
            <div className="space-y-3">
              {goals.map((g) => (
                <RelicRail
                  key={g.id}
                  goal={g}
                  currency={currency}
                  onContribute={setContributing}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* La mirada larga. Va al fondo a propósito: primero el mes, después la
          tendencia — se decide sobre lo que está pasando, no sobre el histórico. */}
      {stats && (stats.daily.length > 0 || stats.series.length > 0) && (
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Gasto día a día" rank="marginalia">
              <SpendHeatmap data={stats.daily} currency={stats.currency} />
              <p className="mt-2 text-2xs text-[var(--text-muted)]">
                La intensidad es relativa a tu día más caro del periodo, no a una
                cifra absoluta.
              </p>
            </Card>
            <Card title="Por partida, mes a mes" rank="marginalia">
              <CategoryTrend stats={stats} />
            </Card>
          </div>
        </div>
      )}

      {budgets && (
        <BudgetModal
          month={month}
          currency={currency}
          onClose={() => setBudgets(false)}
          onSaved={() => {
            setBudgets(false);
            load();
          }}
        />
      )}

      {goalForm && (
        <GoalModal
          accounts={accounts}
          currency={currency}
          onClose={() => setGoalForm(null)}
          onSaved={() => { setGoalForm(null); load(); }}
        />
      )}

      {contributing && (
        <ContributeModal
          goal={contributing}
          accounts={accounts}
          currency={currency}
          onClose={() => setContributing(null)}
          onXp={handleXP}
          onSaved={() => { setContributing(null); load(); }}
        />
      )}

      {closing && summary && (
        <CloseMonthModal
          month={month}
          summary={summary}
          review={review}
          currency={currency}
          onClose={() => setClosing(false)}
          onSaved={(res) => {
            setClosing(false);
            handleXP(res);
            load();
          }}
        />
      )}

      {editing && (
        <EntryModal
          entry={editing === "new" ? null : editing}
          accounts={accounts}
          categories={categories}
          currency={currency}
          onClose={() => setEditing(null)}
          onXp={handleXP}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Totales por partida: carriles para lo que tiene cerco, filas para lo demás.
 *
 *  En una sola lista ordenada por monto, el ingreso del mes encabeza el bloque y
 *  se lee como el mayor gasto: bajando la columna todos los números tienen la
 *  misma pinta. La separación es estructural a propósito y no de color —el
 *  verdigris ya significa «éxito» en la app, no «entró»— y las etiquetas sólo
 *  aparecen cuando hay más de un bloque, que es cuando hace falta desambiguar. */
function CategoryTotals({ rows, currency }: { rows: CategoryTotal[]; currency: string }) {
  const income = rows.filter((c) => c.kind === "income");
  const expense = rows.filter((c) => c.kind !== "income");
  const withBudget = expense.filter((c) => (c.budget_minor ?? 0) > 0);
  const without = expense.filter((c) => !((c.budget_minor ?? 0) > 0));
  // Ordenados por lo cerca que están de reventar, no por monto: el que va a
  // pasarse primero es el que hay que ver primero.
  withBudget.sort((a, b) => b.total_minor / b.budget_minor! - a.total_minor / a.budget_minor!);

  const blocks = [withBudget.length > 0, without.length > 0, income.length > 0]
    .filter(Boolean).length;
  const label = (t: string) =>
    blocks > 1 ? <div className="font-label text-2xs text-[var(--text-muted)]">{t}</div> : null;

  const plainRows = (items: CategoryTotal[]) =>
    items.map((c) => (
      <div
        key={c.category_id ?? "none"}
        className="flex items-baseline justify-between gap-3 text-xs"
      >
        <span className="flex items-center gap-1.5 text-[var(--text-body)]">
          <span className="inline-block h-2 w-2 rounded-xs" style={{ background: c.color }} />
          {c.name}
        </span>
        <span className="tabular text-[var(--text-primary)]">
          {formatMoney(c.total_minor, currency)}
        </span>
      </div>
    ));

  return (
    <div className="space-y-3">
      {withBudget.length > 0 && (
        <div className="space-y-3">
          {label("Con asignación")}
          {withBudget.map((c) => (
            <BudgetRail
              key={c.category_id}
              name={c.name}
              color={c.color}
              spent={c.total_minor}
              budget={c.budget_minor!}
              currency={currency}
            />
          ))}
        </div>
      )}
      {withBudget.length > 0 && without.length > 0 && (
        <div className="h-px bg-[var(--gr-edge)]" />
      )}
      {without.length > 0 && (
        <div className="space-y-2">
          {label("Sin asignación")}
          {plainRows(without)}
        </div>
      )}
      {income.length > 0 && (
        <>
          <div className="h-px bg-[var(--gr-edge)]" />
          <div className="space-y-2">
            {label("Entró")}
            {plainRows(income)}
          </div>
        </>
      )}
    </div>
  );
}

/** Crear una reliquia: hacia qué se ahorra, cuánto, y en qué arca vive. */
function GoalModal({ accounts, currency, onClose, onSaved }: {
  accounts: Account[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  // por defecto el arca de ahorro si la hay: es donde vive este dinero
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.kind === "savings")?.id ?? accounts[0]?.id ?? 0,
  );
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const minor = parseMoney(target, currency);
  const valid = name.trim() !== "" && minor !== null && minor > 0 && accountId > 0;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await Api.createGoal({
        name: name.trim(), target_minor: minor!, account_id: accountId,
        deadline: deadline || null,
      });
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nueva reliquia" onClose={onClose}>
      <Field label="Hacia qué ahorras">
        <input className="input" placeholder="Sable nuevo" value={name}
               onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label={`Cuánto (${currency})`}>
        <input className="input tabular" inputMode="decimal" placeholder="1.200.000"
               value={target} onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <Field label="En qué arca vive">
        <select className="input" value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Para cuándo (opcional)">
        <input className="input tabular" type="date" value={deadline}
               onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <p className="text-2xs text-[var(--text-muted)]">
        El progreso sale de los traspasos que marques como aporte, no del saldo del
        arca: así dos reliquias en la misma arca llevan cada una su cuenta.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid || saving} onClick={submit}>
          {saving ? "Guardando…" : "Crear"}
        </button>
      </div>
    </Modal>
  );
}

/** Aportar a una reliquia: un traspaso de verdad, marcado con la meta. */
function ContributeModal({ goal, accounts, currency, onClose, onSaved, onXp }: {
  goal: SavingsGoal;
  accounts: Account[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  onXp: (res: XPEventResponse) => void;
}) {
  const origins = accounts.filter((a) => a.id !== goal.account_id);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(origins[0]?.id ?? 0);
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const minor = parseMoney(amount, currency);
  const left = goal.target_minor - goal.saved_minor;
  const valid = minor !== null && minor > 0 && from > 0;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await Api.createEntry({
        account_id: from,
        counter_account_id: goal.account_id,
        kind: "transfer",
        amount_minor: Math.abs(minor!),
        occurred_on: date,
        concept: `Aporte · ${goal.name}`,
        goal_id: goal.id,
      });
      if (res.xp) onXp(res.xp);
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Aportar a ${goal.name}`} onClose={onClose}>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Faltan <span className="tabular text-[var(--text-primary)]">{formatMoney(left, currency)}</span>.
        El aporte se anota como traspaso a{" "}
        {accounts.find((a) => a.id === goal.account_id)?.name ?? "su arca"}.
      </p>
      <Field label={`Cuánto (${currency})`}>
        <input className="input tabular" inputMode="decimal" placeholder="100.000"
               value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <Field label="Desde qué arca">
        <select className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {origins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input className="input tabular" type="date" value={date}
               onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid || saving} onClick={submit}>
          {saving ? "Guardando…" : "Aportar"}
        </button>
      </div>
    </Modal>
  );
}

/** Cerrar el mes: mirar lo que pasó, escribir qué cambia, y cobrar una vez.
 *
 *  Es la pantalla que justifica el módulo. Toda la literatura apunta al mismo
 *  sitio: lo que cambia la conducta no es anotar, es la revisión. Por eso paga
 *  como la revisión semanal y no como un asiento. */
function CloseMonthModal({ month, summary, review, currency, onClose, onSaved }: {
  month: string;
  summary: LedgerSummary;
  review: LedgerMonthReview | null;
  currency: string;
  onClose: () => void;
  onSaved: (res: XPEventResponse) => void;
}) {
  const [worked, setWorked] = useState(review?.what_worked ?? "");
  const [leaked, setLeaked] = useState(review?.what_leaked ?? "");
  const [change, setChange] = useState(review?.next_change ?? "");
  const [rating, setRating] = useState<number | null>(review?.rating ?? null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await Api.closeMonth({
        month_key: month,
        what_worked: worked.trim() || null,
        what_leaked: leaked.trim() || null,
        next_change: change.trim() || null,
        rating,
      });
      onSaved(res);
    } catch {
      setSaving(false);
    }
  };

  const worst = summary.by_category
    .filter((c) => c.kind !== "income" && (c.budget_minor ?? 0) > 0)
    .sort((a, b) => b.total_minor / b.budget_minor! - a.total_minor / a.budget_minor!)[0];

  return (
    <Modal title={review ? `Revisión de ${monthLabel(month)}` : `Cerrar ${monthLabel(month)}`} onClose={onClose}>
      <div className="mb-4 space-y-1 border-b border-[var(--gr-edge)] pb-3 text-xs text-[var(--text-muted)]">
        <div className="flex justify-between">
          <span>Gastado</span>
          <span className="tabular text-[var(--text-primary)]">
            {formatMoney(summary.expense_minor, currency)}
            {summary.budget_total_minor > 0 &&
              ` de ${formatMoney(summary.budget_total_minor, currency)}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Ingresado</span>
          <span className="tabular text-[var(--text-primary)]">
            {formatMoney(summary.income_minor, currency)}
          </span>
        </div>
        {worst && (
          <div className="flex justify-between">
            <span>Partida más apretada</span>
            <span className="tabular text-[var(--text-primary)]">
              {worst.name} · {Math.round((worst.total_minor / worst.budget_minor!) * 100)}%
            </span>
          </div>
        )}
        {summary.unclassified_count > 0 && (
          <div className="flex justify-between text-[var(--gr-amber)]">
            <span>Sin clasificar</span>
            <span className="tabular">{summary.unclassified_count}</span>
          </div>
        )}
      </div>

      <Field label="Qué funcionó">
        <textarea className="input min-h-[56px] resize-y" value={worked}
                  onChange={(e) => setWorked(e.target.value)}
                  placeholder="El cerco de alimentación aguantó todo el mes." />
      </Field>
      <Field label="Por dónde se fue">
        <textarea className="input min-h-[56px] resize-y" value={leaked}
                  onChange={(e) => setLeaked(e.target.value)}
                  placeholder="Salidas de fin de semana, sin cerco." />
      </Field>
      <Field label="Qué cambia el mes que viene">
        <textarea className="input min-h-[56px] resize-y" value={change}
                  onChange={(e) => setChange(e.target.value)}
                  placeholder="Asignarle un cerco a Ocio." />
      </Field>
      <Field label="Cómo salió el mes">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(rating === n ? null : n)}
              className={`flex-1 rounded-md border py-1 text-xs transition-colors ${
                rating === n
                  ? "border-[var(--border-accent)] bg-[var(--gr-arcane-deep)] text-[var(--gr-arcane-bright)]"
                  : "border-[var(--gr-edge)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <div className="mt-4 flex items-center justify-end gap-2">
        {/* Se dice antes de pulsar, y se dice una sola vez: reabrir un cierre
            actualiza el texto y no vuelve a pagar. */}
        <span className="mr-auto text-2xs text-[var(--text-muted)]">
          {review ? "Ya cerrado — editar no vuelve a otorgar XP" : "Cerrar el mes otorga 30 XP, una vez"}
        </span>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? "Guardando…" : review ? "Guardar" : "Cerrar el mes"}
        </button>
      </div>
    </Modal>
  );
}

/** Fijar el cerco de cada partida EN EL MES QUE SE ESTÁ VIENDO.
 *
 *  El cerco es un dato de un mes, no una propiedad de la partida: por eso el
 *  modal lleva el mes en el título y guardar aquí no toca ningún mes anterior.
 *  Lo que se ve prerrellenado puede venir arrastrado de un mes previo, y el
 *  modal lo dice — si no, parecería que ya estaba fijado para éste. */
function BudgetModal({ month, currency, onClose, onSaved }: {
  month: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [budget, setBudget] = useState<BudgetMonth | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Api.ledgerBudgets(month).then((b) => {
      setBudget(b);
      setDraft(Object.fromEntries(b.lines.map((l) => [
        l.category_id,
        l.amount_minor > 0 ? formatMoney(l.amount_minor, currency, { symbol: false }) : "",
      ])));
    }).catch(() => {});
  }, [month, currency]);

  const lines = budget?.lines ?? [];
  const parsed = (id: number) => parseMoney(draft[id] ?? "", currency);
  const bad = lines.some((l) => (draft[l.category_id] ?? "").trim() !== "" && parsed(l.category_id) === null);
  const total = lines.reduce((sum, l) => sum + Math.max(0, parsed(l.category_id) ?? 0), 0);
  const heredados = lines.filter((l) => l.amount_minor > 0 && l.source_month !== month);

  const submit = async () => {
    setSaving(true);
    try {
      // Se manda TODO el mes: un campo vacío vale 0, que es «este mes, sin
      // cerco», y corta el arrastre a propósito.
      await Api.saveBudgets(month, lines.map((l) => ({
        category_id: l.category_id,
        amount_minor: Math.max(0, parsed(l.category_id) ?? 0),
      })));
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Asignaciones · ${monthLabel(month)}`} onClose={onClose}>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Lo que le asignas a cada partida <b className="text-[var(--text-body)]">este mes</b>.
        En blanco es sin cerco. Los meses siguientes heredan esto hasta que les
        pongas otra cosa; los anteriores no se tocan.
      </p>
      {!budget ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Cargando…</p>
      ) : (
        <>
          <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
            {lines.map((l) => (
              <label key={l.category_id} className="flex items-center gap-3">
                <span className="flex flex-1 items-center gap-1.5 text-xs text-[var(--text-body)]">
                  <span className="inline-block h-2 w-2 rounded-xs" style={{ background: l.color }} />
                  {l.name}
                  {l.amount_minor > 0 && l.source_month !== month && (
                    <span className="text-2xs text-[var(--text-muted)]">
                      · viene de {monthLabel(l.source_month!)}
                    </span>
                  )}
                </span>
                <input
                  className="input tabular w-32 text-right text-xs"
                  inputMode="decimal"
                  placeholder="sin cerco"
                  value={draft[l.category_id] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [l.category_id]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-[var(--gr-edge)] pt-3 text-xs">
            <span className="font-label text-2xs text-[var(--text-muted)]">Asignado en total</span>
            <span className="tabular font-semibold text-[var(--text-primary)]">
              {formatMoney(total, currency)}
            </span>
          </div>
          {heredados.length > 0 && (
            <p className="mt-2 text-2xs text-[var(--text-muted)]">
              {heredados.length === 1 ? "Una partida trae" : `${heredados.length} partidas traen`}{" "}
              su cerco de un mes anterior. Al guardar quedan fijadas para {monthLabel(month)}.
            </p>
          )}
        </>
      )}
      {bad && (
        <p className="mt-2 text-xs text-[var(--danger)]">Hay un monto que no se entiende.</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={bad || saving || !budget} onClick={submit}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

function Figure({ label, value, muted, tone }: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "ok" | "danger";
}) {
  const color =
    tone === "danger" ? "var(--danger)"
    : muted ? "var(--text-body)"
    : "var(--gr-ink-bright)";
  return (
    <div>
      <div className="gr-figure" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function EntryModal({ entry, accounts, categories, currency, onClose, onSaved, onXp }: {
  entry: LedgerEntry | null;
  accounts: Account[];
  categories: LedgerCategory[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  onXp: (res: XPEventResponse) => void;
}) {
  const [kind, setKind] = useState(entry?.kind ?? "expense");
  const [amount, setAmount] = useState(
    entry ? formatMoney(entry.amount_minor, currency, { symbol: false }) : "",
  );
  const [concept, setConcept] = useState(entry?.concept ?? "");
  const [date, setDate] = useState(entry?.occurred_on ?? todayISO());
  const [accountId, setAccountId] = useState(entry?.account_id ?? accounts[0]?.id ?? 0);
  const [counterId, setCounterId] = useState<number | "">(entry?.counter_account_id ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(entry?.category_id ?? "");
  const [saving, setSaving] = useState(false);

  const minor = parseMoney(amount, currency);
  // Una partida clasifica gasto o ingreso; un traspaso no es ninguno de los dos.
  const usable = categories.filter((c) => c.kind === kind);
  const valid =
    minor !== null && minor > 0 && concept.trim() !== "" && accountId > 0 &&
    (kind !== "transfer" || (counterId !== "" && counterId !== accountId));

  // cambiar de tipo invalida la clasificación anterior: una partida de gasto no
  // vale para un ingreso, y un traspaso no lleva ninguna
  const changeKind = (k: string) => {
    setKind(k);
    setCategoryId("");
    if (k !== "transfer") setCounterId("");
  };

  const submit = async () => {
    if (!valid || minor === null) return;
    setSaving(true);
    const payload = {
      account_id: accountId,
      category_id: kind === "transfer" || categoryId === "" ? null : Number(categoryId),
      kind,
      amount_minor: Math.abs(minor),
      occurred_on: date,
      concept: concept.trim(),
      counter_account_id: kind === "transfer" ? Number(counterId) : null,
    };
    try {
      if (entry) {
        await Api.updateEntry(entry.id, payload);
      } else {
        // `xp` sólo viene el primer asiento del día: el XP paga el acto de
        // llevar el libro, no cada renglón.
        const res = await Api.createEntry(payload);
        if (res.xp) onXp(res.xp);
      }
      onSaved();
    } catch {
      setSaving(false); // el cliente ya muestra el error del backend como toast
    }
  };

  return (
    <Modal title={entry ? "Editar asiento" : "Nuevo asiento"} onClose={onClose}>
      <div className="mb-3 flex gap-1">
        {[
          { k: "expense", label: "Gasto" },
          { k: "income", label: "Ingreso" },
          { k: "transfer", label: "Traspaso" },
        ].map(({ k, label }) => (
          <button
            key={k}
            onClick={() => changeKind(k)}
            className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
              kind === k
                ? "border-[var(--border-accent)] bg-[var(--gr-arcane-deep)] text-[var(--gr-arcane-bright)]"
                : "border-[var(--gr-edge)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Field label={`Monto (${currency})`}>
        <input
          className="input tabular"
          inputMode="decimal"
          placeholder={moneyDecimals(currency) === 0 ? "18.000" : "18,50"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        {amount.trim() !== "" && minor === null && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            No se entiende ese monto.
          </span>
        )}
      </Field>

      <Field label="Concepto">
        <input
          className="input"
          placeholder="Almuerzo universidad"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
        />
      </Field>

      <Field label="Fecha">
        <input
          className="input tabular"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <Field label={kind === "transfer" ? "Arca de origen" : "Arca"}>
        <select
          className="input"
          value={accountId}
          onChange={(e) => setAccountId(Number(e.target.value))}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>

      {kind === "transfer" ? (
        <Field label="Arca de destino">
          <select
            className="input"
            value={counterId}
            onChange={(e) => setCounterId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Elige un arca…</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Partida">
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {/* Sin partida es un estado válido: anotar rápido y clasificar
                después es lo que mantiene el libro al día. */}
            <option value="">Sin partida — clasificar después</option>
            {usable.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid || saving} onClick={submit}>
          {saving ? "Guardando…" : entry ? "Guardar" : "Asentar"}
        </button>
      </div>
    </Modal>
  );
}
