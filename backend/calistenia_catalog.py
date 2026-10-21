"""Catálogo de calistenia para la palestra, con sus cadenas de progresión y plantillas.

Fuente: «Guía completa de Calistenia y Street Workout» (Yerai Alonso y Sergio
Catalán). De ahí salen los NOMBRES de los ejercicios, quién progresa de quién y
los umbrales de dominio (la guía: ~12-15 repeticiones en los normales, 20-25 en
los fáciles, 5-8 en los difíciles, y 30-60 s en los estáticos). Las notas están
escritas aparte, con palabras propias.

Lo que NO es del libro, y se marca como tal en la nota:
  - el orden de dificultad entre ejercicios que el libro no ordena (la guía lo
    muestra con iconos que no se pudieron leer), que es criterio de quien
    montó esto;
  - la zancada frontal (el libro sólo trae laterales, explosivas y búlgara);
  - la plantilla de softcombat, pensada para lanza corta y estoque con daga.

Se instala con una acción explícita del usuario (`POST /training/catalog/calistenia`)
y NO en el arranque: el catálogo de ejercicios lo escribe quien entrena. Es
idempotente por nombre y nunca pisa lo que el usuario ya editó.

Convención: en los estáticos, «reps» son SEGUNDOS (la tabla de series no tiene
otra columna). Se avisa en la nota y en el nombre con «(s)».
"""

# (nombre, grupo, antecesor, dominio, nota)
CATALOG: list[tuple[str, str, str | None, int, str]] = [
    # -- empuje: pecho -------------------------------------------------------
    ("Flexión inclinada", "Pecho", None, 20,
     "Manos en un apoyo alto (banca, barra baja). Cuanto más alto el apoyo, más fácil: baja la altura a medida que subas."),
    ("Flexión con rodillas apoyadas", "Pecho", "Flexión inclinada", 15,
     "Rodillas en el suelo, espalda recta, rango completo hasta rozar el pecho."),
    ("Flexión", "Pecho", "Flexión con rodillas apoyadas", 15,
     "Cuerpo en bloque de cabeza a talones. Sin hundir la cadera."),
    ("Flexión diamante", "Brazo", "Flexión", 12,
     "Manos juntas bajo el pecho; carga más el tríceps."),
    ("Flexión espartana", "Pecho", "Flexión", 12,
     "Un brazo adelantado y otro atrasado; alterna cuál va delante cada serie."),
    ("Flexión de agarre amplio", "Pecho", "Flexión", 12,
     "Manos al menos al doble del ancho de hombros."),
    ("Flexión arquera", "Pecho", "Flexión de agarre amplio", 8,
     "Flexionas un brazo y el otro queda estirado; gira las manos para acompañar. Pone a prueba el hombro: sube despacio."),
    ("Flexión explosiva", "Pecho", "Flexión", 10,
     "Empuja lo bastante rápido para despegar las manos. Sólo cuando la flexión normal sea fluida."),
    # -- empuje: hombro ------------------------------------------------------
    ("Flexión declinada", "Hombro", "Flexión", 12,
     "Pies elevados. Cuanto más alto, más trabajo de hombro."),
    ("Pike push-up", "Hombro", "Flexión declinada", 10,
     "Cadera arriba, manos y pies cerca; la cabeza baja entre los brazos. Hombro que sostiene la guardia."),
    ("Flexión hindú", "Hombro", "Pike push-up", 8,
     "Desde el pike, la cabeza pasa entre los brazos en arco. Técnica compleja: despacio y con calentamiento de hombros."),
    # -- empuje: fondos ------------------------------------------------------
    ("Fondo en banco", "Brazo", None, 20,
     "Manos en un banco a tu espalda, pies en el suelo. El punto de entrada al fondo."),
    ("Fondo en barra", "Pecho", "Fondo en banco", 12,
     "En paralelas o dos barras. Hombros abajo y lejos de las orejas; si te duele la clavícula, vuelve al banco."),
    ("Fondo espartano", "Pecho", "Fondo en barra", 8,
     "Fondo con una mano adelantada; alterna el lado."),
    # -- tirón ---------------------------------------------------------------
    ("Dead hang (s)", "Espalda", None, 45,
     "Colgarte de la barra con brazos estirados. Agarre y antebrazo: reps = segundos. Útil para sostener el arma."),
    ("Retracción escapular", "Espalda", None, 12,
     "Colgado, sube sólo moviendo las escápulas sin doblar codos. Base de toda dominada."),
    ("Remo australiano alto", "Espalda", None, 15,
     "Barra a la altura del pecho o más, cuerpo inclinado hacia atrás. Baja la barra para endurecerlo. La guía lo llama «australian pull-up asistida»."),
    ("Remo australiano bajo", "Espalda", "Remo australiano alto", 12,
     "Barra baja, cuerpo casi horizontal; pecho a la barra."),
    ("Dominada asistida", "Espalda", None, 8,
     "Barra baja y pies en el suelo: ayuda lo mínimo con las piernas e irás soltándolas."),
    ("Dominada negativa", "Espalda", "Dominada asistida", 5,
     "Subes con salto o apoyo y bajas lento (3-5 s) por tu cuenta. Reps = bajadas completas."),
    ("Dominada supina", "Espalda", "Dominada negativa", 8,
     "Palmas hacia ti, algo más fácil que la prona por el bíceps."),
    ("Dominada prona", "Espalda", "Dominada supina", 8,
     "Palmas al frente. Barbilla por encima de la barra, descenso completo."),
    ("Dominada en agarre neutro", "Espalda", "Dominada supina", 8,
     "Palmas enfrentadas, la más amable con el hombro."),
    ("Dominada arquera", "Espalda", "Dominada prona", 6,
     "Subes hacia una mano y la otra queda estirada; avanzada."),
    # -- pierna --------------------------------------------------------------
    ("Sentadilla asistida", "Pierna", None, 20,
     "Agarrado a algo para aliviar peso. Espalda recta."),
    ("Sentadilla", "Pierna", "Sentadilla asistida", 20,
     "Hasta unos 90° de rodilla, espalda recta, rodillas siguiendo los pies."),
    ("Zancada", "Pierna", "Sentadilla", 12,
     "Complemento mío, no es del libro. Paso largo al frente y baja la rodilla trasera; por pierna. Es el gesto base de la estocada."),
    ("Zancada lateral", "Pierna", "Sentadilla", 12,
     "Paso al lado y flexiona esa pierna; por lado. Ayuda a ganar movilidad de cadera."),
    ("Sentadilla búlgara", "Pierna", "Zancada", 12,
     "Pie trasero elevado en un banco; por pierna. Pierna delantera hace todo el trabajo."),
    ("Zancada explosiva con cambio", "Pierna", "Zancada", 10,
     "Saltas y cambias de pierna en el aire. Potencia de pierna para el avance; sólo con tobillos y rodillas ya fuertes."),
    ("Sentadilla explosiva", "Pierna", "Sentadilla", 12,
     "Subes con salto. Aterriza suave."),
    ("Sentadilla corta a una pierna", "Pierna", "Sentadilla búlgara", 8,
     "Sobre una pierna, rango corto; por pierna. Equilibrio y control de rodilla."),
    ("Pistol squat asistida", "Pierna", "Sentadilla corta a una pierna", 6,
     "Sentadilla a una pierna agarrándote a algo; por pierna."),
    ("Pistol squat", "Pierna", "Pistol squat asistida", 5,
     "Sentadilla completa a una pierna; por pierna. Meta de largo plazo."),
    ("Levantamiento de gemelos", "Pierna", None, 25,
     "Elevación de talones en el suelo o en un escalón. Pantorrilla y tobillo: rebote en la guardia."),
    ("Curl femoral con peso corporal", "Pierna", None, 12,
     "Tumbado, talones apoyados, subes la cadera flexionando las rodillas. Isquios, que equilibran la zancada."),
    ("Sentadilla estática contra la pared (s)", "Pierna", None, 60,
     "Espalda en la pared, muslos horizontales: reps = segundos."),
    # -- core ----------------------------------------------------------------
    ("Plancha abdominal (s)", "Core", None, 60,
     "Antebrazos y puntas de pies, cuerpo recto: reps = segundos."),
    ("Plancha lateral (s)", "Core", "Plancha abdominal (s)", 45,
     "De lado sobre un antebrazo, cadera arriba; por lado, reps = segundos. Oblicuos para la rotación del tronco."),
    ("Crunch corto en suelo", "Core", None, 25,
     "Sólo se despegan los hombros del suelo."),
    ("Tijeras en suelo", "Core", None, 30,
     "Piernas casi estiradas cruzándose arriba y abajo, lumbar pegada al suelo."),
    ("Leg raise en suelo", "Core", "Crunch corto en suelo", 15,
     "Piernas elevadas y bajadas sin tocar el suelo, lumbar pegada."),
    ("Russian twist crunch", "Core", None, 20,
     "Crunch girando el torso a un lado y a otro. Rotación del tronco para el combate."),
    ("Windshield wipers en suelo", "Core", "Leg raise en suelo", 10,
     "Piernas elevadas bajando a un lado y al otro, como un limpiaparabrisas; por lado."),
    ("Knee raise en barra", "Core", "Leg raise en suelo", 12,
     "Colgado, subes las rodillas al pecho sin balancear."),
    ("L-sit raise en barra", "Core", "Knee raise en barra", 8,
     "Colgado, piernas estiradas hasta formar una L."),
    ("Windshield wiper en barra", "Core", "L-sit raise en barra", 5,
     "Colgado, piernas arriba bajándolas de lado a lado. Avanzado."),
]

# (nombre, notas, [(ejercicio, series, reps)])
TEMPLATES: list[tuple[str, str, list[tuple[str, int, int]]]] = [
    ("Nivel 0 — base",
     "Rutina de arranque de la guía, para quien aún no hace las básicas de tren superior. "
     "2-3 veces por semana, no en días seguidos, hasta que se sienta fácil. "
     "Calentamiento articular antes y estiramientos después.",
     [("Dominada asistida", 4, 5), ("Flexión inclinada", 4, 10),
      ("Remo australiano alto", 4, 8), ("Sentadilla", 4, 10)]),
    ("Cuerpo completo A",
     "Siguiente paso tras el nivel 0 (con la barra del parque). Un ejercicio por zona: "
     "tirón, empuje, pierna, core y hombro.",
     [("Dominada negativa", 4, 5), ("Flexión", 4, 10), ("Zancada", 4, 10),
      ("Plancha abdominal (s)", 4, 30), ("Pike push-up", 4, 6)]),
    ("Cuerpo completo B",
     "Alterna con la A. Más tirón de espalda y agarre, y core colgado.",
     [("Remo australiano bajo", 4, 10), ("Fondo en banco", 4, 12),
      ("Sentadilla búlgara", 4, 8), ("Knee raise en barra", 4, 8),
      ("Flexión declinada", 4, 8), ("Dead hang (s)", 3, 30)]),
    ("Softcombat — lanza corta y estoque",
     "Diseño propio, no es del libro: es una hipótesis para tu práctica, no una pauta probada. "
     "Pierna unilateral y de avance (zancadas), tobillo y pantorrilla, hombro que sostiene el arma, "
     "rotación de tronco y agarre. Como complemento a 2 cuerpos completos por semana, no en lugar de ellos.",
     [("Zancada", 4, 10), ("Zancada lateral", 3, 10), ("Levantamiento de gemelos", 3, 20),
      ("Pike push-up", 4, 6), ("Russian twist crunch", 3, 15),
      ("Plancha lateral (s)", 3, 30), ("Dead hang (s)", 3, 30)]),
]
