// Trae componentes de un registro shadcn (Bklit, Kokonut UI) al árbol propio.
//
//   node scripts/vendor-registry.mjs @bklit/line-chart @bklit/bar-chart
//
// No se usa `npx shadcn add` porque en este proyecto hace tres cosas que no
// queremos: escribe los gráficos de Bklit en `components/charts/`, mezclados con
// los nuestros (ignora `--path` en los ítems con `target`); sobrescribe
// `src/lib/utils.ts`, que lleva la extensión de tailwind-merge para nuestra
// escala; e instala `tailwind-merge` sin versión, que resuelve a la v3 y ésa
// sólo entiende Tailwind 4.
//
// Aquí cada registro va a su carpeta (`src/components/<registro>/`), conservando
// la estructura del `target` para que las importaciones relativas sigan valiendo.
// Las dependencias npm y las variables CSS sólo se listan: instalarlas y
// conectarlas a la paleta es una decisión, no un paso mecánico.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRIES = {
  "@bklit": "https://ui.bklit.com/r/{name}.json",
  "@kokonutui": "https://kokonutui.com/r/{name}.json",
};
// `cn` ya existe en src/lib/utils.ts, con la configuración que necesita.
const SKIP = new Set(["utils"]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "components");
const seen = new Set();
const npmDeps = new Set();
const cssVars = {};
const written = [];

async function fetchItem(ns, name) {
  const url = REGISTRIES[ns].replace("{name}", name);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function vendor(address, ns) {
  const [itemNs, name] = address.startsWith("@") ? address.split("/") : [ns, address];
  const key = `${itemNs}/${name}`;
  if (seen.has(key) || SKIP.has(name)) return;
  seen.add(key);
  if (!REGISTRIES[itemNs]) throw new Error(`registro desconocido: ${address}`);

  const item = await fetchItem(itemNs, name);
  for (const dep of item.dependencies ?? []) npmDeps.add(dep);
  Object.assign(cssVars, item.cssVars?.dark ?? item.cssVars?.theme ?? {});

  const dir = join(root, itemNs.slice(1));
  for (const file of item.files ?? []) {
    const rel = (file.target ?? file.path).replace(/^~?\/?(src\/)?components\//, "");
    const dest = join(dir, rel);
    await mkdir(dirname(dest), { recursive: true });
    // Bklit importa sus piezas sueltas como `../components/x` desde `charts/`,
    // contando con que el CLI reescriba la ruta. Aquí viven un nivel arriba.
    await writeFile(dest, file.content.replaceAll('from "../components/', 'from "../'));
    written.push(dest);
  }
  for (const dep of item.registryDependencies ?? []) await vendor(dep, itemNs);
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("uso: node scripts/vendor-registry.mjs @bklit/line-chart …");
  process.exit(1);
}
for (const a of args) await vendor(a);

console.log(`${written.length} archivos:`);
for (const w of written) console.log("  " + w);
console.log("\nnpm:", [...npmDeps].sort().join(" ") || "—");
if (Object.keys(cssVars).length) console.log("\nvariables CSS (dark):", cssVars);
