<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Traspaso · Play y ayuda de los modos (D-183, D-184)

Rama `fix-play-follow-and-mode-help`, desde `main` (`v1.0`). Tres errores detectados por el equipo tras la entrega
(capturas `err_2` y `err_3`).

| Error | Causa | Arreglo | Decisión |
| --- | --- | --- | --- |
| Con Play la vista no sigue al Sol o a la Tierra (3D) | La 3D solo giraba una vez al cambiar de astro; la 2D ya seguía (D-120 a) | La cámara gira cada fotograma lo mismo que el acimut del astro en foco (órbita y a ras de suelo), conservando el encuadre. Girar a mano, `North up` o `Go to` lo detienen; `Centre on …` (también el ya activo) o `Recenter` lo reanudan. No en Learn | D-183 a |
| El resumen llano parpadea con Play (`err_2`) | Se reescribía en cada fotograma: elevación con dos decimales, cuenta atrás al minuto y la frase del disco, que aparece y desaparece cuando el Sol roza una cresta (medido: la altura del bloque no cambia, el texto sí) | Mientras se reproduce, solo palabras estables: sin elevación, fracción del disco, porcentaje del eclipse ni distancia; sucesos a su hora UTC. En pausa, el texto completo | D-183 b |
| Texto bajo Explore / Plan / Learn (`err_3`) | Línea fija de T-90 (propuesta 8) | Nota flotante solo con el puntero encima (o foco de teclado), estilo de D-176, Esc la cierra; textos nuevos más cortos. Descripción accesible de cada pestaña intacta | D-184 |

## Pruebas
- Unitarias nuevas: `stage3d/__tests__/follow.test.ts` (`followTurn`) y el bloque «while playing» de
  `summary/summarize.test.ts`.
- e2e nueva: `e2e/v2/play.spec.ts` (3D sigue al Sol, se detiene al girar a mano y se reanuda con `Centre on Sun`;
  el resumen no cambia en 1,5 s de reproducción y vuelve al texto completo en pausa). 3 de 3 repeticiones en verde.
- e2e cambiada: `e2e/v2/extras.spec.ts` (8), la nota solo aparece al pasar el ratón.

## Queda
- Revisarlo en la vista previa en un portátil con ratón y en el móvil (en táctil la nota de los modos no aparece:
  la ayuda sigue en la descripción accesible y en Learn).
