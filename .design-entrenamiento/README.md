# Maquetas del módulo Entrenamiento

Las ocho pantallas del módulo, dibujadas contra los tokens reales del repo para
revisarlas antes de escribir código. El canvas vive en Claude Design; esto es su
fuente.

```bash
node build.mjs   # parts/*.body.html + _prelude.txt -> *.dc.html
```

## Qué hay aquí y qué no

Se guarda sólo lo que no se puede deducir:

| | |
|---|---|
| `_prelude.txt` | La paleta, los rangos de card, el nudo, la cadena y el filete, copiados **literalmente** de `theme.css`, `index.css` y `ornamento.css`. Un artboard no comparte nada en tiempo de ejecución con otro, así que el prelude se repite en los ocho — pero se escribe una vez. |
| `parts/*.body.html` | El cuerpo de cada pantalla. |
| `canvas.json` | Posiciones, títulos y las notas al margen. |
| `build.mjs` | Ensambla los dos anteriores. |

`*.dc.html` y `entrenamiento-grimoire.html` **no** se versionan: son salida de
`build.mjs` y del sembrador. Guardarlos sería una segunda fuente de verdad de lo
mismo, que es la deriva contra la que está escrito `theme.css`.

## Si cambia el sistema visual

`_prelude.txt` es una **copia**, no una referencia: si `theme.css` mueve un
token, aquí no se entera. Antes de retocar las maquetas conviene comprobar que
los valores siguen siendo los mismos, o se estará midiendo contra una paleta que
ya no existe.

## Las decisiones que cargan peso

Están escritas en las notas al margen del canvas y en los comentarios de cada
`parts/*.body.html`, junto al marcado que las aplica. En una línea:

- **El oro no toca un dato de entrenamiento.** Peso, volumen, 1RM, ritmo y peso
  corporal van en tinta. Sólo llevan oro el rito marcado (que viene de Hábitos),
  el XP y una meta de fuerza declarada y cumplida.
- **Un PR no declarado es dato, no medalla.** Rombo en tinta sobre la curva.
- **La fecha manda sobre el rito.** Sólo una sesión de hoy lo marca; una con
  fecha pasada se anota y no paga XP.
- **Ninguna rampa acaba en dorado.** Más volumen no es inequívocamente mejor.
