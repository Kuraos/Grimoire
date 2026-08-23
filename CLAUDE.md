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

Por eso los carriles de presupuesto del erario **no pueden usar
`--gr-xp-from → --gr-xp-to`**: ese degradado va de arcano a dorado porque
representa avance hacia una recompensa, y un carril lleno significa lo
contrario —te lo gastaste todo—, así que premiaría en oro el peor mes. Es el bug
del Pomodoro con otra ropa. Por lo mismo la rampa del mapa de calor del gasto
acaba en ámbar y no en dorado: la del heatmap de hábitos va hacia arcano porque
más marcas es mejor, pero aquí más gasto no lo es.

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

Una card no puede significar cuatro cosas. `<Card rank>` acepta:

- `rubric` — lo que el día exige. Una por vista. Degradado, filo de oro arriba,
  título en Cinzel.
- `leaf` — la card estándar (por defecto).
- `marginalia` — cifras de contexto; pierde la caja y deja sólo un filete.
- `pozo` — panel hundido para gráficos y piezas dibujadas. Pierde el borde y el
  radio, se hunde al fondo estrellado y **no lleva título propio**: lo abre una
  `<SectionBand>`, que ya trae sigilo, relleno y remate.

El nudo de esquina sale del rango, no de una prop: oro en la rúbrica, tinta en
la hoja, ninguno en marginalia ni en el pozo —no tienen caja donde anclarlo—.
Pedirlo a mano sería una segunda fuente de verdad de la misma jerarquía.

### El techo de la escalera de elevación

`surface` no se puede subir más sin bajar `ink-faint` de AA. Es un límite
medido, no una preferencia: si alguien quiere más separación entre card y
fondo, hay que subir también la tinta tenue y revalidar los pares.

## El erario

El módulo de finanzas. La tesis larga está en la cabecera de
`backend/routers/ledger.py` y cabe en una línea: **el XP premia el acto de
asentar y revisar, jamás el monto.** Premiar la cifra produce conducta
transaccional de corto plazo; premiar el registro y la revisión es lo que
sostiene la práctica.

De ahí sale la regla estética: **el dinero no es oro.** Un saldo sano es
circunstancia, no mérito. Los montos van en tinta tabular y el estado de un cerco
en los semánticos. En todo el módulo hay exactamente dos dorados legítimos —una
reliquia alcanzada y un mes cerrado—, y los dos son metas que el usuario fijó y
cumplió, igual que una misión.

### El dinero se guarda en enteros

`MONEY_DECIMALS` (en `constants.py`, con espejo en `utils.ts`) **no es la tabla
de ISO 4217**. El peso colombiano declara dos decimales y en la práctica nadie
usa centavos, así que aquí vale 0 y $18.000 se guarda como `18000`. Es la
autoridad para guardar *y* para mostrar.

Quien lo «corrija» a 2 reinterpreta por cien todo lo ya anotado. `utils.test.ts`
fija el valor del lado JS; el espejo de Python **no lo ejerce nada** —el frontend
manda `amount_minor` ya convertido, así que el backend no convierte en ningún
sitio—, y por eso lo ata `test_money_decimals_mirror_matches_the_frontend`, que
lee la tabla de `utils.ts` y la compara. Sin ese test, los dos lados podían
separarse en silencio. Con él siguen sin poder proteger los datos ya escritos: si
algún día hay que cambiarlo de verdad, hace falta migrar las filas, no sólo la
constante.

El otro límite del dinero entero es `MAX_MINOR` (2⁵³−1), y no es capricho:
guardar enteros evita que un float pierda exactitud al sumar, pero toda la
aritmética del frontend se hace en `Number`, que deja de ser exacto justo ahí.
`parseMoney` ya cortaba al teclear; el mismo monto entraba por la API, se
guardaba exacto y se mostraba redondeado, y la cifra guardada dejaba de ser la
que se ve sin que nada fallara. El techo va en el esquema —asiento, apertura de
arca, cerco y meta de reliquia—, que es donde entra el dinero.

`amount_minor` es siempre positivo y el signo lo pone `kind`. Con montos con
signo se puede escribir un gasto negativo que suma en vez de restar, y no se ve
en la lista porque el «−» lo pinta el tipo, no el dato.

`occurred_on` es `Date`, no `DateTime`: un gasto pertenece a un día, no a un
instante. Evita de raíz la clase de bug que obligó a `tz._now`.

### Nada que se pueda deducir se guarda

El saldo de un arca y el progreso de una reliquia se calculan de los asientos. Un
total guardado y una lista de movimientos son dos fuentes de verdad del mismo
dato, y acaban discrepando.

El progreso de una reliquia sale de los **traspasos marcados con ella**, no del
saldo de su arca: si fuera el saldo, dos reliquias en la misma hucha mostrarían
las dos la misma cifra y la segunda parecería casi cumplida sin haber recibido
nada.

Un traspaso no es gasto ni ingreso, y por eso tampoco lleva partida. Si contara,
el resumen mentiría cada vez que se pasa dinero al ahorro.

### Las cinco prohibiciones

Protegen bugs silenciosos: no rompen nada, sólo inflan el nivel, y no se ven
hasta revisar el `xp_log` meses después. Cada una tiene su test.

1. **Sin XP retroactivo.** Se sella contra `earned_at` —el día del acto— y nunca
   contra `occurred_on`. Rellenar el mes entero de una sentada es un día de
   constancia, no treinta. Las misiones cuentan por `created_at` por lo mismo.
2. **Sin farmeo.** La marca vive en `xp_log`, no en el número de asientos:
   borrar y reponer no vuelve a pagar.
3. **Sin penalización.** Ninguna mecánica resta XP ni gasta vidas por un
   resultado financiero. Se penaliza no anotar —no cobrando—, nunca gastar de
   más: una racha rota por dinero produce ansiedad justo en quien tiene menos
   margen.
4. **Sin multiplicador de racha.** `streak_multiplier()` es de hábitos; aplicarlo
   aquí haría que un mes de gimnasio inflara el XP de apuntar el almuerzo.
5. **Sin re-otorgar.** El `achieved_at` de una reliquia y el cierre de un mes se
   sellan una vez. Bajar la meta por debajo de lo ya ahorrado **no** la marca
   sola: hace falta un aporte posterior, o editar la cifra sería la forma más
   barata de cobrar 50 XP. El XP de reliquia es plano por la misma razón —
   proporcional al monto premiaría la renta, no la constancia.

## La palestra

El módulo de entrenamiento. Su tesis está en la cabecera de
`backend/routers/training.py` y es la del erario con otras unidades: **el XP
premia el acto de asentar, jamás la carga.** Pagar por kilos levantados premia la
genética, el descanso y el material —y sobre todo un número que teclea el usuario
sin validación posible—.

De ahí sale la regla estética: **levantar mucho no es oro.** El peso, el volumen,
el 1RM, el ritmo y el peso corporal van en tinta tabular. En todo el módulo hay
un solo dorado propio —una meta de fuerza declarada y cumplida—, y el otro oro
que se ve en la vista no es suyo: es el rito marcado, que es XP de Hábitos
asomándose.

### Un récord no es una medalla

La propuesta pedía un logro por PR. Un récord **es** la cifra, y premiar la cifra
es premiar la renta con otro nombre. Además es autorreportado: escribir 300 kg
cuesta lo mismo que escribir 80.

El reemplazo es `StrengthGoal`, que es `SavingsGoal` con kilos y hereda su
docstring entera: se declara ANTES, el progreso sale de las series y no se
guarda, `achieved_at` se sella una vez, y **bajar la cifra por debajo de lo que
ya se levanta no la marca sola** —hace falta una serie posterior—. Sin esa última
regla, editar el objetivo sería la forma más barata de cobrar 50 XP de toda la
app. El PR se sigue dibujando: rombo de tinta en la curva, y cero XP.

### La fecha manda sobre el rito, pero no sobre el XP

Registrar una sesión marca el rito del día, y ahí hay dos cosas que se cruzan y
no significan lo mismo:

- **Una sesión con fecha pasada no marca nada.** `complete_habit` sólo sabe
  marcar hoy —escribe la marca con la hora actual—, así que con fecha vieja
  apuntaría el rito al día equivocado: racha inflada y mapa de consistencia
  mintiendo.
- **Pero sí paga los 5 XP del día.** El XP premia asentar, no entrenar. No
  pagarlo empujaría a no rellenar los huecos, y rellenarlos es lo que mantiene el
  registro honesto. Es exactamente `ledger_day`, que tampoco mira `occurred_on`.

Y el auto-marcado **nunca puede tumbar el guardado**. Marcar a mano responde 400
si el rito ya está hecho o si un semanal alcanzó su meta —la tercera sesión de
una semana de 2×—; asentar una sesión sigue adelante y lo cuenta en
`habit_note`. Perder el detalle real de una sesión por intentar ser amable sería
el peor intercambio posible. Por eso la validación vive en
`services.mark_habit_done` y no en el router: la regla es una, y lo único que
cambia entre los dos llamantes es qué hacer cuando no se cumple.

Borrar una sesión **no** desmarca el rito ni devuelve XP: la marca vive en
`habit_logs` y el pago en `xp_log`, y si borrar desmarcara, el ciclo
asentar-borrar-asentar cobraría una y otra vez.

### El cuerpo no es un marcador

`body_metrics` no da XP, ni racha, ni logro, y su gráfica no lleva verdigrís ni
oxblood. Un peso que baja no es «bien» y uno que sube no es «mal»: pintarlos de
éxito o de peligro convierte el cuerpo en un marcador, que es el incentivo
perverso más caro que este módulo podía crear. Es la misma decisión que hace que
el dinero no sea oro, en el terreno donde más daño hace.

La gráfica dibuja dos líneas porque la pregunta no es «¿cuánto peso hoy?» sino
«¿esto baja o es ruido?»: el dato crudo en tinta tenue y la media móvil de cuatro
medidas en tinta brillante.

### Gramos, no floats

`weight_g` es entero por lo mismo que `amount_minor`: el volumen semanal es una
suma de peso×reps sobre miles de series, y ahí un float pierde exactitud. 2,5 kg
se guarda como 2500. Las medidas del cuerpo van en milésimas de su unidad
(`BODY_METRIC_UNITS`), con espejo en `utils.ts` atado por
`test_body_metric_units_mirror_matches_the_frontend`.

**La unidad de peso no cuelga del ejercicio.** Vive una sola vez en
`users.weight_unit` y es preferencia de presentación. Por ejercicio, el volumen
semanal sumaría kilos con libras dentro de la misma barra, y cambiarla
reinterpretaría todo el historial de ese ejercicio.

### Una tabla, tres modalidades

`training_sessions` mete fuerza, HEMA y cardio en una sola tabla con `kind`,
igual que `ledger_entries` mete gasto, ingreso y traspaso. Tres tablas habrían
costado tres routers, tres formularios y un `UNION` cada vez que alguien pregunta
cuántas sesiones lleva la semana; y una cuarta modalidad sería una migración en
vez de una constante.

El 1RM sale de Epley con un clamp: **a una repetición devuelve el peso tal cual.**
Sin él, `peso × (1 + 1/30)` inflaría un 3,3 % justo el caso en que el dato es
exacto, y en la curva la estimación acabaría por encima del récord real. Por
encima de diez reps la estimación se marca en ámbar en vez de ocultarse.

El ritmo se deduce de distancia y duración, y devuelve `None` sin distancia: una
sesión de cinta se anota con duración y sin kilómetros, y sin ese guardia eso
divide entre cero.

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

**Un temporizador no puede contar ticks.** El Pomodoro restaba un segundo por
cada `setInterval` de 1 s, y el navegador estrangula los intervalos de una
ventana oculta o minimizada —de 1/s a 1/min—, así que con Grimoire de fondo un
bloque de 25 minutos duraba bastante más y nadie lo veía. Ahora `usePomodoro`
guarda un `endsAt` absoluto y deduce lo que queda del reloj: el intervalo sólo
refresca la vista, y perder ticks ya no atrasa nada. Aun así hay que
resincronizar en `visibilitychange` y `focus`, o el final llega con hasta un
minuto de retraso.

**Nada del frontend se persiste solo.** No había un `localStorage` en toda la
app, y eso significaba que cerrar la ventana perdía la configuración del
Pomodoro, la tarea vinculada y el punto del ciclo de cuatro. El temporizador
ahora se guarda entero en `grimoire.pomodoro.v1`, y `restoreSnapshot` sanea lo
que vuelve —fase inválida, restos mayores que la fase, basura en los campos—
porque un JSON a medio escribir no puede tumbar el arranque.

**No registrar tiempo que nadie vio correr.** Es la regla que ordena las dos
anteriores. «Saltar» invocaba el mismo camino que llegar a cero, así que
regalaba 15 XP y una sesión de 25 minutos que no ocurrió, y contaba para
«Centurión del foco». Por lo mismo, una fase que vence con la app cerrada
vuelve agotada y en pausa sin registrarse: perder un pomodoro legítimo es mejor
que inventarlo. Lo que se abandona a medias se guarda con `completed=False`,
que era un campo que llevaba desde el commit inicial valiendo siempre `True`.

**El cerco era una columna y mentía.** `budget_minor` vivía en
`ledger_categories`: uno por partida, sin mes. Cambiarlo en noviembre reescribía
lo que decía agosto, así que un mes que cerraste en verde pasaba a rojo por una
decisión tomada tres meses después. Un presupuesto es un dato de un mes concreto,
no una propiedad permanente de la partida. Ahora vive en `category_budgets` con
su `month_key` y se arrastra desde la fila explícita más reciente: fijarlo en
agosto vale para septiembre sin repetirlo, y escribir la fila de noviembre no
toca ninguna anterior. Un cero es «este mes, sin cerco» y corta el arrastre a
propósito; no tener fila es heredar. El snapshot que congela el cierre mensual
sigue ahí, pero ya es cinturón además de tirantes.

**Un cerco de una partida archivada inflaba el asignado.** Sumaba al total sin
que nadie pudiera gastarlo, y el disponible salía más alto de lo real. El resumen
sólo cuenta partidas de gasto vivas.

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
