import { Card } from "../ui/Card";
import { SectionBand } from "../ui/SectionBand";
import { chartPalette } from "../../theme-tokens";
import type { Habit } from "../../types";

/**
 * La constelación: un hábito es una estrella, el tamaño es la racha y las
 * líneas unen los de una misma categoría.
 *
 * El heatmap de al lado cuenta el tiempo —qué días se marcó— y no dice nada de
 * la forma del conjunto. Aquí se ve de un vistazo qué categoría está viva y
 * cuál lleva semanas apagada, que es la pregunta que hace falta responder para
 * decidir qué archivar.
 *
 * Las posiciones son deterministas: salen del `id` del hábito, así que la
 * constelación no baila entre renders ni al marcar uno. Cada categoría tiene su
 * celda en una rejilla sobre el lienzo, y dentro de ella las estrellas se
 * dispersan sin llegar al borde.
 */

const W = 520;
const H = 310;
const PAD = 26;

/** Ruido determinista en [0,1) a partir de dos enteros.
 *
 *  Fue primero el truco del seno troceado —`frac(sin(a·k₁ + b·k₂) · k₃)`— y con
 *  datos reales salieron cuatro estrellas a menos de un píxel en vertical: con
 *  el segundo argumento fijo, los ids consecutivos caen en el mismo tramo del
 *  seno y las coordenadas se correlacionan. Es un defecto que no se ve midiendo
 *  contraste ni tamaños; se vio leyendo las coordenadas.
 *
 *  Una avalancha de enteros no tiene ese sesgo: cada bit de entrada afecta a
 *  todos los de salida, así que ids vecinos dan posiciones sin relación. */
function noise(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function HabitConstellation({ habits }: { habits: Habit[] }) {
  const c = chartPalette();

  const cats: { name: string; color: string; items: Habit[] }[] = [];
  for (const h of habits) {
    const found = cats.find((x) => x.name === h.category);
    if (found) found.items.push(h);
    else cats.push({ name: h.category, color: h.color, items: [h] });
  }

  // Rejilla de celdas, una por categoría: tantas columnas como quepan sin que
  // una celda baje de ~150px de ancho.
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(cats.length))));
  const rows = Math.max(1, Math.ceil(cats.length / cols));
  const cellW = (W - PAD * 2) / cols;
  const cellH = (H - PAD * 2) / rows;

  const groups = cats.map((cat, ci) => {
    const x0 = PAD + (ci % cols) * cellW + 0.12 * cellW;
    const y0 = PAD + Math.floor(ci / cols) * cellH + 0.12 * cellH;
    const innerW = 0.76 * cellW;
    const innerH = 0.76 * cellH;

    // Ranura por hábito más un temblor de ±¼ de ranura, en vez de dispersión
    // libre. Con dispersión libre dos estrellas caían encima por pura suerte
    // —el problema del cumpleaños, no un hash malo— y la categoría parecía
    // tener un hábito menos. La ranura garantiza la separación; el temblor
    // deshace la rejilla, que es lo que hacía falta que se viera.
    const sc = Math.ceil(Math.sqrt(cat.items.length));
    const sr = Math.ceil(cat.items.length / sc);
    const slotW = innerW / sc;
    const slotH = innerH / sr;

    const points = cat.items.map((h, i) => ({
      habit: h,
      x: x0 + ((i % sc) + 0.5 + (noise(h.id, 1) - 0.5) * 0.5) * slotW,
      y: y0 + (Math.floor(i / sc) + 0.5 + (noise(h.id, 2) - 0.5) * 0.5) * slotH,
    }));
    // La línea recorre las estrellas de izquierda a derecha: unir en orden de
    // id producía cruces que sugerían una relación que no existe.
    const path = [...points]
      .sort((a, b) => a.x - b.x)
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    return { ...cat, points, path };
  });

  return (
    /* Sin la tesela de estrellas del pozo, y es la regla de moderación en su
       forma más literal: esta pieza YA es un campo estelar. Con las dos capas
       encima no se distinguía el hábito pendiente —blanco, r 1.9— de la estrella
       de adorno del fondo, que mide lo mismo. El ornamento se estaba comiendo el
       dato, así que sale el ornamento. */
    <Card rank="pozo" className="flex min-h-[380px] flex-col [background-image:none]">
      {/* La única cadena de la vista de Hábitos: la constelación es la sección
          que manda en la columna derecha. Los demás rótulos usan filete. */}
      <SectionBand sigil="discoDoble" label="Constelación de hábitos"
                   count={habits.length || undefined} fill="cadena" />
      {habits.length === 0 ? (
        <p className="flex-1 py-16 text-center text-xs italic text-[var(--text-faint)]">
          Sin hábitos que dibujar todavía.
        </p>
      ) : (
        <>
          {/* El `max-h` no es decorativo: el SVG tiene proporción intrínseca, así
              que en una columna ancha crecía hasta 480px de alto y nueve
              estrellas quedaban perdidas en un campo vacío. */}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
               className="block min-h-0 w-full max-h-[340px] flex-1" role="img"
               aria-label={`Constelación de ${habits.length} hábitos agrupados por categoría`}>
            {groups.map((g) => (
              g.points.length > 1 && (
                <path key={`l-${g.name}`} d={g.path} fill="none" stroke={g.color}
                      strokeOpacity="0.28" strokeWidth="0.9" />
              )
            ))}
            {groups.flatMap((g) =>
              g.points.map((p) => (
                <circle
                  key={p.habit.id}
                  cx={p.x.toFixed(1)}
                  cy={p.y.toFixed(1)}
                  /* La racha satura a 21 días: sin techo, un hábito de dos años
                     se comía la mitad del lienzo y tapaba a sus vecinos. */
                  r={(1.9 + Math.min(p.habit.streak, 21) * 0.115).toFixed(1)}
                  fill={p.habit.done_today ? c.gilded : c.ink}
                  fillOpacity={p.habit.done_today ? 0.95 : 0.42}
                >
                  <title>{`${p.habit.name} · ${p.habit.category} · racha ${p.habit.streak}`}</title>
                </circle>
              )),
            )}
          </svg>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs font-label text-[var(--text-faint)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--gr-gilded)]" />cumplido hoy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-[var(--text-faint)]" />pendiente
            </span>
            <span className="ml-auto font-normal normal-case italic tracking-normal">
              el tamaño es la racha; las líneas unen una categoría
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
