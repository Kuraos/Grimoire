/* Ensambla cada artboard: prelude (tokens exactos de theme.css + index.css +
   ornamento.css) + el cuerpo de la vista. Un solo sitio donde vive la paleta,
   igual que en el repo. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const prelude = readFileSync(join(here, "_prelude.txt"), "utf8");

for (const f of readdirSync(join(here, "parts")).filter((f) => f.endsWith(".body.html"))) {
  const name = f.replace(".body.html", "");
  const raw = readFileSync(join(here, "parts", f), "utf8");
  const [body, script = ""] = raw.split("<!--SCRIPT-->");
  writeFileSync(
    join(here, `${name}.dc.html`),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${prelude.trim()}
</helmet>
${body.trim()}
</x-dc>
${script.trim()}
</body>
</html>
`,
  );
  console.log(`ok ${name}.dc.html`);
}
