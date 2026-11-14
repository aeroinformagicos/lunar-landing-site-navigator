<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# 14 · Pautas UX de la sede de Málaga

Fuente: «Ruta de lanzamiento · Autoevaluación de diseño en 7 etapas» y «Guía de apoyo» del puesto UX de NASA Space Apps Málaga 2026 (Eliana Crivaro, Ladies That UX Málaga), entregadas el sábado 14. Este documento las traduce a reglas comprobables de nuestra web. **Completa** `10_interfaz.md`; si chocan, manda este documento, porque es el criterio con el que nos mirarán en la demo. La revisión se hace en la tarea T-53.

Leyenda: **[I]** imprescindible para dar «GO» en la hoja; **[E]** extra, suma pero no es obligatorio.

## 1. Propósito a primera vista

- **[I]** La primera pantalla dice qué es y para quién, sin pulsar nada. Bajo el título, una línea fija (también en móvil):
  `Compare Moon landing sites and dates by when the Sun (power) and Earth (radio contact) are above the real horizon.`
- **[I]** Lo que más destaca es la acción principal. En el primer acceso (sin parámetros en la URL) aparece encima de la vista principal una tarjeta de bienvenida con:
  - el par de la demo ya cargado detrás (como pide `10` §1.8);
  - un único botón primario `Take the 60-second tour` (abre `Learn`, paso 1 de la historia F15);
  - un enlace secundario `Explore on my own` que cierra la tarjeta.
  La tarjeta no vuelve a salir si se ha cerrado (`localStorage`, envuelto en `try/catch`) ni si la URL trae estado (F16).
- **[E]** Alguien de otro equipo lo entiende en 5 segundos: lo comprueban A3 o I3 con una persona ajena antes del domingo 11:30.

## 2. Flujo principal

El flujo que se enseña en la demo, de principio a fin y sin salidas muertas:

1. Abrir la web → tarjeta de bienvenida.
2. `Take the 60-second tour` → historia guiada (`Back`, `Next`, `n / 7`).
3. Último paso de la historia → botón `Try it yourself` que deja el escenario de la demo en `Explore`.
4. Cambiar fecha o sitio → las cifras y el panorama cambian con respuesta visible (§7).
5. Comparar A y B → veredicto en lenguaje llano (F18).

- **[I]** Desde cada pantalla se puede seguir o volver: la historia tiene `Back` y `Exit tour`; la página de validación tiene `Back to the app`; el modo `Plan` en móvil tiene `Back to Explore`.
- **[E]** Se sabe en qué paso se está: contador `n / 7` en la historia y modo activo marcado en el selector (no solo por color: subrayado + `aria-selected`).

## 3. Jerarquía y patrones

- **[I]** Una sola acción primaria por pantalla (botón relleno con `--c-accent`); el resto, botones secundarios (borde) o enlaces. Por vista: bienvenida → `Take the 60-second tour`; historia → `Next`; Explore → `Play`; validación → ninguna.
- **[I]** Lo que se repite es idéntico en toda la app: un solo componente `Button` (variantes `primary`, `secondary`, `ghost`), un solo `ScenarioCard`, un solo `MetricTile`, un solo `DataState`. Prohibido estilar botones a mano dentro de una vista.
- **[E]** Patrones conocidos: `✕` para cerrar, `?` para ayuda, `⏵/⏸` para reproducir, icono de enlace para `Share`, lupa en el buscador de sitios.

## 4. Legibilidad

- **[I]** Texto principal 16 px en web (ya en `10` §12); texto secundario nunca por debajo de 14 px en las vistas de la demo (el mínimo de 12 px de `10` §12 queda solo para ejes de gráficos y notas al pie).
- **[I]** Palabras del usuario, no del código. Nunca se ve en la interfaz (salvo en la página de validación, que es técnica a propósito): identificadores (`blue-ghost-1`, `no_go`, `smooth`), nombres de marcos o funciones (`MOON_ME`, `spkcpo`), unidades sin espacio ni nombre. Cambios de texto en `en.json`:
  - pestaña `Cross-section` → `Terrain profile`;
  - estados `go` / `marginal` / `no_go` → `Works` / `Tight` / `Doesn't work` (con su icono ✓ ! ✕);
  - `Longest night` se mantiene; `Earth link` → `Earth contact`.
  Si un texto exacto de `10` §7 cambia, se cambia allí y en `en.json` en la misma tarea.
- **[I]** Las cifras principales del panel derecho se leen desde 2 m: valor a 28 px como mínimo, etiqueta a 14 px.
- **[E]** Máximo 3 familias tipográficas (recomendado: una sans para todo y una monoespaciada solo para coordenadas y horas).

## 5. Contraste y color

- **[I]** Contraste 4,5:1 para texto y 3:1 para texto grande, iconos, bordes y elementos de gráficos (ya en `10` §2), comprobado también con el brillo bajo y **en el proyector de la sala** durante la prueba técnica del domingo (16:30–17:15). El texto secundario no usa `--c-none` sobre `--c-surface` si no llega a 4,5:1.
- **[I]** Nada importante depende solo del color: estados con icono y palabra; Sol, Tierra, ambos y ninguno con trama (ya en `10` §2); escenarios con letra y forma.
- **[E]** Con un filtro de escala de grises (`filter: grayscale(1)` en las herramientas del navegador) la demo se sigue entendiendo. Se comprueba en T-53 con una captura.

## 6. Tamaños para pulsar

- **[I]** Toda zona pulsable mide al menos 44 × 44 px (ya en `10` §12), incluidos el selector de modo, las pestañas, los botones de tiempo y los marcadores del mapa; el área es el botón entero, no solo el icono.
- **[I]** Al menos 8 px entre zonas pulsables vecinas.
- **[I]** Nada depende de pasar el ratón por encima: las ayudas contextuales (`10` §1.7) se abren también al tocar, y la información del cursor sobre gráficos tiene alternativa al tocar.
- **[E]** Se lee desde 2 m con el portátil sobre la mesa (ver §4).

## 7. Respuesta del sistema

- **[I]** Cada acción tiene respuesta visible en menos de 100 ms: cambio en pantalla, indicador de carga (`DataState`, `10` §9) o mensaje. Los cálculos de más de 300 ms (sitio óptimo F32, carga del mapa) muestran texto de progreso (`Finding the best site… 40 %`) y se pueden cancelar.
- **[I]** Los errores dicen qué ha pasado y cómo seguir, en lenguaje llano, con botón `Retry` u otra salida. Nunca se muestran `undefined`, `NaN`, `null`, `[object Object]`, códigos HTTP ni trazas.
- **[E]** Las pantallas vacías dicen qué hacer (p. ej. comparación sin escenario B: `Add a second site to compare.` con botón `Add site`).

## 8. Alerta roja: lo que no puede aparecer en la demo

- Textos o datos de relleno (`lorem ipsum`, `TODO`, `Title here`, datos sintéticos de `contract/examples` en la versión publicada).
- Botones que no hacen nada en el flujo que se enseña. Regla: una funcionalidad que no está terminada **no se pinta** (bandera en `config.json`), en vez de mostrarse desactivada.
- Errores técnicos a la vista (`Error 500`, `undefined`, mensajes de consola en pantalla).
- Estados que solo se distinguen por el color.

## 9. Comprobación

- Prueba automática (Playwright, junto a B9): ninguna vista del flujo del §2 contiene en el DOM visible `undefined`, `NaN`, `null`, `lorem`, `TODO`; todos los elementos con `role="button"` o `<button>` del flujo miden ≥ 44 × 44 px; la tarjeta de bienvenida aparece sin parámetros y no aparece con URL de F16.
- Revisión humana: I3 y A3 recorren la «Ruta de lanzamiento» impresa (7 etapas) con la versión publicada el domingo antes de las 11:30 y pasan por el puesto UX si alguna etapa queda en «Aún no».
