<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# 15 · Interfaz v2 (2D, armazón y estilo)

Rediseño completo de la presentación. **Ningún cálculo ni dato cambia: solo la presentación.** Dueño: I2 (carril 2). La vista 3D es del carril I3 (`16_vista_3d.md`); los dos carriles se encuentran en el conmutador 3D/2D del escenario central (§4). Tarea de especificación: T-60. Tarjetas: T-61, T-62 y T-63 (§12). Decisiones: D-98 a D-105.

**Relación con los demás documentos.** Este documento **completa** `10_interfaz.md`: la funcionalidad, los estados, los textos exactos y la accesibilidad de `10` siguen valiendo salvo donde aquí se diga otra cosa. Para la v2, este documento manda sobre `10` en disposición, colores, tipografía y estilo. `14_ux_malaga.md` manda sobre los dos: es el criterio de la demo.

**Referencia visual** (en `docs/design/`):
- `open-horizon/C-Cinematic.dc.html`: maqueta de 1440 × 900 exportada de la herramienta de diseño. Sus estilos en línea son **los valores que hay que reproducir** (colores, tamaños, márgenes, radios, desenfoques); no es código para copiar. Se ve sirviendo la carpeta (`python -m http.server`) y abriendo el fichero.
- `ref-1-open-horizon.jpg`: la misma maqueta en imagen. Dirección visual y disposición de los paneles.
- `ref-2-emblema.jpg`: emblema y tipografía de «LUNAR SIGHTLINE».
- `ref-3-concepto.jpg`: inspiración (relieve con las trayectorias del Sol en ámbar y de la Tierra en cian). Es sobre todo para la 3D.

## 0. Contrato común con el carril 3D (I3)

Copiado literalmente del documento de reparto. Ninguno de los dos carriles lo cambia sin acordarlo con el otro.

- **Especificaciones:** `docs/spec/15_interfaz_v2.md` (I2: diseño, disposición, paneles, cabecera, tokens, conmutador y vista 2D) y `docs/spec/16_vista_3d.md` (I3: vista 3D). Tarjetas: I2 usa T-60 a T-69; I3 usa T-70 a T-79.
- **Estado:** el store gana `viewMode: '3d' | '2d'`. Por defecto `'3d'` en escritorio con WebGL; `'2d'` si no hay WebGL o la ventana mide menos de 768 px. Se guarda en el enlace compartible (F16) con el parámetro `vm`.
- **Armazón (I2):**
  - ocupa toda la ventana (100vw × 100vh);
  - dibuja el escenario central a pantalla completa, debajo de los paneles flotantes;
  - cuando la pestaña activa es Horizon, monta `<Stage3D/>` o `<Stage2D/>` según `viewMode`;
  - `Stage3D` se carga con `import()` dinámico desde `web/src/ui/stage3d/index.tsx` (`export default Stage3D`, sin props).
- **Stage3D (I3):**
  - llena su contenedor (`position: absolute; inset: 0`);
  - lee todo del store con los selectores existentes: escenario activo, cursor de tiempo, astro de enfoque, `Compare with smooth Moon` y escenarios;
  - no dibuja paneles propios, salvo un grupo pequeño de controles de cámara abajo a la derecha, por encima de la barra de tiempo;
  - los paneles del armazón quedan encima y solo capturan el puntero en su propia superficie.
- **Conmutador 3D/2D:** lo pone el armazón (I2), siempre visible sobre el escenario central, con el texto «3D» y «2D» (no solo iconos) y el atajo de teclado `V`.
- **Tokens** en `web/src/styles/tokens.css` (los crea I2; I3 los usa por nombre aunque aún no existan):

  | Token | Valor |
  | --- | --- |
  | `--c-bg-0` | `#0A0E17` |
  | `--c-bg-1` | `#162032` |
  | `--c-panel` | de `rgba(17,24,39,0.72)` a `rgba(30,41,59,0.72)`, con `backdrop-filter: blur(12px)` |
  | `--c-line` | `#334155` |
  | `--c-earth` | `#38BDF8` |
  | `--c-sun` | `#F59E0B` |
  | `--c-text` | `#F8FAFC` |
  | `--c-muted` | `#94A3B8` |

  - Prohibidos los morados, violetas, magentas y rosas, también en el eclipse.
  - Los demás colores de estado (go, marginal, no-go, ambos, eclipse) los fija I2 con esa restricción y siempre con icono y texto (§7).
- **Tipografía:** Inter (títulos, botones, paneles) y JetBrains Mono (coordenadas, horas, ángulos, cifras), empaquetadas con `@fontsource`, sin peticiones a Google Fonts.
- **Red de seguridad:**
  - la interfaz actual sigue disponible con `?ui=v1` hasta que la nueva pase todas las pruebas: Playwright B1, B2 y B9, validación, auditoría de accesibilidad ≥ 90 y `14_ux_malaga.md`;
  - ningún cálculo ni dato cambia: solo la presentación.
- **Referencia visual:** `docs/design/open-horizon/` (maqueta exportada `C-Cinematic.dc.html`; sus estilos en línea son la referencia de valores, no código para copiar) y `docs/design/ref-1-open-horizon.jpg`, `ref-2-emblema.jpg` y `ref-3-concepto.jpg`.

## 1. Principios de la v2

1. **El escenario central es el protagonista.** Ocupa toda la ventana y todo lo demás flota encima. Al entrar se ve la escena del sitio activo: la 3D si se puede, si no la 2D.
2. **Un centro de control discreto.** Pocas superficies, líneas finas de 1 px, paneles translúcidos con desenfoque y cifras en monoespaciada. Nada de barras de navegación pesadas.
3. **Nada se pierde.** Cada control, dato, estado, texto y atajo de la v1 tiene sitio en la v2 (inventario del §2). Lo que no cabe a la vista va a un panel o sección plegada.
4. **Etiquetas sobre el lienzo.** Lo que antes eran cajas de texto pasa a rótulos sobre la escena cuando se refiere a algo que se ve: «Sun · behind the ridge», «Earth», la cresta.
5. **Se pliega para dejar el centro despejado.** Cada panel se pliega a una pestaña lateral o a su cabecera, con una transición suave (§6.5).
6. **Siguen valiendo los principios 4 a 10 de `10` §1.** Panorama legible, color con icono o trama, accesibilidad desde el principio, cifras con unidad, ayuda y fuente, la primera pantalla ya cuenta una historia, extras ignorables y móvil en vertical.
   - El principio 2 de `10` §1 (una pantalla sin desplazamiento a partir de 1280 × 720) pasa a ser estricto: la v2 **nunca** desplaza la página en escritorio. Si algo no cabe, se pliega.

## 2. Inventario: de la v1 a la v2

Zonas de la v2 (figura del §3):
- **H**: cabecera, arriba a la izquierda;
- **P**: píldoras de escenarios, arriba en el centro;
- **M**: modo y Validation, arriba a la derecha;
- **L1**: panel Sites, a la izquierda;
- **L2**: panel Setup, a la izquierda;
- **R**: panel Now at site, a la derecha;
- **B**: franja inferior: veredicto, cifras, resumen, pestañas y tiempo;
- **K**: minimapa, abajo a la derecha;
- **S**: escenario central;
- **T**: conmutador 3D/2D;
- **D**: diálogos y hojas.

«Plegado» = dentro de una sección que empieza cerrada.

### 2.1 Cabecera, modo y tiempo (`10` §4)

| Elemento v1 | Texto o comportamiento que se conserva | Zona v2 |
| --- | --- | --- |
| Título enlazado al estado inicial | `Lunar Landing Site Navigator` sigue en `app.title`, en `<title>` y como nombre accesible del enlace del emblema (§6.1); el rótulo visible es `Lunar Sightline` | H |
| Línea de propósito (`14` §1) | `app.tagline`: la v2 enseña el lema del emblema `When will your landing site see the Sun and Earth?` (`app.motto`), y `app.tagline` va como descripción accesible del enlace (D-99) | H |
| Selector de modo | `Explore`, `Plan`, `Learn`; `role="tablist"`, flechas | M |
| Validación | `Validation` (enlace a `#/validation`) | M |
| Compartir (Plan) | `Share`; aviso `Link copied`; si no hay portapapeles, campo con la URL | M (solo en Plan) |
| Fecha de aterrizaje | `Landing (UTC)`, `datetime-local`, paso 1 min; errores `Enter a valid date and time (UTC).` y `Date outside the supported range (1969–1972 and 2024–2044).` | L2 |
| `Link dates` | Casilla, marcada por defecto | L2 |
| Duración | `Mission`, `days`, 0,5–60 en pasos de 0,5; aviso `Mission extends beyond available ephemeris; results truncated.` | L2 |
| Deslizador del cursor | `aria-label="Time within mission"`, paso 10 min, flechas ±10 min, `PageUp/PageDown` ±1 día, `aria-valuetext` | B (barra de tiempo) |
| Lectura del cursor | `Day 3, 14:20` y `2027-08-04 14:20 UTC` en dos líneas | B |
| Reproducir / pausa | `Play` / `Pause` (nombre accesible); botón redondo de 56 px con ⏵/⏸ | B |
| Velocidad | `1 h/s`, `6 h/s`, `1 d/s`; nombre accesible `Playback speed {speed}` | B |
| ±1 h | Rótulos `−1 h` y `+1 h`; nombres accesibles `Back 1 hour` y `Forward 1 hour` | B |

### 2.2 Escenarios (`10` §5)

| Elemento v1 | Zona v2 |
| --- | --- |
| Lista de tarjetas A–D | **P**: una píldora por escenario con su marcador (círculo, cuadrado, triángulo, rombo), su letra y `short_name` (`A · Chang'e 7 site`); la activa con borde `--c-earth` y `aria-pressed="true"`. **L1**: la tarjeta completa del §5 de `10`: coordenadas, rótulo de relieve, aviso de Luna lisa, punto de malla, fecha, estado, `Change site`, `Duplicate`, `Remove` |
| Estados de la tarjeta: `Loading horizon…`, `Could not load this site's horizon.` + `Retry`, `Smooth Moon (no terrain)` + nota, `Nearest mesh point: … (500 m grid)` | L1, sin cambios de texto; en P, un punto de estado en la píldora (spinner o ⚠, siempre con su texto en `title` y nombre accesible) |
| `Add scenario` (deshabilitado con 4: `Maximum of 4 scenarios`) | P: botón `+` de 44 px, borde discontinuo, nombre accesible `Add scenario`; L1: botón con texto |
| `Compare` (con 2 o más) | P: enlace-botón `Compare`; L1: botón |
| Selector de sitio (diálogo) con búsqueda, grupos, `Custom coordinates` en Plan y sus errores | D: el mismo diálogo, con el estilo v2 (§6.6) |
| Comparación (F8): tabla, mini líneas temporales, `Close comparison`, `Add a second scenario to compare.` | S, en la hoja central de las vistas de datos (§5.3) |

### 2.3 Vistas (`10` §6)

| Elemento v1 | Zona v2 |
| --- | --- |
| Pestañas `Panorama`, `Timeline`, `Map`, `Terrain profile`, `Replan` (Plan) | B: pestañas de vista. `Panorama` pasa a llamarse **`Horizon`** (`tab.horizon`); `tab.panorama` se conserva para la v1. Orden: `Horizon`, `Map`, `Timeline`, `Terrain profile`, `Replan` (D-100) |
| Panorama de 40° (F3) | S: con `viewMode = '2d'`, `Stage2D` a pantalla completa (§4.2) |
| Zoom del horizonte ×10, `Solar disc visible: 62 %`, `Margin: +0.04°` | R: sección **`Horizon detail`** (plegada por defecto en escritorio; se abre sola en la historia guiada si el paso lo pide) |
| Tira de 360° con corchete y N, E, S, W | S: franja fina en la parte superior del escenario 2D, que sustituye a la regla de acimut de la maqueta (§4.2) |
| `Centre on Sun` / `Centre on Earth` | R: grupo de enfoque (píldoras de 32 px, como en la maqueta) |
| `Compare with smooth Moon` | R: casilla bajo el enfoque |
| `Terrain effect` (F4, tres líneas) | R: dentro de `Horizon detail` |
| Lectura bajo el puntero `Az 271.5° · El 0.92° · Horizon 0.88°` | S: rótulo que sigue al puntero en 2D; además, en la zona `aria-describedby` |
| `Sun is below the horizon`, `Panorama unavailable.` + `Retry`, `Loading…` | S: rótulo sobre el lienzo y `DataState` centrado |
| Línea temporal (F5, F6, F13) | S: hoja central (§5.3). Además, las barras de Sol y Tierra se dibujan dentro de la pista de la barra de tiempo (B), como en la maqueta |
| Corte del relieve (F12) y sus estados | S: hoja central |
| Mapa (F11) con controles, leyenda, escala y estados | S: el mapa ocupa el escenario completo (§5.3). K: minimapa que abre la pestaña Map |
| `Best site` / `Find the best site` (F32) con progreso y `Cancel` | S: panel flotante del mapa, arriba a la izquierda del escenario, a la derecha de L1/L2 |
| Replanificación (F10) | S: hoja central (solo Plan) |

### 2.4 Panel de cifras (`10` §6.6) y resumen (`10` §8)

| Elemento v1 | Zona v2 |
| --- | --- |
| Tres cifras `Sunlight`, `Earth contact`, `Longest night` con icono, unidad y ⓘ (textos de ayuda exactos) | B: cifras grandes a 56 px en JetBrains Mono 300 (44 px por debajo de 800 px de alto); debajo, `Sunlight · 95 %`, `Earth contact · 17 %`, `Longest night`; el ⓘ va junto a cada etiqueta y abre la ayuda como popover (también al tocar). La clase y el texto de `.figure__value` (`259 h · 77 %`) se conservan para B1 y las pruebas actuales (§11) |
| Ficha de estado `Works` / `Tight` / `Doesn't work` con icono | B: línea de veredicto encima de las cifras (`✕ DOESN'T WORK · NO SUN AT LANDING`): estado y primer motivo, en versalitas espaciadas. `data-testid="status-chip"` conserva el texto `✕ Doesn't work` (icono + estado) en un `span` propio |
| Requisitos `Sun at landing ✓`, `Earth at landing ✓`, `No night over 24 h ✓` | R: lista con iconos ✓/✕ y la palabra (`Sun at landing — not met`) |
| Bloque `Now`: elevaciones, disco, margen, dos cuentas atrás | R: lista de pares etiqueta/valor (`dl`) con los valores en mono y en el color del astro |
| Aviso de eclipse `Eclipse in progress: Earth covers 43 % of the Sun` | R: fila destacada con el icono de disco tapado; en S, rótulo sobre el Sol |
| Resumen llano (tres frases) | B: bajo las cifras, frases 1 y 2 visibles (máx. 560 px de ancho); la 3 dentro de `More` (plegado). `#plain-summary` se conserva |
| Tablas de datos ocultas (`ChartData`, sucesos y ventanas) | Sin cambios (visualmente ocultas) |
| Procedencia `Terrain: … · Ephemeris: JPL DE440 · Frame: MOON_ME` | B: línea inferior, 12 px mono |
| Pie `footer.credit` y `about.ai` | B: misma línea inferior, a la derecha, 12 px; en móvil, dentro de la hoja `About` (§9) |

### 2.5 Resto

| Elemento v1 | Zona v2 |
| --- | --- |
| Página de validación (F9), sus estados y `Back to the app` | Página completa con el estilo v2 (§5.4) |
| Historia guiada (F15): texto, `Back`, `Next`, `n / 7`, `Exit tour`, `Try it yourself`, `Restart`, teclas | Tarjeta flotante sobre el escenario, abajo en el centro; en Learn, la franja B se reduce a la línea de veredicto (§5.5) |
| Tarjeta de bienvenida (`14` §1) con `Take the 60-second tour` y `Explore on my own` | Tarjeta centrada sobre el escenario (§5.5) |
| Banda `Example data — not for use` | Banda fija arriba, a todo el ancho, por encima de todo |
| Aviso `Some settings in this link could not be restored.` + `Dismiss` | Aviso flotante bajo las píldoras P |
| Ayuda de atajos (`?`) | D: el mismo diálogo, con la línea nueva `V: switch 3D / 2D view` |
| Plan en móvil: `Plan mode needs a wider screen.` + `Back to Explore` | Igual, en una hoja a pantalla completa |
| Estados de arranque (`error.boot`, `error.contract`) | `DataState` centrado sobre el fondo de la v2 |
| Atajos `1`–`4`, `Espacio`, `[`, `]`, `?` | Sin cambios; `1` = Horizon, `2` = Map, `3` = Timeline, `4` = Terrain profile; nuevo `V` (§4.1) |

## 3. Disposición en escritorio

Lienzo de referencia: 1440 × 900 (la maqueta). Pantalla única de 100vw × 100vh, `overflow: hidden`.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│  ⊕ LUNAR SIGHTLINE            (○ A · Chang'e 7 site) (□ B · Shackleton floor) (+) Compare     │
│    When will your landing…                                    Explore Plan Learn │ Validation │
│                                            [ 3D | 2D ]                                         │
│ (⊕ Sites)                                                              ┌────────────────────┐ │
│ (≡ Setup · 1 Aug 2027 · 14 d)                                           │ Now at site A    > │ │
│                                                                         │ Sun elevation 0.24°│ │
│                       ESCENARIO CENTRAL A PANTALLA COMPLETA             │ … requisitos …     │ │
│                       (Stage3D o Stage2D; otras vistas en hoja)         │ [Centre on Sun]    │ │
│                                                                         │ ☐ Compare smooth   │ │
│                                                                         │ ▸ Horizon detail   │ │
│                                                                         └────────────────────┘ │
│ ✕ DOESN'T WORK · NO SUN AT LANDING                                               ╭──────────╮ │
│ 319 h       57.7 h       17.4 h                                                  │ minimapa │ │
│ Sunlight·95%  Earth contact·17%  Longest night                                   │ SOUTH POLE│ │
│ The Earth is in view, but the Sun is hidden…                                     ╰──────────╯ │
│ HORIZON  MAP  TIMELINE  TERRAIN PROFILE                                                       │
│ (⏵)  −1 h  +1 h  (1 h/s)  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   Day 0, 00:00          │
│ Terrain: LOLA polar 40 m + 120 m · Ephemeris: JPL DE440 · Frame: MOON_ME    Open source · …   │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Medidas (de la maqueta, a 1440 × 900)

| Zona | Posición | Tamaño y estilo |
| --- | --- | --- |
| Fondo | Toda la ventana | `linear-gradient(180deg, #0A0E17 0%, #101827 48%, #162032 62%, #0A0E17 100%)` |
| H, cabecera | `left: 64px; top: 44px`; emblema y textos con `gap: 14px` | Emblema 48 × 48; nombre 20 px, peso 500, `letter-spacing: 0.1em`, mayúsculas; lema 13 px `--c-muted`; separación de 3 px entre las dos líneas |
| P, píldoras | Centradas, `top: 48px`, `gap: 8px` | Alto 44, `padding: 0 16px`, radio 22, borde 1 px (`--c-earth` la activa, `--c-line` las demás), fondo `rgba(17,24,39,0.7)`, `backdrop-filter: blur(10px)`, texto 13 px (600 la activa, 500 el resto, `#CBD5E1` las inactivas); marcador de 12 px; `+` de 44 × 44 con borde discontinuo `#475569`; `Compare` sin borde en `--c-earth` |
| M, modo | `right: 64px; top: 48px`, `gap: 6px` | Botones de 44 px de alto, `padding: 0 10px`, 13 px; activo en `--c-text` con peso 600 y subrayado de 2 px `--c-earth` a 8 px del texto; inactivos en `--c-muted`; separador vertical de 1 × 20 px `--c-line` antes de `Validation` (y de `Share` en Plan) |
| T, conmutador | Centrado, `top: 104px` | Segmentado de dos botones de 36 × 56 px (44 × 56 en táctil), radio 18, borde `--c-line`, fondo `--c-panel`; activo con fondo `rgba(56,189,248,0.14)` y texto `--c-text`, 600; textos `3D` y `2D` en JetBrains Mono 13 px |
| L1, L2, pestañas plegadas | `left: 0; top: 150px`, columna con `gap: 8px` | Alto 44, `padding: 0 14px 0 12px`, borde 1 px `--c-line` sin borde izquierdo, radio `0 22px 22px 0`, fondo `rgba(17,24,39,0.75)`, desenfoque 10 px, texto 12 px 500; icono de 14 px `--c-muted`. L2 lleva el resumen `Setup · 1 Aug 2027 · 14 d` |
| L1, L2 abiertas | `left: 24px; top: 150px`, ancho 296 px | Como R |
| R, Now at site | `right: 24px; top: 130px`, ancho 296 px | Borde 1 px `--c-line`, radio 20, fondo `rgba(17,24,39,0.72)`, `backdrop-filter: blur(18px)`; cabecera `padding: 12px 10px 4px 20px`, título 15 px 600 y botón de plegar de 44 px; `dl` en rejilla `1fr auto` con `gap: 10px 12px`, `padding: 8px 20px 16px`, 13 px; secciones separadas por `border-top: 1px solid --c-line` con `padding: 16px 20px` |
| B, cifras | `left: 64px; top: 570px` (= `bottom: 330px`), columna con `gap: 18px` | Veredicto 13 px, 600, `letter-spacing: 0.14em`, mayúsculas, icono de 14 px; cifras con `gap: 48px`, `font: 300 56px/1 JetBrains Mono`, unidad a 20 px 400; etiqueta 13 px `#CBD5E1` con el porcentaje en mono; resumen 14 px, `line-height: 1.55`, `max-width: 560px`, `#CBD5E1`, cuentas atrás en mono `--c-text` |
| B, pestañas de vista | `left: 64px; bottom: 100px`, `gap: 20px` | Alto 44, sin relleno lateral, 12 px, `letter-spacing: 0.1em`, mayúsculas; activa con `border-top: 2px solid --c-text`, 600; inactivas `--c-muted`, 500 |
| B, barra de tiempo | `left: 64px; right: 64px; bottom: 32px`, `gap: 14px` | `Play` de 56 × 56, radio 28, fondo `--c-text`, icono `--c-bg-0`; `−1 h` y `+1 h` de 44 px, 13 px mono 500; velocidad de 32 px, radio 16, borde `--c-line`, 12 px mono; pista de 44 px con dos barras de 5 px (Sol arriba en `top: 12px`, Tierra en `top: 22px`, radio 3; tramos visibles en su color, resto `--c-line`), cursor de 2 × 34 px `--c-text`, marcas `D0…D14` en 10 px mono `--c-muted` (12 px, ver §8.4); lectura a la derecha `Day 0, 00:00` en 18 px mono y la fecha UTC en 11 px (12 px, §8.4) |
| B, procedencia y pie | `left: 64px; bottom: 8px` | 12 px mono `--c-muted` (la maqueta usa 10,5 px; se sube a 12 por `10` §12) |
| K, minimapa | `right: 64px; top: 566px` | Botón circular de 196 × 196, borde `--c-line`, fondo `rgba(10,14,23,0.8)`; dentro, anillos y ejes `--c-muted` al 40 %, contornos de región `--c-text` al 70 %, manchas de luz con degradado radial `--c-sun` al 45 %, escenarios con su marcador y letra, rótulo `SOUTH POLE` 10 px mono (12 px, §8.4). Nombre accesible `Open the map` |

### 3.2 Adaptación a otras ventanas de escritorio

La maqueta mide 1440 × 900; la demo se proyecta a 1280 × 720 o a 1920 × 1080. Reglas (D-101):

- Márgenes laterales de H, B y M: `clamp(24px, 4.44vw, 64px)` (64 px a 1440).
- Posiciones verticales: B se ancla abajo (`bottom`), no arriba. La línea de cifras queda a `bottom: 330px` en 900 px de alto. Por debajo de 800 px de alto, las cifras bajan a 44 px, el resumen muestra solo la frase 1 y K baja a 156 px.
- R y L abiertos: alto máximo `calc(100vh - 130px - 360px)`. Si el contenido no cabe, sus secciones se pliegan (nunca hay barra de desplazamiento interna en el panel, salvo en la lista del selector de sitio).
- Entre 768 y 1279 px de ancho: R se abre plegado (solo su cabecera) y K se oculta; la pestaña Map sigue disponible.
- Comprobación (T-63): a 1280 × 720, 1440 × 900 y 1920 × 1080 no hay desplazamiento de página, ningún panel tapa a otro y `Play` es visible.

## 4. Escenario central, conmutador 3D/2D y vista 2D

### 4.1 Montaje y conmutador

- `ui/shell/Stage.tsx` (I2) es el contenedor de `position: fixed; inset: 0`, debajo de todos los paneles (`z-index` 0).
- Con la pestaña Horizon monta `Stage3D` o `Stage2D` según `viewMode`. Con cualquier otra pestaña, monta la hoja de esa vista (§5.3) sobre un fondo de escena atenuado.
- `Stage3D` se carga así (D-102):

  ```ts
  const stage3d = import.meta.glob('../stage3d/index.tsx'); // {} si el carril 3D aún no está
  const load = stage3d['../stage3d/index.tsx'];
  const Stage3D = load ? lazy(load as () => Promise<{ default: ComponentType }>) : null;
  ```

  - Sin el módulo, o si `Stage3D` lanza un error (límite de errores de React), se monta `Stage2D` con el aviso `3D view unavailable on this device. Showing the 2D view.` (D-102).
  - Mientras carga: `Loading 3D view…` sobre el fondo, sin pantalla vacía.
- **Conmutador T:** dos botones `3D` y `2D` en un `role="radiogroup"` con nombre accesible `View mode`.
  - Atajo `V`: alterna entre los dos, salvo dentro de un campo de texto o un diálogo, y en Learn.
  - Si no hay WebGL o la ventana mide menos de 768 px: `3D` aparece deshabilitado con `title` `3D needs WebGL and a wider screen` (no se oculta, para que se entienda por qué).
  - El conmutador solo se ve con la pestaña Horizon; en las demás vistas no tiene efecto y se oculta.
- **Store** (`state/store.ts`): `viewMode: '3d' | '2d'` y `setViewMode`.
  - Valor inicial: `'3d'` si `matchMedia('(min-width: 768px)')` y un `WebGLRenderingContext` se puede crear; si no, `'2d'`.
  - URL (F16): clave `vm` (`'3d'` | `'2d'`) en el JSON del fragmento; ausente = valor inicial; valor no válido = se descarta con el aviso habitual.
  - Si el enlace pide `3d` y el equipo no puede, se usa `2d` sin aviso.

### 4.2 Vista 2D (`Stage2D`)

El panorama de 40° de `10` §6.1 a pantalla completa, con la estética de la maqueta. **La geometría no cambia:** misma proyección acimut-elevación con la misma escala en los dos ejes, centrada en el astro de enfoque, con las mismas reglas de centrado vertical y flecha `Horizon … below`.

- **Escala:** 40° de acimut en todo el ancho visible del escenario; la elevación mostrada es `alto × 40 / ancho` (25° a 1440 × 900). Esto sustituye el «alto 20°» de `10` §6.1 (D-103).
- **Horizonte a 58 % del alto.** El centro vertical deja la elevación del horizonte en el acimut del astro a `y = 0.58 × alto` para que el cielo tenga protagonismo (en la maqueta, el horizonte está entre `y = 456` y `y = 530` de 900). La regla de los 8° de `10` §6.1 se conserva: si el astro está a más de 8°, se centra en él.
- **Capas, de abajo arriba** (valores de la maqueta):
  1. Fondo: el degradado del §3.1. Sin estrellas en 2D, para no competir con los rótulos; la 3D sí las tiene.
  2. Halo del Sol: elipse con degradado radial `--c-sun` de 45 % a 0 %, radios 260 × 70 px a 1440 de ancho, centrada en el Sol aunque esté bajo el horizonte (es el resplandor tras la cresta).
  3. Trazas de la misión: la del Sol, `--c-sun`, 1,4 px, `stroke-dasharray: 2 7`, extremos redondos; la de la Tierra, `--c-earth`, 1,2 px, continua, al 75 %. **Se dibujan las dos**, no solo la del astro de enfoque (cambio respecto a `10` §6.1; las marcas cada 24 h se conservan en la del astro de enfoque).
  4. Terreno: relleno con `linear-gradient` vertical `#1E293B` → `#111827` (50 %) → `#0A0E17`; línea del horizonte `--c-text`, 1,4 px.
  5. Curvas de nivel decorativas bajo el horizonte: 4 arcos `--c-muted` al 16 %, 1 px. Solo estética; `aria-hidden`.
  6. Luna lisa (si está activa): línea discontinua `--c-muted`, 1,4 px, `6 4`.
  7. Discos: el Sol con su parte visible rellena y el contorno; si está bajo el horizonte, contorno discontinuo `3 3` de 1,5 px en `--c-sun`, como en la maqueta. La Tierra como disco de 16 px de radio mínimo (su tamaño real si es mayor) con su **fase**: la mitad iluminada calculada del ángulo Sol-Tierra visto desde el sitio (geometría de los vectores que ya da `core/frames`; sin física nueva). La parte oscura va en `--c-bg-0` con borde `--c-earth` de 1,5 px.
  8. Rótulos sobre el lienzo (§4.3).
  9. Reglas: marcas de elevación a la izquierda (cada 5°, rótulo en 10,5 px mono, 12 px por §8.4) y la tira de 360° arriba (siguiente punto).
- **Tira de 360° en la parte superior:** franja de 36 px de alto en `top: 0`, a todo el ancho, por debajo de la cabecera.
  - Contenido: el horizonte comprimido en `--c-muted` al 50 %; los dos astros como puntos de 6 px en su color; el corchete de la ventana de 40° (borde `--c-text` al 60 %, fondo blanco al 6 %); N, E, S, W en mono.
  - Comportamiento de `10` §6.1 punto 3: clic o arrastre y flechas, `role="slider"`.
  - Sustituye las marcas de acimut de la maqueta y añade los rótulos de acimut de la vista de 40° (`60°`, `65°`, `70° E`) justo debajo, en 10,5 px mono `--c-muted` (12 px, §8.4).
- **Interacción** (`10` §6.1): arrastrar desplaza el acimut, las flechas ±1°, y `Centre on …` (en R) vuelve a seguir al astro; la lectura bajo el puntero sigue al puntero como rótulo de 12 px mono con fondo `--c-panel`.
- **Rendimiento:** lienzo SVG para los rótulos y Canvas 2D para terreno, halo y trazas cuando el ancho supere 1600 px (`10` §13: panorama en Canvas). Respuesta al mover el cursor < 50 ms.
- **Accesibilidad:** `role="img"` con `aria-label` `40° view of the horizon centred on the {body}` y `aria-describedby` al resumen y a las tablas ocultas, como hoy; foco con flechas.

### 4.3 Rótulos sobre el lienzo

| Rótulo | Cuándo | Texto (clave) | Estilo |
| --- | --- | --- | --- |
| Astro visible | Su centro sobre el horizonte | `Sun` / `Earth` (`stage.sun`, `stage.earth`) y debajo `{el}° · margin {margin}` | Nombre 13 px Inter 600 `--c-text`; datos 12 px mono en el color del astro; a 24 px a la derecha del disco |
| Sol tras la cresta | Sol bajo el horizonte real pero sobre el liso | `Sun · behind the ridge` (`stage.sun_behind_ridge`) y `{el}° · margin {margin} · ridge {dist} away` | Como arriba; con una línea vertical de 1 px `--c-text` desde el punto de la cresta (círculo de 3 px) hasta el rótulo |
| Astro bajo el horizonte liso | Por debajo también de la Luna lisa | `Sun · below the horizon` / `Earth · below the horizon` | Como arriba, sin línea a la cresta |
| Eclipse | `eclipse.kind ≠ none` | `Eclipse · Earth covers {pct} of the Sun` | Línea extra bajo el rótulo del Sol, con el icono de disco tapado |
| Cresta | La cresta que bloquea al astro de enfoque cae en la vista | `Ridge {dist} away` (texto de `ridgeLabel`, como hoy) | Si ya hay rótulo «behind the ridge», no se repite |
| Línea de la Tierra | La Tierra visible | Línea vertical punteada `1 5` en `--c-earth` desde el disco hasta el horizonte | Solo decoración (`aria-hidden`) |

Los textos `Sun is below the horizon` y `Earth is below the horizon` (`pano.below`) se conservan como texto del rótulo para el lector de pantalla y las pruebas.

## 5. Paneles, hojas y páginas

### 5.1 Izquierda: Sites (L1) y Setup (L2)

- **Sites:** las tarjetas de escenario de la v1 (`ScenarioCard`) con el estilo v2: fondo transparente sobre el panel, separadas por `border-top` de 1 px.
  - Contenido: marcador y letra (14 px, 600); `short_name` (15 px, 600); coordenadas en mono 12 px; rótulo de relieve en 13 px `--c-muted` (aviso de Luna lisa en `--c-warn` con ⚠); fecha en mono 12 px; estado con icono.
  - Acciones `Change site`, `Duplicate` y `Remove` como botones de texto de 44 px de alto, 12 px (`ghost`).
  - Al final, `Add scenario` y `Compare`.
- **Setup:** `Landing (UTC)`, `Link dates`, `Mission … days`, con sus errores y avisos. Y la sección **`Requirements`**: `Sun at landing`, `Earth contact at landing`, `Longest night allowed (h)` y `Reset to defaults`.
  - Son los mismos controles y el mismo estado que hoy edita Replan. Replan los sigue mostrando: los dos editan `requirements` del store.
  - La pestaña plegada dice `Setup · {fecha corta} · {d} d` (`1 Aug 2027 · 14 d`).
- **Comportamiento:**
  - Plegados por defecto en escritorio (como en la maqueta), salvo L1 cuando hay más de 2 escenarios o al elegir `Add scenario`.
  - Abrir uno no cierra el otro; los dos abiertos se apilan con 8 px de separación.
  - `Esc` con el foco dentro pliega el panel y devuelve el foco a su pestaña.

### 5.2 Derecha: Now at site (R)

Título `Now at site {id}` (`panel.now_at`) y botón de plegar (`Collapse details` / `Expand details`).

Secciones, de arriba abajo:
1. **Telemetría** (`dl`):
   - `Sun elevation`, `Solar disc visible` y `Earth elevation` (con su margen en una segunda línea `margin +4.03°`);
   - la cuenta atrás del Sol (`Sunrise in` / `Sunset in`) y la de la Tierra (`Earthrise in` / `Earthset in`).
   - Valores en mono: los del Sol en `--c-sun`, los de la Tierra en `--c-earth` y las cuentas atrás en `--c-text`.
   - Son los mismos datos y los mismos `data-testid` (`sun-countdown`, `earth-countdown`) que el bloque `Now`. Los textos completos de la v1 (`Sun elevation 1.21°`…) siguen en el nombre accesible de cada fila.
2. **Requisitos:** lista con ✓ (`--c-go`) o ✕ (`--c-nogo`) y el texto; los no cumplidos añaden `— not met`.
3. **Aviso de eclipse**, si lo hay.
4. **Enfoque:** `Centre on Sun` y `Centre on Earth` (píldoras de 32 px; 44 px en táctil; activa con borde y texto del astro y fondo del astro al 12 %) y `Compare with smooth Moon`.
5. **`Horizon detail`** (plegada):
   - el zoom ×10 (184 × 92 px) con su rótulo;
   - `Solar disc visible` y `Margin`;
   - `Terrain effect` con sus tres líneas.

Plegado, R queda como su cabecera: 296 × 56 px. En Plan, R añade al final un enlace `Open Replan`.

### 5.3 Vistas de datos: la hoja central

Map, Timeline, Terrain profile, Replan y la comparación no son escenas a pantalla completa (salvo el mapa).

- **Hoja central:** se dibujan en una hoja con fondo `--c-panel`, borde `--c-line`, radio 20 y desenfoque 18 px.
  - Posición: entre los paneles, con `left: max(64px, L abierto + 24px)`, `right: R + 48px`, `top: 120px` y `bottom: 300px`.
  - Detrás queda el escenario atenuado (la última escena 2D con opacidad 0,35, o un fondo liso si no hay).
  - El contenido de cada vista es el de la v1, con los tokens y fuentes nuevos (§7). Los textos, estados e interacciones no cambian.
- **Mapa:** ocupa el escenario completo (es una escena), con sus controles en un panel flotante arriba a la izquierda (a la derecha de las pestañas L) y la leyenda y la escala abajo a la derecha, en lugar de K. `Best site` va en otro panel flotante bajo los controles. El clic en el mapa funciona igual (`on_map_click`).
- **Comparación (`Compare`):** sustituye a la hoja de la pestaña activa, como hoy sustituye a la vista principal; `Close comparison` la cierra.

### 5.4 Página de validación

- Página completa con el fondo de la v2.
- Arriba: `Back to the app` (botón secundario) y el título `How we know the numbers are right` en 28 px Inter 500.
- Tarjetas `headline` en paneles `--c-panel` de radio 20, con la tabla en mono.
- Contenidos, textos y estados de `10` §6.7 sin cambios.

### 5.5 Historia guiada, bienvenida y diálogos

- **Historia (Learn):** tarjeta `--c-panel` de radio 20, ancho `min(720px, 100vw - 48px)`, centrada, a 24 px sobre la barra de tiempo.
  - Contenido: texto 16 px; `Exit tour` (ghost), `Back` (secundario), `n / 7` en mono, `Next` o `Try it yourself` (primario) y `Restart`.
  - Mientras dura, la franja B solo enseña la línea de veredicto y la barra de tiempo; las cifras y el resumen se pliegan para no tapar.
  - Cada paso aplica su estado como hoy. La v2 añade dos cosas al estado de cada paso: `viewMode` (`'2d'` en los pasos 1 a 3 si la 3D no está o va lenta; lo decide I3 en `16`) y qué paneles se abren (paso 2: ninguno; paso 3: `Horizon detail`).
- **Bienvenida:** tarjeta centrada en el escenario, 520 px, radio 20, `--c-panel`, con el emblema a 64 px, `Lunar Sightline`, el lema, la frase de `welcome.body`, `Take the 60-second tour` (primario) y `Explore on my own`.
- **Diálogos** (selector de sitio, atajos): panel `--c-panel` opaco al 92 % (para leer bien), radio 20, sombra `0 24px 64px rgba(0,0,0,.5)`, fondo de página `rgba(10,14,23,0.6)`. Foco atrapado y `Esc` como hoy.

## 6. Componentes

### 6.1 Emblema (`ui/shell/Emblem.tsx`)

SVG propio que reproduce el isotipo de `ref-2-emblema.jpg`: **retícula orbital + curvatura lunar + nodo solar**. Geometría de la maqueta (`viewBox="0 0 44 44"`):
- círculo de la retícula `r=15`, 1 px `--c-muted`;
- cuatro marcas de 6 px en los ejes, 1 px `--c-muted`;
- arco lunar `M6 27 Q22 17 38 27`, 1,6 px `--c-text`;
- órbita: elipse `rx=19 ry=7`, girada −18°, 1,4 px `--c-earth`;
- nodo solar: círculo `r=3` en `(30, 24)`, relleno `--c-sun`.

`aria-hidden="true"`: el nombre accesible lo lleva el enlace que lo envuelve (`Lunar Landing Site Navigator — home`). Se usa a 48 px en la cabecera, a 64 px en la bienvenida y a 32 px en móvil. El mismo SVG es el `favicon.svg` (D-104).

### 6.2 Botones

El `Button` único de T-53 se conserva con nuevas variantes visuales (D-105):

| Variante | Uso | Estilo |
| --- | --- | --- |
| `primary` | Una por pantalla (`14` §3): `Play` en Explore y Plan, `Next` en la historia, `Take the 60-second tour` en la bienvenida | Fondo `--c-text`, texto `--c-bg-0`, peso 600; `Play` redondo de 56 px |
| `secondary` | Acciones normales | Borde 1 px `--c-line`, fondo transparente, texto `#CBD5E1`, radio 16 (32 px de alto en escritorio con puntero fino; 44 px en táctil) |
| `ghost` | Acciones de tarjeta y de texto | Sin borde, texto `--c-muted`, al pasar `--c-text` |
| `pill` (nueva) | Píldoras de escenario, enfoque Sol/Tierra y conmutador | Radio igual a la mitad del alto, borde `--c-line`, activa con borde de color y fondo del color al 12–14 % |
| `tab` (nueva) | Pestañas de vista y de modo | Sin fondo; activa subrayada (modo) o con borde superior (vistas) |

**Objetivos táctiles:** todos los botones miden 44 × 44 px como mínimo en táctil (`pointer: coarse`) y por debajo de 768 px, y mantienen 8 px de separación (`14` §6). En escritorio con puntero fino se permiten los 32 px de la maqueta para `secondary` y `pill`, con área de clic ampliada a 44 px mediante `::before` transparente (D-105).

### 6.3 Iconos

SVG de línea de 1,4–2 px, en `ui/common/Icon.tsx`, con `aria-hidden` (el texto va al lado o en el nombre accesible):
- ⊕ retícula: Sites;
- ≡ con dos nodos: Setup;
- ✓ y ✕: requisitos y estados;
- `!`: estado marginal;
- ⏵ y ⏸: reproducir y pausa;
- `+`: añadir;
- `>`: plegar o desplegar;
- ⓘ: ayuda;
- lupa: buscar sitios;
- enlace: `Share`;
- ⚠: Luna lisa;
- disco tapado: eclipse;
- lápiz, copiar y papelera: acciones de tarjeta en móvil.

No se usa ningún logotipo de la NASA.

### 6.4 Paneles flotantes (`ui/shell/FloatingPanel.tsx`)

- **Propiedades:** `id`, `title`, `side: 'left' | 'right'`, `defaultOpen`, `summary` (texto de la pestaña plegada), `icon` y `children`.
- **Accesibilidad:**
  - el botón de la cabecera o de la pestaña lleva `aria-expanded` y `aria-controls`;
  - el panel abierto es un `section` con `aria-labelledby`;
  - el estado abierto/plegado se guarda por visitante en `localStorage` (`llsn.panel.<id>`, siempre en `try/catch`).
- Fuera de su superficie no captura el puntero (`pointer-events: none` en el contenedor; `auto` en el panel).

### 6.5 Movimiento

Desplegar y plegar: `transform` y `opacity` en 200 ms `cubic-bezier(0.2, 0, 0, 1)`, desde el borde del que sale el panel. Otras transiciones:
- cambio de vista: fundido de 150 ms;
- conmutador 3D/2D: fundido cruzado de 250 ms.

Con `prefers-reduced-motion: reduce` no hay ninguna transición, ni la reproducción automática de la historia.

## 7. Sistema visual

### 7.1 Tokens (`styles/tokens.css`)

Además de los del contrato (§0):

| Token | Valor | Uso |
| --- | --- | --- |
| `--c-panel-a` / `--c-panel-b` | `rgba(17,24,39,0.72)` / `rgba(30,41,59,0.72)` | Los dos extremos de `--c-panel` (degradado vertical de los paneles) |
| `--c-panel` | `linear-gradient(180deg, var(--c-panel-a), var(--c-panel-b))` | Fondo de los paneles (con `backdrop-filter: blur(12px)`; R usa 18 px como en la maqueta) |
| `--c-text-2` | `#CBD5E1` | Texto secundario de paneles, resumen y etiquetas de cifras (contraste 13,0:1 sobre `--c-bg-0`) |
| `--c-dim` | `#475569` | Bordes discontinuos y elementos deshabilitados |
| `--c-sun-2` | `#FBBF24` | Texto del Sol pequeño y avisos sobre fondo oscuro |
| `--c-earth-2` | `#7DD3FC` | Enlaces al pasar el puntero |
| `--c-focus` | `#F0E442` | Contorno de foco de 2 px (sin cambios, `10` §12) |
| `--radius-pill` / `--radius-panel` / `--radius-sm` | `22px` / `20px` / `8px` | |
| `--blur-panel` / `--blur-pill` | `18px` / `10px` | |
| `--shadow-panel` | `0 12px 40px rgba(0,0,0,0.35)` | |
| `--font-sans` / `--font-mono` | `'Inter', system-ui, sans-serif` / `'JetBrains Mono', ui-monospace, monospace` | |

Los tokens de la v1 (`--c-bg`, `--c-surface`, `--c-text-muted`, `--c-border`…) se mantienen como alias de los nuevos (`--c-bg: var(--c-bg-0)`, `--c-surface: #111827`, `--c-text-muted: var(--c-muted)`, `--c-border: var(--c-line)`), para que las vistas de la v1 y las hojas centrales sigan funcionando sin reescribirlas.

### 7.2 Colores de estado y conceptos (sin morados ni rosas)

| Concepto | Token | Color | Icono | Trama | Contraste sobre `--c-bg-0` |
| --- | --- | --- | --- | --- | --- |
| Sol | `--c-sun` | `#F59E0B` | Círculo con rayos | Lisa | 9,0:1 |
| Tierra | `--c-earth` | `#38BDF8` | Círculo con arco | Rayas diagonales | 9,0:1 |
| Ambos | `--c-both` | `#2DD4BF` | Dos círculos enlazados | Cuadrícula | 10,4:1 |
| Ninguno | `--c-none` | `#64748B` | Círculo vacío | Puntos | 4,1:1 (gráficos ≥ 3:1) |
| `go` | `--c-go` | `#34D399` | ✓ | — | 10,0:1 |
| `marginal` | `--c-marginal` | `#FACC15` | ! | — | 12,6:1 |
| `no_go` | `--c-nogo` | `#F87171` | ✕ | — | 7,0:1 |
| Eclipse | `--c-eclipse` | `#E2E8F0` | Disco tapado | Rayas verticales | 15,7:1 |
| Aviso de Luna lisa | `--c-warn` | `#FB923C` | Triángulo | — | 8,5:1 |
| Terreno | `--c-terrain` | relleno `#1E293B` → `#0A0E17`; línea `#F8FAFC` | — | — | — |

- El eclipse deja el rosa `#CC79A7` de la v1 y pasa a un gris claro, con su trama de rayas verticales y el icono. Así se distingue del Sol (ámbar), de la Tierra (cian) y de ambos (turquesa) sin depender del color.
- `go` (`#34D399`) y ambos (`#2DD4BF`) son verdes parecidos, pero nunca aparecen solos: `go` siempre lleva ✓ y la palabra, y ambos siempre va con su trama de cuadrícula.
- Se comprueba en T-63 con el filtro de escala de grises y con un simulador de daltonismo (deuteranopía, protanopía y tritanopía).

### 7.3 Tipografía

| Uso | Familia y peso | Tamaño |
| --- | --- | --- |
| Nombre de la marca | Inter 500, mayúsculas, `letter-spacing: 0.1em` | 20 px |
| Títulos de panel | Inter 600 | 15 px |
| Texto de interfaz y botones | Inter 500 (600 en activos) | 13–14 px (16 px base para el cuerpo de texto) |
| Pestañas de vista y veredicto | Inter 500/600, mayúsculas, `letter-spacing: 0.1em` (vistas) y `0.14em` (veredicto) | 12–13 px |
| Cifras grandes | JetBrains Mono 300; unidad a 400 | 56 px (44 px por debajo de 800 px de alto; 28 px en móvil); unidad 20 px |
| Valores, coordenadas, horas | JetBrains Mono 400, `font-variant-numeric: tabular-nums` | 12–13 px; lectura del cursor 18 px |
| Rótulos sobre el lienzo | Inter 600 (nombre) + JetBrains Mono 400 (datos) | 13 px + 12 px |

- **Fuentes:** `@fontsource/inter` (400, 500, 600 y 700) y `@fontsource/jetbrains-mono` (300, 400 y 500), solo el subconjunto `latin`. Se importan en `main.tsx`, con licencia OFL apuntada en `SOURCES.md` y sin peticiones externas. Peso estimado: unos 200 kB de `woff2`, que no cuentan en el presupuesto de JavaScript de `02` §7.
- **Tamaño mínimo:** 12 px, como en `10` §12. Los 10–11 px de la maqueta se suben a 12 px (D-101).

### 7.4 Espaciado, radios y sombras

- **Escala:** 4, 8, 12, 14, 16, 18, 20, 24, 32, 48 y 64 px (los valores de la maqueta).
- **Radios:**
  - píldoras: la mitad de su alto;
  - paneles: 20 px;
  - controles pequeños: 8 px;
  - minimapa: círculo.
- **Bordes:** 1 px `--c-line`.
- **Sombras:** solo en paneles flotantes (`--shadow-panel`) y diálogos; nada de sombras en botones.

### 7.5 Rampas del mapa

De `--c-bg-1` (`#162032`) al color del concepto (`--c-sun`, `--c-earth`, `--c-both`) en 11 pasos, interpolando en el espacio OKLab (D-103). La celda sin dato queda transparente con trama de puntos, como hoy. El plan B (NASA) usa la rampa del Sol con su banda fija.

## 8. UX de Málaga (`14_ux_malaga.md`) y accesibilidad (`10` §12)

### 8.1 Las 7 etapas de la «Ruta de lanzamiento»

| Etapa (`14`) | Cómo la cumple la v2 |
| --- | --- |
| §1 Propósito a primera vista | Emblema, `Lunar Sightline` y el lema siempre visibles arriba a la izquierda; la escena del par de la demo detrás; tarjeta de bienvenida en el primer acceso (`14` §1, sin cambios de lógica) |
| §2 Flujo principal | Bienvenida → `Take the 60-second tour` → historia (`Back`, `Next`, `n / 7`, `Exit tour`) → `Try it yourself` → Explore con la escena; cambiar fecha (L2) o sitio (P/L1) cambia escena y cifras; `Compare` desde P. Modo activo subrayado y con `aria-selected` |
| §3 Jerarquía | Una sola acción primaria rellena por pantalla (§6.2); el resto, secundarias, píldoras o texto; un solo `Button`, `FloatingPanel`, `ScenarioCard`, `DataState` |
| §4 Legibilidad | Texto base 16 px; secundario ≥ 14 px en las vistas de la demo salvo rótulos de ejes y pie (≥ 12 px); cifras de 56 px legibles a 2 m; palabras del usuario (sin ids ni `no_go`) |
| §5 Contraste y color | Tabla del §7.2 (≥ 4,5:1 en texto, ≥ 3:1 en gráficos); estados con icono y palabra; escenarios con letra y forma; prueba en el proyector el domingo |
| §6 Tamaños | 44 × 44 px en táctil y móvil; 8 px entre objetivos; nada depende del paso del puntero (ayudas ⓘ al tocar; lectura del puntero con alternativa en R) |
| §7 Respuesta | `DataState` en cada escena y hoja; `Loading 3D view…`; F32 con progreso y `Cancel`; errores en lenguaje llano con `Retry` |

### 8.2 Alerta roja (`14` §8)

Sigue la prueba automática de `14` §9 (`e2e/ux.spec.ts`) sobre la v2: ningún `undefined`, `NaN`, `null`, `lorem` ni `TODO`; botones ≥ 44 px en táctil; ningún botón sin función; nada que se distinga solo por color.

### 8.3 Accesibilidad (`10` §12)

- **Orden del foco:**
  1. enlace del emblema;
  2. píldoras de escenarios;
  3. modo y `Validation`;
  4. conmutador 3D/2D;
  5. pestañas de los paneles izquierdos y su contenido si están abiertos;
  6. escenario;
  7. panel R;
  8. franja B: cifras con su ⓘ, pestañas de vista y barra de tiempo;
  9. minimapa.

  Un enlace `Skip to main view` aparece al primer `Tab`.
- **Paneles translúcidos:** el texto sobre `--c-panel` se mide contra el peor fondo posible, el terreno claro de la 3D. Por eso `--c-panel` no baja de 0,72 de opacidad, y con `prefers-reduced-transparency` o `forced-colors` pasa a ser opaco.
- **Zoom del 200 %:** los paneles se pliegan solos y la página sigue sin desplazamiento horizontal.
- **Región viva:** la región `aria-live` del estado y las cuentas atrás no cambia de comportamiento: como mucho cada 10 s y nunca durante la reproducción.

### 8.4 Excepciones de tamaño frente a la maqueta

La maqueta usa 10–11 px en algunos rótulos (marcas `D0…D14`, ejes, `SOUTH POLE`, fecha UTC y procedencia). La v2 los sube a 12 px, que es el mínimo de `10` §12 (D-101).

## 9. Móvil (< 768 px)

- **Siempre en 2D:** `viewMode = '2d'`, con el conmutador visible pero `3D` deshabilitado (§4.1).
- **Disposición vertical sin desplazamiento horizontal:**
  - cabecera compacta: emblema de 32 px, `Lunar Sightline` y el selector de modo;
  - fila de píldoras desplazable;
  - escenario 2D al 55 % del alto;
  - debajo: la línea de veredicto, las tres cifras en tres columnas a 28 px, la frase 1 del resumen y las pestañas de vista;
  - barra de tiempo fija abajo (`Play`, deslizador y lectura).
- **Paneles como hojas inferiores:** L1, L2, R y `About` (créditos y aviso de IA).
  - Se abren desde una barra de cuatro botones sobre la barra de tiempo: `Sites`, `Setup`, `Now` y `About`.
  - Cada hoja sube hasta el 85 % del alto, con asa de arrastre, `role="dialog"`, foco atrapado y `Esc` o arrastre hacia abajo para cerrarla.
- **Minimapa:** se oculta; la pestaña Map sigue disponible.
- **Plan:** como hoy, `Plan mode needs a wider screen.` con `Back to Explore`.
- **Pruebas que deben seguir pasando:** las de `a11y.spec.ts` (390 × 844), adaptadas a la v2 en T-63.

## 10. Red de seguridad, `?ui=` y convivencia con la v1

- `ui/shell/uiVersion.ts` lee `?ui=v1|v2` de `location.search` al arrancar. Valor por defecto:
  - hasta T-63: **v1**;
  - desde T-63: **v2**.
- `App.tsx` monta `AppLayout` (v1) o `ShellV2` (v2). El store, los selectores, el núcleo, los cargadores, `en.json` y las vistas de datos son los mismos para las dos.
- La v2 importa los componentes de la v1 que reutiliza (vistas de datos, `ScenarioCard`, `SitePicker`, `DataState`), con estilos v2 aplicados mediante la clase raíz `.ui-v2`.
- **Estilos:** los de la v1 quedan bajo `.ui-v1` (o sin prefijo, si no chocan); los nuevos, en `styles/v2.css`, siempre bajo `.ui-v2`.
- **Enlace compartible:** `?ui=` no forma parte del fragmento F16. Un enlace abierto con `?ui=v1` conserva ese parámetro al compartir, porque se copia `location.href`.
- **Pruebas:** las pruebas actuales de Playwright fijan `?ui=v1` en su `baseURL` mientras la v1 sea la predeterminada. Al cambiar el valor por defecto (T-63), las pruebas de la v2 pasan a ser las principales y se conserva un humo de la v1 (`v1.spec.ts`).

## 11. Pruebas

- **Unitarias (Vitest):**
  - `uiVersion` (por defecto, `v1`, `v2`, valor inválido);
  - `viewMode` (valor inicial según ancho y WebGL; ida y vuelta por la URL con `vm`; `vm` inválido descartado con aviso);
  - fase de la Tierra en `Stage2D` (fracción iluminada a partir de los vectores: 0 con Sol y Tierra en el mismo lado, 1 en oposición; signo de la mitad iluminada);
  - colocación de rótulos (sin solapes entre Sol, Tierra y cresta en una rejilla de casos);
  - rampas OKLab (extremos y monotonía de la luminancia);
  - `FloatingPanel` (estado guardado y almacenamiento que falla).
- **Extremo a extremo (Playwright, `web/e2e/v2/`):**
  - arranque v2 con el par de la demo: emblema, lema, píldoras, escena y cifras;
  - conmutador 3D/2D y `V`; sin el módulo 3D, la 2D con aviso;
  - plegar y desplegar cada panel con ratón y teclado;
  - B1 y B2 sobre la v2 (las cifras salen de las mismas clases y `data-testid`);
  - historia completa;
  - validación;
  - enlace compartido con `vm`;
  - `?ui=v1` sigue mostrando la v1;
  - alerta roja (`14` §9) y objetivos de 44 px en táctil;
  - móvil 390 × 844 con las hojas inferiores;
  - sin desplazamiento de página a 1280 × 720, 1440 × 900 y 1920 × 1080.
- **Capturas:** `docs/handoff/T-6x-*.png`, antes y después, a 1440 × 900 y 390 × 844, y una en escala de grises (`14` §5).
- **B9:** auditoría de accesibilidad ≥ 90 sobre la v2, recorrido solo con teclado y zoom del 200 %.

## 12. Tarjetas

| Tarjeta | Tamaño | Qué deja enseñable |
| --- | --- | --- |
| T-61 | L | Armazón v2 tras `?ui=v2`: tokens, fuentes, emblema, pantalla única con H, P, M, L1, L2, R y B, conmutador 3D/2D con `viewMode` (store y URL) y montaje de `Stage3D`, con la vista 2D actual dentro de `Stage2D` mientras llega T-62 |
| T-62 | L | Vista 2D a pantalla completa con los rótulos sobre el lienzo y la tira de 360°, `Horizon detail`, minimapa, hoja central para las vistas de datos, mapa a pantalla completa, historia, bienvenida, diálogos y validación con el estilo v2, y móvil con hojas inferiores |
| T-63 | M | Pasada de accesibilidad y UX (`14`, B9), pruebas de la v2 (B1, B2, alerta roja, capturas, sin desplazamiento), v2 por defecto con `?ui=v1` como respaldo, y actualización de `10_interfaz.md` para que apunte a este documento |

El detalle de cada una está en `docs/tasks/T-61.md`, `T-62.md` y `T-63.md`.
