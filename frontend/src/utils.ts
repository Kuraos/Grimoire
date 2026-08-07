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

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAYS_ES = ["L", "M", "X", "J", "V", "S", "D"];

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
