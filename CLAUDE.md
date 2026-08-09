# Grimoire — contexto para Claude

CRM de vida personal con gamificación y estética gótica. 100% local, sin
servicios externos: React + Vite en el frontend, FastAPI + SQLite en el
backend, empaquetado como app de escritorio con Tauri 2.

`README.md` cubre el arranque y `DESKTOP.md` el empaquetado y las
actualizaciones firmadas. Este archivo recoge lo que no se deduce leyendo el
código: las decisiones vivas y las trampas que ya han mordido.

## Cómo trabajar aquí

```bash
npm run dev          # backend con recarga + ventana Tauri (lo habitual)
npm run dev:browser  # backend + Vite en el navegador, sin ventana nativa
npm run check        # tsc + vitest + pytest + build. Correr esto, no las piezas
```

`npm run check` cubre las cuatro comprobaciones de CI de una vez, incluidos los
tests de backend. No hay motivo para lanzarlas por separado.

- El backend escucha en `127.0.0.1:8000` y Vite en `5173`, que hace de proxy a
  `/api`. En desarrollo el sidecar **no** se lanza desde Tauri: corre aparte,
  para no reconstruirlo con PyInstaller cada vez que se toca Python.
- **Vite tarda ~18 s en levantar.** Si algo se conecta antes, falla con un
  error que parece de permisos y no lo es.
- **Cambiar `tailwind.config.js` no recarga en caliente.** Hay que reiniciar el
  servidor de desarrollo o se sigue sirviendo el CSS viejo, y las mediciones
  salen contra la versión anterior sin avisar.

## El sistema visual

La dirección es *manuscrito iluminado*: pan de oro sobre vitela oscura. La
tesis completa está en la cabecera de `frontend/src/theme.css`, que es **la
única fuente de verdad de la paleta**. `tailwind.config.js` no tiene valores
propios: sus colores apuntan a `var(--gr-*)`.

### La ley del acento

Es la regla que más define el aspecto de la app. Antes de pintar algo de color,
decidir a cuál de los tres pertenece:

| | |
|---|---|
| **Dorado** | lo que el usuario se ganó: XP, niveles, logros desbloqueados, rachas activas, misiones cumplidas |
| **Arcano** | sistema: navegación activa, foco, selección, acción primaria |
| **Tinta** | todo lo demás: títulos, prosa, datos, metadata, iconos inactivos |

Si el oro aparece donde no hay recompensa, deja de significar recompensa. Ya
pasó una vez: la barra del Pomodoro usaba el degradado de XP y terminaba en
dorado sin serlo.

### Escalas

Tipografía — seis peldaños con función asignada:

```
2xs 11  rótulo (versalitas)      base 16  prosa
xs  13  suelo de interfaz        xl   24  iluminación (Cinzel)
sm  15                           3xl  44  rúbrica (título de vista)
```

La cifra (34 px) no es un peldaño suelto: es el rol `.gr-figure`, que además
fija `tabular-nums`. Los 56 px del temporizador a pantalla completa son el
único tamaño por encima de la escala, y es deliberado.

Radios — cuatro peldaños más la píldora: `xs 2` marcas de datos, `sm 4` piezas
pequeñas, `md 6` controles, `lg 10` superficies. `0` y `50%` no son peldaños,
son formas.

**`fontSize` y `borderRadius` reemplazan la escala de Tailwind, no la
extienden.** Es a propósito: dentro de `extend`, los peldaños no definidos
siguen existiendo con los valores por defecto y se cuelan sin querer. Fuera,
`text-lg` no existe y la clase se queda muda, que se ve en revisión.

### Rangos de superficie

Una card no puede significar tres cosas. `<Card rank>` acepta:

- `rubric` — lo que el día exige. Una por vista. Degradado, filo de oro arriba,
  título en Cinzel.
- `leaf` — la card estándar (por defecto).
- `marginalia` — cifras de contexto; pierde la caja y deja sólo un filete.

### El techo de la escalera de elevación

`surface` no se puede subir más sin bajar `ink-faint` de AA. Es un límite
medido, no una preferencia: si alguien quiere más separación entre card y
fondo, hay que subir también la tinta tenue y revalidar los pares.

## Trampas que ya han mordido

**Cascada.** `.card`, sus rangos, `.input` y `.btn` viven dentro de
`@layer components` para que las utilidades de Tailwind puedan sobrescribirlas.
Declaradas sueltas ganaban por orden de cascada, y eso anuló durante meses el
`w-auto` de los filtros de Tareas y el `w-16` de los campos del Pomodoro: el
marcado era correcto y el CSS no le hacía caso.

Por lo mismo, **no añadir selectores compuestos** tipo `select.input`: suben la
especificidad a 0-1-1 y vuelven a ganar a cualquier utilidad. Una clase de
autor ya gana a los estilos del navegador sin ayuda.

**SVG no sustituye `var()`.** Los atributos de presentación que emite recharts
necesitan un color resuelto. `frontend/src/theme-tokens.ts` lee los tokens del
documento y expone también `CHART_LABEL_SIZE` y `CHART_BAR_RADIUS`, porque
recharts pide números. No volver a escribir hexadecimales en los gráficos.

**Cinzel no tiene cifras tabulares.** `tabular-nums` no le hace nada, y a 56 px
`11:11` mide 6 px menos que `25:00`. Cualquier número que cambie va en Inter
tabular; Cinzel es para títulos y nombres.

**Movimiento reducido.** Cada hoja apaga el suyo: `theme.css` sus clases
`gr-*`, `index.css` las suyas. Quedan fuera a propósito `transition-colors` y
`transition-opacity`, que no son movimiento.

## Publicar una versión

El proceso está en `DESKTOP.md`; lo que hay que recordar:

1. La versión vive en **siete sitios**: cuatro manifiestos (`tauri.conf.json`,
   `Cargo.toml`, los dos `package.json`) y los tres lockfiles, que la llevan
   dentro. Si un lockfile se queda atrás, `npm ci` aborta y CI falla.
   En `Cargo.lock` hay otros paquetes con versiones parecidas: sólo cambia la
   entrada `name = "grimoire"`.
2. La etiqueta y `tauri.conf.json` deben coincidir. El workflow lo verifica.
3. GitHub deja el release **en borrador**. Publicarlo es manual y deliberado:
   mientras siga en borrador, ningún cliente ve la actualización.
4. Comprobar después que
   `releases/latest/download/latest.json` sirve la versión nueva y que el
   instalador se descarga **sin credenciales** — es lo que hace el updater.

## Sobre revisar el trabajo

Lo más útil que dejó la revisión visual de agosto de 2026: **medir y mirar no
son lo mismo, y hay defectos que sólo caen con lo segundo.**

El minicalendario llevaba desde el commit inicial pintando un solo día —pedía
el día 1 del mes siguiente en vez del día 0— y pasó dos auditorías completas de
contraste, escala, radios y desbordes sin que saltara ninguna. Un calendario
roto aprueba todas esas pruebas. Apareció en la primera captura de pantalla.

Conviene medir lo medible (contraste, tamaños, desbordes, especificidad) y
**pedir capturas para todo lo demás**: si el degradado separa de verdad, si el
oro canta, si un componente muestra los datos que debe.
