/**
 * Puente entre theme.css y el JS que no puede usar `var()`.
 *
 * Los atributos de presentación de SVG —los que recharts emite para `stroke`,
 * `fill` y los ticks de los ejes— no sustituyen custom properties: necesitan un
 * color ya resuelto. Duplicar la paleta a mano es justo como los gráficos
 * acabaron pintando el morado de la config antigua (#9b7fc4) mientras el tema
 * decía otra cosa. Aquí la leemos del documento, así theme.css sigue siendo la
 * única fuente de verdad también fuera del CSS.
 *
 * Para objetos de estilo de React (`contentStyle`, `wrapperStyle`) no hace falta
 * nada de esto: ahí `var(--gr-*)` funciona directamente.
 */

export type ChartPalette = {
  axis: string;
  tick: string;
  tickFaint: string;
  ink: string;
  body: string;
  arcane: string;
  arcaneDeep: string;
  xpFrom: string;
  verdigris: string;
  /* Advertencia. La rampa del gasto diario acaba aquí y no en dorado: más gasto
     no es mejor, y terminar en oro premiaría el día que más se gastó. */
  amber: string;
  oxblood: string;
  surfaceRaised: string;
  /* Las tres piezas de ornamento —sigilo, constelación, volumen— son SVG
     escrito a mano, y sus `stroke`/`fill` son atributos de presentación
     igual que los de recharts: tampoco sustituyen `var()`. */
  gilded: string;
  gildedBright: string;
  gildedDeep: string;
};

let cache: ChartPalette | null = null;

function read(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Se resuelve durante el primer render —ya con el CSS aplicado— y se memoiza.
 * La paleta no cambia en caliente: Grimoire no tiene selector de tema.
 */
export function chartPalette(): ChartPalette {
  if (cache) return cache;
  cache = {
    axis: read("--gr-edge"),
    tick: read("--gr-ink-dim"),
    tickFaint: read("--gr-ink-faint"),
    ink: read("--gr-ink-bright"),
    body: read("--gr-ink"),
    arcane: read("--gr-arcane"),
    arcaneDeep: read("--gr-arcane-deep"),
    xpFrom: read("--gr-xp-from"),
    verdigris: read("--gr-verdigris"),
    amber: read("--gr-amber"),
    oxblood: read("--gr-oxblood"),
    surfaceRaised: read("--gr-surface-raised"),
    gilded: read("--gr-gilded"),
    gildedBright: read("--gr-gilded-bright"),
    gildedDeep: read("--gr-gilded-deep"),
  };
  return cache;
}

/**
 * Rótulo (11px): el peldaño de etiqueta de la escala. Los ejes de recharts
 * reciben un número, no una clase, así que el valor se declara aquí una vez
 * en lugar de repetirse en los cinco gráficos.
 */
export const CHART_LABEL_SIZE = 11;

/**
 * Radio de marca de datos (2px, el peldaño `xs`). Recharts lo quiere en número
 * por esquina, así que tampoco puede leer la variable CSS.
 */
export const CHART_BAR_RADIUS = 2;

/** Estilo del tooltip de recharts. Es un div, así que admite `var()`. */
export const TOOLTIP_STYLE = {
  background: "var(--gr-surface-sunken)",
  border: "1px solid var(--gr-edge-strong)",
  borderRadius: "var(--gr-radius-md)",
  fontSize: 13,
  color: "var(--gr-ink-bright)",
} as const;

/** `#rrggbb` → `[r, g, b]`. Para interpolar entre dos tokens. */
export function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
