<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Consejos de UX de los mentores · rama `rc-final` (domingo 15)

Once consejos de los mentores, apuntados por I2. Cada uno se comprobó en la vista previa local
(`?vm=2d`, 1440×900, 1280×720 y 390×844) y solo se hizo si era pequeño y sin riesgo. Sin cambios en
cálculos, datos, `contract/` ni `tests/golden/`. Todo texto visible en inglés y en `web/src/i18n/en.json`.

Fuera de alcance por acuerdo con I1 (lo arregla en `i1-fix`): tarjeta de Learn, barra de opacidad del Map,
Sol cuadrado en 3D, botón Apply de la fecha y P-04, P-05, P-06, P-07, P-08, P-09, P-10, P-12, P-14, P-15.

## Tabla

| # | Consejo | Estado | Qué se hizo / por qué no | Decisión · commit |
| --- | --- | --- | --- | --- |
| 1 | Contraste de los textos | Comprobado, sin cambios | Medido con un barrido de contraste WCAG sobre todo el texto visible (Explore 1440×900, Replan, móvil 390×844): 0 fallos AA. Único aviso: «3D» desactivado en móvil (3.0:1), exento por ser un control desactivado y va tachado. Se corrigió además un uso de color (ver 6). | — |
| 2 | Hover de información | Hecho | La ayuda ⓘ de Sunlight, Earth contact y Longest night se abre al pasar el ratón y al enfocar con teclado, como nota flotante que no mueve la maqueta; el clic la fija y otro clic la cierra. | D-176 · `84cdee8` |
| 3 | Reducir el tamaño del eslogan | Hecho | Titular de la tarjeta de bienvenida de 24 a 20 px. El lema bajo «Lunar Sightline» ya está a 13 px y no se reduce más por legibilidad. | D-172 · `13d3e76` |
| 4 | Accesibilidad mundial (WCAG) | Parcial | Lo nuevo mantiene icono + palabra (nunca solo color), foco por teclado en la ayuda (2) y `aria-expanded` correcto. Una auditoría completa WCAG 2.2 no cabe en esta ventana; las zonas pulsables pequeñas y los textos de 12–13 px siguen en P-13 / P-20. | D-170, D-174, D-176 |
| 5 | Padding e interletrado de la información principal | Hecho | Frase principal bajo las cifras: más margen superior, interlineado 1.6 e interletrado 0.01em. Cabe a 1280×720. | D-175 · `2c5bbe4` |
| 6 | Código de color para alertas | Hecho | Un solo código: verde Works / met, amarillo Tight, rojo Not suitable / not met, siempre con icono (✓ ! ⊗). Antes «not suitable» era naranja en el ranking y en Compare y rojo en la matriz, y «not met» era ámbar como «tight». | D-174 · `2ae40c4` |
| 7 | «Doesn't work» parece un fallo de la página | Hecho | El veredicto pasa a **«Not suitable»** (con el motivo al lado, p. ej. «Not suitable · No Earth contact at landing»), que se lee como resultado del análisis y no como error de la app. Leyenda de Replan y pruebas e2e actualizadas. | D-170 · `9e4cb18` |
| 8 | La X parece un botón para quitar algo | Hecho | Las marcas de estado ✕ pasan a **⊗** (x en un círculo) en el veredicto, requisitos, Compare, Replan y escenarios. Las ✕ que sí son botones de cerrar (diálogos, controles 3D) no cambian. La marca del pin 3D no se toca (carril 3D de I1). | D-170 · `9e4cb18` |
| 9 | No repetir «Not met»: columnas Met / Not met | Hecho | En «Now at site», los requisitos se reparten en dos columnas, **Met** y **Not met**, sin repetir «— not met» en cada fila; una columna vacía muestra «—». | D-171 · `075ef92` |
| 10 | Replan: espaciado distinto entre días | Hecho | Todas las columnas de días tienen el mismo ancho (44 px) y cifras tabulares, como un calendario: «+1 d» y «+10 d» quedan igual de separadas. No se tocó el botón Apply. | D-173 · `7483c4c` |
| 11 | Limitar la información que se ve a la vez | Descartado hoy | Es un cambio de arquitectura de la pantalla (qué se pliega y dónde), no pequeño ni sin riesgo a 3 h del envío, y choca con P-04 / P-12 / P-14 de I1. Propuesta para después: plegar por defecto la nota de referencia y el bloque de cuentas atrás en «Now at site», y dejar visibles solo veredicto, tres cifras y frase. | — |

## Decisiones

- **D-170** · «Doesn't work» → «Not suitable» y marca de estado ✕ → ⊗. Las ✕ que son botones de cerrar no cambian.
  *Decidido por Claude Code por delegación de I2.*
- **D-171** · Requisitos en dos columnas Met / Not met en el panel v2. La vista v1 (`?ui=v1`) conserva su lista.
  *Decidido por Claude Code por delegación de I2.*
- **D-172** · Titular de bienvenida a 20 px. *Decidido por Claude Code por delegación de I2.*
- **D-173** · Columnas de días de Replan con ancho fijo de 44 px (= objetivo táctil). *Decidido por Claude Code por delegación de I2.*
- **D-174** · Un único código de color de estado en v2, usando `--c-nogo` para «not suitable» y «not met».
  *Decidido por Claude Code por delegación de I2.*
- **D-175** · Más aire en la frase principal (margen 6 px, interlineado 1.6, interletrado 0.01em). *Decidido por Claude Code por delegación de I2.*
- **D-176** · Ayuda ⓘ de las cifras al pasar el ratón y al enfocar, como nota flotante. *Decidido por Claude Code por delegación de I2.*

## Pruebas

- Antes de cada commit: `npx vitest run` (440/440) y `tsc --noEmit` (la parte web; los cambios no tocan Python).
  `make test` completo tarda ~3 min (P-18), así que se pasó al principio y al final.
- Pruebas e2e actualizadas a «Not suitable» y ⊗: `b2`, `replan`, `v2/demo-pair`, `v2/extras`, `v2/shell`.
- Al final: `make check` en verde; `make test` en verde (las dos pruebas de tiempo `budgets.perf` solo fallan
  si se ejecutan a la vez que las e2e, por carga de CPU; solas pasan 5/5).
- e2e completas (`npx playwright test`): 135 pasan, 4 fallan, y **las mismas 4 fallan en `8fa670c`, antes de
  estos cambios** (comprobado en un worktree aparte): `story.spec.ts` (texto del paso 3, P-02),
  `validation.spec.ts:38` («Manual» en A3, D-151) y dos de `stage3d-scenes.spec.ts` (3D intermitente).
  No son de esta tarea; quedan para quien lleve P-02 / D-151 / 3D.
