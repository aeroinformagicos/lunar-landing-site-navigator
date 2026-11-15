<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Noche del 14 al 15 · Resumen del trabajo de I1 (Claude Code por delegación)

Encargo nocturno de I1, partes A y B. Decisiones D-120 a D-123, firmadas «Decidido por Claude Code por
delegación de I1». Ninguna petición integrada: las integra I3.

## Parte A

| Tarea | Petición | Rama |
| --- | --- | --- |
| T-64 · errores de la 2D, paneles y móvil | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/55 | `t-64-fixes-v2` |
| T-92 · el par de la demo en el paso 2 de Learn | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/56 | `t-92-par-demo` |
| T-91 · regiones de 2022 como puntos | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/58 | `t-91-regiones-2022` |
| T-93 · vista «Power & comms» (borrador, sale de `t-64-fixes-v2`) | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/61 | `t-93-energia-comunicaciones` |

### T-64 (D-120) · `docs/handoff/T-64.md`
- **Qué era cierto:** a) en parte: la barra sí avanzaba, pero el cursor era una raya de 2 px sin relleno y
  la muesca fija de la puesta de Sol del día 6 parecía el asa «pillada en el medio»; en la 2D la vista se
  recentraba en el Sol en cada fotograma, así que el Sol no se movía. b) cierto en la 2D: la traza punteada
  pasaba por detrás de las cifras del rótulo (halo al 70 %) y el resumen reconstruía sus párrafos en cada
  fotograma (`key` = texto). c) cierto. d) cierto (sin leyenda; día de misión a 18 px). e) cierto a
  1280 × 720 (Setup cortado y resumen transparentándose) y, además, en el móvil los paneles pasaban por
  encima de la barra de tiempo fija, y los diálogos (selector de sitio) quedaban por debajo de la cabecera,
  las píldoras, los paneles y el minimapa. f) en parte: sin desplazamiento horizontal, pero la barra fija
  tapaba el veredicto y las cifras, las etiquetas se partían a 360 px y en la tableta las píldoras se
  montaban sobre la marca y el modo.
- **Qué se hizo:** relleno del tiempo transcurrido, asa y leyenda en la barra; vista 2D quieta al
  reproducir (gira solo cerca del borde) y traza recorrida continua; halo opaco y `key` por posición;
  indicador de rumbo (brújula) en lugar de la tira de 360°; leyenda y hora grande en Timeline; paneles que
  terminan sobre la franja inferior medida y se desplazan dentro; diálogos por encima de todo; disposición
  de tableta y móvil (se mantiene D-112 g, sin hojas inferiores).
- **Medido:** Lighthouse accesibilidad 100/100 en 2D y 3D; sin desplazamiento horizontal en los cinco
  tamaños ni al 200 %; `e2e/v2` en verde.

### T-92 (D-121) · `docs/handoff/T-92.md`
- **Qué era cierto:** «los dos no funcionan» **no se reproduce** como veredicto (A `Works`, B `Doesn't work`
  en v2 2D, v2 3D, v1 y la web publicada; ni «Tight», ni fecha, ni requisitos, ni altura). Lo que confunde:
  el texto «The other has neither» es **falso** (B tiene Sol al aterrizar y 43 % en la misión; le falta la
  Tierra) y las elevaciones negativas (−2,52°) sobre un horizonte que baja a ≈ −3,8° se leen como «bajo el
  horizonte».
- **Qué se hizo:** filas `Sun now` y `Earth now` frente al horizonte real en la comparación (v1 y v2) y un
  texto del paso 2 cierto para cualquier par de D-108. El par no cambia.

### T-91 (D-122) · `docs/handoff/T-91.md`
- Nombres comprobados con la nota de la NASA del 19/08/2022. Los cuadriláteros son cuadrados exactos de 16
  y 20 km en la proyección del mapa, con centros redondos: se aceptan los 8 (solo se usa el centro).
- 8 puntos `region2022-*` en el catálogo, fuera de las alternativas del par, grupo propio en el selector,
  marcas en el mapa 2D; `make sites` solo para ellos (10,4 s) y datos publicados.

### T-93 (D-123) · `docs/handoff/T-93.md`
- **Se puede con rigor** como estimación rotulada: reutiliza magnitudes ya validadas (elevación y
  distancia del Sol, fracción visible y no eclipsada del disco, margen de la Tierra) sin tocar 07 §12.
- Panel de referencia (1361 W/m², 30,7 %, 1 m², vertical hacia el Sol), batería para la noche más larga
  (100 W), horas de enlace sobre un mínimo editable y ventana sin enlace más larga; conmutador, aviso de
  estimación y diálogo de suposiciones; 11 pruebas unitarias calculadas a mano y una e2e. **A1 revisa las
  fórmulas.**

### Comprobaciones comunes
`make test` y `make check` en verde en las cuatro ramas. En `make test-all`, Python siempre en verde;
Playwright con 2–4 fallos por ejecución en paralelo, todos de la vista 3D o de tiempo de espera, que pasan
al repetirlos solos. `stage3d.spec.ts:58` (E1, sombra en la GPU) es intermitente **también en `main`**
(2 de 4 repeticiones): para I3.

### Para el README (no se toca esta noche)
- La vista 2D se queda quieta al reproducir y la brújula junto a la barra de tiempo la gira (T-64).
- La elevación se mide sobre el plano local (0° = Luna lisa); «hay Sol» y «hay enlace» los decide el margen
  sobre el horizonte real (T-92).
- Los 8 puntos de la lista de 2022 junto a las 9 regiones de 2024 (T-91).
- La vista «Power & comms» y su carácter de estimación (T-93), si se integra.

### Notas
- Una carpeta de trabajo temporal (`C:\lunar_noche\wt93`, fuera del repositorio) no se pudo borrar sin
  `rm`; no afecta al repositorio.

## Parte B · respaldos de I2 e I3

Antes de cada respaldo: `git fetch` y `gh pr list --state all`. Las tres tareas ya tenían rama y petición
de los compañeros, así que **se saltaron las tres** (no se creó ninguna rama `i1-respaldo-*`):

| Respaldo | Rama del compañero | Petición |
| --- | --- | --- |
| B1 · T-94 (I2) | `origin/t-94-revision-final` | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/59 |
| B2 · T-74 (I3) | `origin/t-74-realismo-3d` | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/57 |
| B3 · T-90 (I3) | `origin/t-90-extras-aeros` | https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/60 (borrador) |

Posibles choques al integrar con las peticiones de la parte A (para I3):
- T-64 toca `BottomStrip.tsx`, `Stage2D.tsx`, `Panels.tsx`, `ShellV2.tsx`, `v2.css`, `app.css` y `en.json`;
  T-90 y T-74 probablemente también (`v2.css`, `en.json`, `Panels.tsx`). Integrar T-64 primero y resolver
  después.
- T-92 cambia el texto del paso 2 en `storySteps.ts` (y su prueba y `10` §11); T-90 toca la historia guiada.
- T-91 cambia `selectors.ts` (grupos del selector); T-90 también menciona el orden del selector.
- La marca 3D de los puntos de 2022 (`candidate_region` con `region_id` null) es de T-74.
