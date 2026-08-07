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
  surfaceRaised: string;
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
    surfaceRaised: read("--gr-surface-raised"),
  };
  return cache;
}

/** Estilo del tooltip de recharts. Es un div, así que admite `var()`. */
export const TOOLTIP_STYLE = {
  background: "var(--gr-surface-sunken)",
  border: "1px solid var(--gr-edge-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--gr-ink-bright)",
} as const;

/** `#rrggbb` → `[r, g, b]`. Para interpolar entre dos tokens. */
export function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
