export function toRoman(n: number): string {
  if (n <= 0) return "N";
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let res = "";
  for (const [v, s] of map) {
    while (n >= v) {
      res += s;
      n -= v;
    }
  }
  return res;
}

export function romanDate(d: Date): string {
  return `${toRoman(d.getDate())} · ${toRoman(d.getMonth() + 1)} · ${toRoman(d.getFullYear())}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return isoDate(new Date());
}

/** Celdas de una rejilla mensual que empieza en lunes: `null` es hueco previo.
 *
 *  Vive aquí porque estaba copiada en el minicalendario y en la vista de mes, y
 *  el bug que pintaba un solo día —pedir el día 1 del mes siguiente en vez del
 *  0— era de estas cuatro líneas. Duplicado, arreglarlo en un sitio dejaba el
 *  otro roto. `month` es 0-indexado, como en `Date`. */
export function monthCells(year: number, month: number): (number | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  // día 0 del mes siguiente = el último de éste
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAYS_ES = ["L", "M", "X", "J", "V", "S", "D"];

export const WEEKDAY_NAMES_ES = [
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
];

/* ---- Cadencia de hábitos. Espejo de services.py: 0 = lunes, null = todos. ---- */

type Cadence = { frequency: string; days: string | null; target_per_week: number };

export function habitDays(days: string | null): number[] | null {
  if (!days) return null;
  const parsed = days.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return parsed.length ? parsed.sort((a, b) => a - b) : null;
}

/** ¿Toca hoy? Un hábito semanal toca cualquier día mientras le falten marcas. */
export function scheduledToday(habit: Cadence): boolean {
  if (habit.frequency === "weekly") return true;
  const days = habitDays(habit.days);
  if (!days) return true;
  return days.includes((new Date().getDay() + 6) % 7); // getDay(): 0 = domingo
}

/** "diario" · "L–V" · "L·X·S" · "2×/semana" */
export function cadenceLabel(habit: Cadence): string {
  if (habit.frequency === "weekly") {
    return habit.target_per_week > 1 ? `${habit.target_per_week}×/semana` : "semanal";
  }
  const days = habitDays(habit.days);
  if (!days || days.length === 7) return "diario";
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (contiguous && days.length > 2) return `${WEEKDAYS_ES[days[0]]}–${WEEKDAYS_ES[days[days.length - 1]]}`;
  return days.map((d) => WEEKDAYS_ES[d]).join("·");
}

/** La racha de un hábito semanal se cuenta en semanas, no en días. */
export function streakUnit(habit: Cadence, n: number): string {
  if (habit.frequency === "weekly") return n === 1 ? "semana" : "semanas";
  return n === 1 ? "día" : "días";
}

/* Paletas de DATOS: hex literal a propósito, no var().
   Estos valores se concatenan con alfa (`${color}66`) y se pasan como atributos
   SVG a recharts, donde `var(--x)66` sería inválido.
   Espejo de --gr-cat-* en theme.css. */
export const CATEGORY_COLORS: Record<string, string> = {
  "Físico": "#5aa885",
  "Académico": "#a98bf0",
  "Idioma": "#6f93e0",
  "Proyecto": "#cf7ba6",
  "TCG": "#dcae5c",
  "Otro": "#9a90b5",
  "Personal": "#63a9c4",
  "Trabajo": "#b8807f",
};

/* Colores de los puntos del calendario — espejo del sistema */
export const DOT_COLORS = {
  habit: "#a98bf0",   // arcano: actividad del sistema
  event: "#6f93e0",   // frío: compromiso externo
  taskDone: "#5aa885", // verdigris: éxito
  taskDue: "#dcae5c",  // dorado: atención/vencimiento
} as const;

/** ISO local sin zona ("YYYY-MM-DDTHH:mm:ss").
 *  `toISOString()` convierte a UTC, lo que desplaza la ventana consultada según
 *  el offset local y manda un datetime con zona a columnas naive del backend. */
export function isoDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const TIER_META: Record<string, { label: string; color: string; glow: string }> = {
  // La rareza escala de tinta neutra a dorado: culmina en la recompensa.
  common: { label: "Común", color: "#a49db5", glow: "rgba(164,157,181,0)" },
  rare: { label: "Raro", color: "#6f93e0", glow: "rgba(111,147,224,0.34)" },
  epic: { label: "Épico", color: "#b57ded", glow: "rgba(181,125,237,0.40)" },
  legendary: { label: "Legendario", color: "#dcae5c", glow: "rgba(220,174,92,0.48)" },
};

// mirrors backend STREAK_BONUS in constants.py
const STREAK_BONUS: [number, number][] = [
  [7, 1.1], [14, 1.2], [30, 1.35], [60, 1.5], [100, 1.75],
];

export function streakMultiplier(streak: number): number {
  let mult = 1;
  for (const [threshold, value] of STREAK_BONUS) {
    if (streak >= threshold) mult = value;
  }
  return mult;
}

/* ============================================================================
   DINERO
   ----------------------------------------------------------------------------
   El erario guarda enteros en unidades menores y convierte sólo en los bordes:
   aquí al mostrar, aquí al leer lo que se teclea. Un float no representa 18.000,10
   de forma exacta y el error se acumula en cada suma.

   Espejo de MONEY_DECIMALS en constants.py, y NO es la tabla de ISO 4217: el peso
   colombiano declara 2 decimales y en la práctica nadie usa centavos, así que
   vale 0 y $18.000 se guarda como 18000.
   ============================================================================ */

const MONEY_DECIMALS: Record<string, number> = {
  COP: 0, CLP: 0, PYG: 0, ISK: 0, JPY: 0, KRW: 0, VND: 0,
};

export function moneyDecimals(currency: string): number {
  return MONEY_DECIMALS[(currency || "").toUpperCase()] ?? 2;
}

/** Unidades menores -> texto. `symbol: false` deja sólo la cifra. */
export function formatMoney(
  minor: number,
  currency = "COP",
  opts: { symbol?: boolean } = {},
): string {
  const dec = moneyDecimals(currency);
  const fmt = new Intl.NumberFormat("es-CO", {
    style: opts.symbol === false ? "decimal" : "currency",
    currency,
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  const parts = fmt.formatToParts(minor / 10 ** dec);
  const out = parts
    // Intl mete un espacio duro tras el símbolo ("$ 18.000"); en Colombia se
    // escribe pegado, y en la columna del libro ese hueco separa el signo de su
    // cifra. Sólo se quita cuando el símbolo va delante: si la moneda lo lleva
    // detrás ("1.234,56 €"), el espacio es el correcto y se respeta.
    .filter((p, i) => !(p.type === "literal" && p.value.trim() === "" &&
                        parts[i - 1]?.type === "currency"))
    .map((p) => p.value)
    .join("");
  // Menos tipográfico (U+2212): tiene el ancho de una cifra tabular. El guión
  // del teclado es más corto y descuadra la columna de montos del libro.
  return out.replace("-", "−");
}

/** El signo lo pone el tipo de asiento, nunca el monto guardado. */
export function entrySign(kind: string): string {
  if (kind === "income") return "+";
  if (kind === "expense") return "−";
  return ""; // un traspaso no suma ni resta al conjunto: sólo cambia de arca
}

/** Texto tecleado -> unidades menores. null si no hay número que leer.
 *
 *  Acepta lo que se escribe de verdad: "$ 18.000", "18000", "1.250.000", "-4,50",
 *  "(1.200)". Con dos decimales, el último separador seguido de 1–2 dígitos es el
 *  decimal y el resto son miles; "1.250" son mil doscientos cincuenta, porque tres
 *  dígitos detrás del separador nunca son centavos. */
export function parseMoney(input: string, currency = "COP"): number | null {
  const dec = moneyDecimals(currency);
  const raw = String(input).trim();
  if (!raw) return null;
  const negative = /^[-−]/.test(raw) || /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let whole = cleaned;
  let frac = "";
  if (dec > 0) {
    const m = cleaned.match(new RegExp(`[.,](\\d{1,${dec}})$`));
    if (m) {
      whole = cleaned.slice(0, cleaned.length - m[0].length);
      frac = m[1];
    }
  }
  whole = whole.replace(/[.,]/g, "");
  if (!whole && !frac) return null;

  const minor = Number(whole || "0") * 10 ** dec + Number((frac + "0".repeat(dec)).slice(0, dec) || "0");
  // Fuera del entero seguro la aritmética deja de ser exacta, que es justo lo
  // que este módulo existe para evitar: mejor rechazar que guardar un redondeo.
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Estado de una asignación: cardenillo hasta el 85%, ámbar hasta el 100%,
 *  sangre de buey por encima. Los umbrales son dominio, no decoración: viven
 *  aquí para poder probarlos sin montar el componente. */
export type BudgetState = "ok" | "warn" | "over";

export function budgetState(spent: number, budget: number): BudgetState {
  if (budget <= 0) return "ok";
  const pct = spent / budget;
  if (pct > 1) return "over";
  if (pct >= 0.85) return "warn";
  return "ok";
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function renderMarkdown(md: string): string {
  // minimal markdown → HTML (bold, italic, bullet lists), escaped first
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const lines = esc.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    let l = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>");
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${l.replace(/^\s*-\s+/, "")}</li>`);
    } else {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(l.trim() ? `<p>${l}</p>` : "<br/>");
    }
  }
  if (inList) html.push("</ul>");
  return html.join("");
}
