# 10 · Interfaz

Web estática de una sola pantalla. Textos de interfaz en inglés (fichero `web/src/i18n/en.json`); todo lo que aparece `así` en este documento es texto exacto. Dueño: I2; textos y guion: A3.

> **Desde T-63 la interfaz predeterminada es la v2** (`15_interfaz_v2.md`): manda sobre este documento en disposición, colores, tipografía y estilo, y añade el conmutador 3D/2D (`16_vista_3d.md`). La funcionalidad, los estados, los textos exactos y la accesibilidad de este documento siguen valiendo. Lo que aquí se describe como disposición (§1 principio 2, §2 colores, §3) es la **v1**, que sigue disponible con `?ui=v1` como red de seguridad.

## 1. Principios (del plan, obligatorios)

1. Tres modos con un selector siempre visible: **Explore** (por defecto), **Plan**, **Learn**.
2. Una sola pantalla sin desplazamiento en escritorio (≥ 1280 × 720).
3. Explore enseña solo F1–F8, F12 y F18 (más el mapa y los eclipses cuando existan). Lo demás vive en Plan.
4. El panorama se lee: vista de 40°, zoom del horizonte rotulado y tira de 360°. Nunca los 360° a escala como vista principal.
5. Un único código de color en toda la aplicación, siempre acompañado de icono o trama.
6. Accesible desde el primer componente: paleta apta para daltonismo, contraste y teclado.
7. Cada cifra lleva unidad, ayuda contextual y fuente.
8. La primera pantalla ya cuenta una historia: se abre con el par de la demo (`sites.json.defaults`), no con un formulario vacío.
9. Un extra solo entra si un novato puede ignorarlo sin enterarse de que existe.
10. Explore funciona en móvil, en vertical.

## 2. Código de color, iconos y tramas

Variables CSS en `styles/tokens.css`. Colores de la paleta de Okabe e Ito, apta para daltonismo.

| Concepto | Variable | Color | Icono | Trama en barras y mapa |
| --- | --- | --- | --- | --- |
| Sol | `--c-sun` | `#E69F00` | Círculo con rayos | Lisa |
| Tierra | `--c-earth` | `#56B4E9` | Círculo con arco | Rayas diagonales |
| Ambos | `--c-both` | `#009E73` | Dos círculos enlazados | Cuadrícula |
| Ninguno | `--c-none` | `#8A8F98` | Círculo vacío | Puntos |
| Estado `go` | `--c-go` | `#009E73` | ✓ | — |
| Estado `marginal` | `--c-marginal` | `#F0E442` | ! | — |
| Estado `no_go` | `--c-nogo` | `#D55E00` | ✕ | — |
| Eclipse | `--c-eclipse` | `#CC79A7` | Disco tapado | Rayas verticales |
| Aviso de Luna lisa | `--c-warn` | `#D55E00` | Triángulo | — |
| Fondo, superficie, texto | `--c-bg`, `--c-surface`, `--c-text` | `#0B0E14`, `#161B22`, `#E8EAED` | — | — |
| Terreno | `--c-terrain` | `#5C6370` (relleno), `#C9CED6` (línea) | — | — |
| Luna lisa (línea) | `--c-smooth` | `#C9CED6`, discontinua | — | — |

Reglas: ningún estado se comunica solo con color (siempre icono o texto); contraste mínimo 4,5:1 para texto y 3:1 para gráficos, comprobado con la auditoría automática del navegador (caso B9); tema oscuro único. Escenarios: letras A, B, C, D con formas de marcador distintas (círculo, cuadrado, triángulo, rombo), no con colores.

## 3. Disposición

### 3.1 Escritorio (≥ 1024 px de ancho)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Lunar Landing Site Navigator   [Explore|Plan|Learn]   Landing [fecha UTC] Mission [14 d]     │  cabecera, 56 px
│                                 ◀ ▶ ⏵ ×speed  ├────●─────────────┤ cursor     Validation  Share │
├──────────────┬───────────────────────────────────────────────────────────────┬───────────────┤
│ Scenarios    │ [Panorama] [Timeline] [Map] [Terrain profile] (+[Replan] Plan)  │ Sunlight      │
│ ┌──────────┐ │                                                               │ 312 h · 93 %  │
│ │ A  sitio │ │                    vista principal                            │ Earth contact │
│ │ estado   │ │                                                               │ 201 h · 60 %  │
│ └──────────┘ │                                                               │ Longest night │
│ ┌──────────┐ │                                                               │ 7.5 h         │
│ │ B  sitio │ │                                                               │ ───────────── │
│ └──────────┘ │                                                               │ ✓ Works       │
│ + Add        │                                                               │ Now: Sun 1.2° │
│ Compare      │                                                               │ texto llano   │
└──────────────┴───────────────────────────────────────────────────────────────┴───────────────┘
   240 px                              flexible                                     300 px
```

### 3.2 Móvil (< 768 px), solo modo Explore y Learn

Vertical, con desplazamiento: cabecera compacta (título corto `Moon Site Navigator`, selector de modo); fila de fichas de escenario desplazable (A, B); pestañas; vista principal a ancho completo (alto 55 % de la pantalla); panel de cifras debajo en tres columnas; resumen llano; barra de tiempo fija abajo (deslizador, reproducir). El modo Plan muestra en móvil `Plan mode needs a wider screen.` con un botón `Back to Explore`. Entre 768 y 1023 px: como escritorio, con la columna derecha debajo de la vista principal.

## 4. Cabecera y controles de tiempo (F2)

| Elemento | Comportamiento | Texto o etiqueta |
| --- | --- | --- |
| Título | Enlace al estado inicial | `Lunar Landing Site Navigator` |
| Selector de modo | Grupo de 3 botones (`role="tablist"`) | `Explore`, `Plan`, `Learn` |
| Fecha de aterrizaje | Campo `datetime-local` interpretado como UTC, paso de 1 min; afecta al escenario activo (o a todos si `Link dates` está marcado, por defecto sí) | Etiqueta `Landing (UTC)` |
| Duración | Numérico, 0,5–60, paso 0,5 | Etiqueta `Mission`, sufijo `days` |
| Deslizador del cursor | De `landing` a `landing + mission`; paso de 10 min; flechas ±10 min; `PageUp/PageDown` ±1 día | `aria-label="Time within mission"`; a la derecha `Day 3, 14:20 · 2027-08-04 14:20 UTC` |
| Reproducir / pausa | Avanza el cursor; al llegar al final se detiene | `Play`, `Pause` |
| Velocidad | Ciclo de 3 valores | `1 h/s`, `6 h/s`, `1 d/s` |
| Paso atrás / adelante | ±1 h | `Back 1 hour`, `Forward 1 hour` |
| Validación | Abre la página de validación | `Validation` |
| Compartir (Plan) | Copia la URL | `Share`; aviso `Link copied` |

Errores de fecha: fuera de rango → el campo se marca y debajo aparece `Date outside the supported range (1969–1972 and 2024–2044).`; formato no válido → `Enter a valid date and time (UTC).` La misión recortada por el final de la tabla muestra `Mission extends beyond available ephemeris; results truncated.`

## 5. Columna de escenarios (F1, F8)

**Tarjeta de escenario**: letra y marcador; `short_name` del sitio; `84.79° S, 29.20° E`; rótulo de relieve (en rojo con icono si es Luna lisa); fecha de aterrizaje; ficha de estado (`Works`, `Tight`, `Doesn't work`); botones `Change site`, `Duplicate`, `Remove`. La tarjeta activa lleva borde resaltado; un clic la activa.

| Estado de la tarjeta | Qué se ve |
| --- | --- |
| Cargando | Esqueleto gris y `Loading horizon…` |
| Lista | Lo descrito |
| Error de datos | `Could not load this site's horizon.` + botón `Retry` |
| Luna lisa | Rótulo rojo `Smooth Moon (no terrain)` y nota `No terrain data here — smooth Moon. Real sunrise, sunset and Earth visibility will differ.` |
| Punto de malla | `Nearest mesh point: 89.123° S, 45.678° E (500 m grid)` |

Botones de la columna: `Add scenario` (deshabilitado con 4: `Maximum of 4 scenarios`), `Compare` (con 2 o más).

**Selector de sitio** (diálogo modal, `role="dialog"`, foco atrapado, `Esc` cierra): campo `Search sites`; grupos `Landed missions`, `NASA candidate landing regions near the lunar south pole (2024 list)`, `Other points`; cada fila: nombre, coordenadas, año y rótulo de relieve. Sin resultados: `No sites match "<texto>".` En Plan, sección `Custom coordinates` con campos `Latitude (°, north positive)` y `Longitude (°, east positive)` y botón `Use coordinates`. Validación: latitud fuera de [−90, 90] → `Latitude must be between −90 and 90.`; longitud fuera de [−180, 360] → `Longitude must be between −180 and 360.` (los valores mayores de 180 se pasan a negativos); dentro de la malla → se usa el punto de malla más cercano; fuera → Luna lisa con el aviso.

**Comparación (F8)**: el botón `Compare` sustituye la vista principal por una tabla con una columna por escenario y estas filas: `Site`, `Landing (UTC)`, `Status`, `Sunlight` (h y %), `Earth contact` (h y %), `Sun + Earth` (h y %), `Longest night` (h), `Sun elevation now`, `Solar disc visible now`, `Next sunset / sunrise`, `Next Earthset / Earthrise`, `Terrain`. La mejor cifra de cada fila numérica va en negrita con ▲. Debajo, una mini línea temporal por escenario (las tres barras) con el mismo eje de tiempo. `Close comparison` vuelve a la pestaña anterior. Con un solo escenario: `Add a second scenario to compare.`

## 6. Vista principal

### 6.1 Panorama (F3, F4)

Tres elementos, de arriba abajo:

1. **Vista de 40°** (principal). Proyección equirrectangular acimut–elevación con la misma escala en los dos ejes. Ancho 40° de acimut centrado en el astro de enfoque (`Sun` o `Earth`, conmutador `Centre on`). Alto 20°. Centro vertical: la elevación del horizonte en el acimut del astro, salvo que el astro esté a más de 8° de él, en cuyo caso se centra en el astro y una flecha indica `Horizon 25° below`. Se dibuja: cielo oscuro; terreno relleno bajo la línea de la máscara; línea de Luna lisa discontinua si `Compare with smooth Moon` está activo; disco del Sol y disco de la Tierra a su tamaño real, con la parte bajo el horizonte recortada y su contorno en línea fina; la traza del astro de enfoque a lo largo de la misión (línea de puntos con una marca cada 24 h); rejilla cada 5° con rótulos de acimut (`270° W`) y de elevación; un rótulo en el punto que bloquea (`Ridge 41 km away`).
2. **Zoom del horizonte**. Recuadro de 4° × 2° centrado en el astro de enfoque, escala 1:1, rejilla cada 0,5°, rótulo `Horizon zoom ×10 · grid 0.5°`. Es donde se ve si el disco (0,5°) asoma, está cortado o no se ve. Al lado, la lectura `Solar disc visible: 62 %` y `Margin: +0.04°`.
3. **Tira de 360°**. Franja de 360° × 30° (comprimida), con el horizonte, los dos astros como puntos y un corchete que marca la ventana de 40°. Clic o arrastre en la tira mueve la ventana; rótulos N, E, S, W.

Interacción: arrastrar la vista de 40° desplaza el acimut (deja de seguir al astro hasta pulsar `Centre on Sun` / `Centre on Earth`); flechas izquierda y derecha ±1°; puntero encima → lectura `Az 271.5° · El 0.92° · Horizon 0.88°`.

F4: conmutador `Compare with smooth Moon` y cuadro `Terrain effect` con tres líneas: `Sunlight: −2.1 h`, `Earth contact: 0 h`, `Sunset: 2 h 05 min earlier` (o `later`, o `no change`).

Estados: cargando → esqueleto y `Loading…`; astro de enfoque bajo el horizonte → se dibuja igual (contorno) con la nota `Sun is below the horizon`; error → `Panorama unavailable.` + `Retry`.

### 6.2 Línea temporal (F5, F6, F13)

Eje x: tiempo, de `landing − 10 %` a `landing + mission + 10 %`, marcas en días (`Day 0`, `Day 1`…) y fecha UTC. Eje y: elevación en grados con escala automática que incluye las dos curvas y el horizonte. Se dibuja: curva del Sol (`--c-sun`, continua) y de la Tierra (`--c-earth`, continua); horizonte en el acimut de cada astro (mismo color, discontinua fina); línea de 0°; debajo, tres barras (`Sun`, `Earth`, `Sun + Earth`) con su trama; marcadores de sucesos sobre las barras; banda de eclipse con su trama y rótulo `Eclipse`; zona de misión resaltada; línea vertical del cursor, arrastrable.

Interacción: clic o arrastre mueve el cursor; con foco, flechas ±10 min; puntero → `2027-08-04 14:20 UTC · Sun 1.21° (margin +0.33°) · Earth 5.80° (margin +2.10°)`. Los marcadores de suceso son botones con `aria-label` (`Sunset, 2027-08-09 03:12 UTC`).

Cuenta atrás (F6), en el panel derecho: `Sunset in 4d 12h 52m` / `Sunrise in …` / `Earthset in …` / `Earthrise in …` / `No sunset in the next 60 days` y variantes.

### 6.3 Corte del relieve (F12)

Conmutador `Toward Sun` / `Toward Earth`. Plano vertical local del observador (`06_horizonte.md` §8): eje x = distancia horizontal en km, de 0 a `1,25 × distancia del punto que bloquea` (mínimo 5 km; botones `Fit to blocker`, `Full 300 km`); eje y = altura respecto al ojo del observador en metros, con exageración vertical automática rotulada (`Vertical exaggeration ×12`). Se dibuja: perfil del terreno relleno (512 intervalos del acimut de la máscara más próximo al del astro); curva de la esfera lisa (discontinua, `Smooth Moon`); el observador en el origen con su mástil (`Observer, 2 m`); la línea del horizonte hasta el punto que bloquea, marcado con un punto y el rótulo `Blocking point: 41.2 km away, 1,930 m above the site`; la línea de visión al centro del astro (`--c-sun` o `--c-earth`) con su elevación; un abanico tenue entre el borde inferior y el superior del disco. Texto bajo el gráfico: `Sun centre is 0.33° above the terrain here.` o `Sun centre is 0.21° below the terrain here.`

Estados: cargando el perfil → `Loading terrain profile…`; punto de malla → `The terrain profile is available for catalogue sites only.`; Luna lisa → se dibuja solo la esfera, con `Smooth Moon: the horizon is the lunar sphere, 2.6 km away.`; error → `Terrain profile unavailable.` + `Retry`.

### 6.4 Mapa (F11, F32)

Lienzo con el sombreado, la capa, los contornos de las regiones y los marcadores. Arriba a la izquierda, controles: capa (`Sunlight`, `Earth contact`, `Sun + Earth`, `None`); periodo (`18.6-year mean` o mes: selector de año 2026–2030 y de mes); opacidad. Abajo a la izquierda: leyenda con rampa de 0 a 100 %, rótulo `Share of time (%)`, criterio `Sun or Earth centre above the real horizon, observer at 2 m` y fuente. Abajo a la derecha: escala gráfica (km), flecha `0° E (Earth side) ↑` y `Polar stereographic · 500 m grid`.

Rampas: de `#161B22` al color del concepto (`--c-sun`, `--c-earth`, `--c-both`) en 11 pasos; celda sin dato, transparente con trama de puntos.

Interacción: rueda o pellizco, zoom (1× a 16×); arrastre, desplazamiento; teclado: flechas desplazan, `+` y `−` zoom, `Enter` selecciona la celda bajo la cruz central; puntero → `87.21° S, 125.48° E · +1,204 m · Sun 71 % · Earth 55 % · Both 48 %`; clic → `on_map_click` (`08_mapa_polar.md` §7) crea o sustituye el escenario activo; clic en un marcador de sitio lo selecciona. Los contornos de región llevan su nombre.

Panel `Best site` (plegado por defecto; visible en Plan y, en Explore, como botón `Find the best site`):

- `Most Sun + Earth in a period`: usa el periodo del mapa; selector `Region` (`All candidate regions` o una); botón `Find`; lista de 10 con `rank · lat, lon · Both 83 % · Sun 91 % · Earth 86 %`; clic en una fila centra el mapa; `Add as scenario`.
- `Longest continuous Sun + Earth from a date`: usa la fecha de aterrizaje de la cabecera; `Region`; botón `Search`; barra de progreso `Finding the best site… 33 % (3,412 of 10,252 points)`; `Cancel`; resultado `Best: 87.21° S, 125.48° E — 12 d 7 h of continuous sunlight and Earth contact` y lista de 10; `Add as scenario`. Sin candidatos: `No point in the selected area has both sunlight and Earth contact at that time.`

Estados del mapa: sin origen pesado → `Map data is not available in this build.`; cargando → `Loading map…`; capa del periodo cargando → indicador en la leyenda; trozo no calculado → `This area has not been computed yet.`; plan B con datos de la NASA → banda fija `NASA average illumination (Mazarico et al. 2011) — not our computation`; malla efectiva de 1 km → `Computed on a 1 km grid`.

### 6.5 Replanificación (F10, pestaña `Replan`, modo Plan)

- Controles: `Delay step` (`6 h`, `12 h`, `1 day`, `2 days`); `Rows`: escenarios actuales y casilla `Include NASA candidate regions`; requisitos editables: `Mission length (days)`, `Longest night allowed (h)`, casillas `Sun at landing`, `Earth contact at landing`; botón `Reset to defaults`.
- Matriz: filas = sitios; columnas = 31 fechas (`+0`, `+1 d`, …); celda = cuadro con color e icono; la columna de la fecha base va marcada; clic en una celda fija esa fecha en el escenario y muestra el detalle (`Landing 2027-08-13 06:00 UTC · Sun ✓ · Earth ✓ · Longest night 31 h ✕`); teclado: flechas mueven la celda activa, `Enter` la selecciona. Cada celda tiene `aria-label` completo.
- A la derecha de cada fila: `Next valid landing window: 2027-08-20 00:00 – 2027-08-24 06:00 UTC (4 d 6 h)` o `No valid landing window in the next 90 days.`
- Debajo: `Ranking for landing <fecha>` con las regiones candidatas: posición, nombre, estado, `Sun + Earth %`, `Longest night`, botón `Add as scenario`; y la frase `Best alternative: Malapert Massif — Works, 88 % Sun + Earth.`
- En la historia guiada se usa una versión reducida (2 filas, 13 columnas).

### 6.6 Panel derecho (F7, F18)

Tres cifras grandes del escenario activo, cada una con icono, unidad y botón de ayuda (ⓘ):

| Cifra | Formato | Ayuda (texto exacto) |
| --- | --- | --- |
| `Sunlight` | `312 h · 93 %` | `Hours within the mission when the Sun's centre is above the real horizon, seen from 2 m above the ground. Source: JPL DE440 ephemeris and LOLA terrain.` |
| `Earth contact` | `201 h · 60 %` | `Hours with the Earth's centre above the real horizon: a direct line of sight for radio contact. It does not model antennas or ground stations.` |
| `Longest night` | `7.5 h` | `Longest continuous period without the Sun during the mission.` |

Debajo: ficha de estado con los tres requisitos (`Sun at landing ✓`, `Earth at landing ✓`, `No night over 24 h ✓`); bloque `Now` con `Sun elevation 1.21°`, `Solar disc visible 62 %`, `Earth elevation 5.80° (margin +2.10°)` y las dos cuentas atrás; aviso de eclipse si lo hay (`Eclipse in progress: Earth covers 43 % of the Sun`); el resumen llano (§8); y la línea de procedencia `Terrain: LOLA polar 40 m + 120 m · Ephemeris: JPL DE440 · Frame: MOON_ME`.

### 6.7 Página de validación (F9)

Ruta `#/validation`. Título `How we know the numbers are right`. Tres tarjetas grandes (`headline`), por este orden: posiciones del Sol y la Tierra frente a JPL Horizons (`A1`), eclipse de Blue Ghost 1 (`B3`) y mapas frente a la NASA (`A7B7`) (D-95). Cada una con: título, tabla `Predicted` / `Observed`, tolerancia, estado con icono (`Match`, `Mismatch`, `Pending`), fuente enlazada y nota. Para `A7B7`, además, el diagrama de dispersión, el mapa de diferencias y la línea `NASA counts a point as lit when any part of the Sun's or Earth's disc is visible; this comparison uses the same rule. The app's own layers use the disc centre.` Línea de resumen: `256 values checked against JPL Horizons · largest difference 0.00004°` (con las cifras de `summary`), seguida de la limitación `limits.rise_set` (D-95). `Pending` es un estado neutro, no un aviso: `A7B7` sin resultados dice `Computed tonight: …`. Botón `Show all checks (22)` que despliega la tabla completa: `ID`, `Check`, `Expected`, `Obtained`, `Tolerance`, `Source`, `Status`; cada fila se expande con sus `details`. Pie: `Generated from the automated test report · commit abc1234`. Una comparación que no cuadra se muestra con su diferencia y su `note`, nunca se oculta.

Estados: sin informe → `Validation report not available in this build.`; cargando → `Loading validation report…`.

## 7. Textos de interfaz (extracto normativo de `en.json`)

Las claves siguen el patrón `area.elemento`. Todos los textos citados en este documento van en el fichero; estos son los generales:

| Clave | Texto |
| --- | --- |
| `app.title` | `Lunar Landing Site Navigator` |
| `app.tagline` | `Compare Moon landing sites and dates by when the Sun (power) and Earth (radio contact) are above the real horizon.` |
| `mode.explore` / `mode.plan` / `mode.learn` | `Explore` / `Plan` / `Learn` |
| `tab.panorama` / `tab.timeline` / `tab.map` / `tab.section` / `tab.replan` | `Panorama` / `Timeline` / `Map` / `Terrain profile` / `Replan` |
| `status.go` / `status.marginal` / `status.no_go` | `Works` / `Tight` / `Doesn't work` |
| `req.sun` / `req.earth` / `req.night` | `Sun at landing` / `Earth contact at landing` / `No night over {h} h` |
| `relief.smooth_warning` | `No terrain data here — smooth Moon. Real sunrise, sunset and Earth visibility will differ.` |
| `units.deg` / `units.h` / `units.d` / `units.km` / `units.m` / `units.pct` | `°` / `h` / `d` / `km` / `m` / `%` |
| `time.utc` | `UTC` |
| `common.retry` / `common.close` / `common.cancel` / `common.loading` | `Retry` / `Close` / `Cancel` / `Loading…` |
| `error.ephemeris` | `Could not load ephemeris data. Check your connection and retry.` |
| `error.contract` | `Data format not supported by this version of the app. Reload the page.` |
| `error.range` | `Date outside the supported range (1969–1972 and 2024–2044).` |
| `banner.example` | `Example data — not for use` |
| `footer.credit` | `Open source · Data: NASA LOLA, SLDEM2015, JPL DE440 (SPICE) · Team Aeroinformágicos` |
| `about.ai` | `Built with AI assistance (Claude Code). Physics, test cases and validation by the team.` |

Formatos: coordenadas `84.79° S, 29.20° E` (2 decimales en tarjetas, 3 en puntos de malla); fechas `2027-08-04 14:20 UTC`; duraciones `4d 12h 52m`, `12 d 7 h` en frases; números con separador de miles inglés (`1,930 m`).

## 8. Resumen en lenguaje llano (F18)

Generado por plantillas a partir de `SkyState`, las métricas, `assess` y `blocker_at`. De una a tres frases, en este orden: situación actual, lo que viene, veredicto. Función pura `summarize(state, metrics, assessment, blockerSun, blockerEarth, site) → string[]`, con pruebas de cada rama.

Dirección en palabras a partir del acimut (16 rumbos): `north`, `north-northeast`, …; distancia: `< 1 km` → `800 m`; si no, `41 km`. Cota relativa: `blk_height_m − site_height_m`, redondeada a 10 m.

| Condición (instante del cursor) | Frase 1 |
| --- | --- |
| Sol y Tierra visibles | `The Sun is {sunEl}° above the horizon and the Earth is in view: power and a direct link to Earth are both available.` |
| Sol visible, Tierra no | `The Sun is up, but the Earth is hidden behind terrain {dist} to the {dir}: no direct link to Earth.` |
| Tierra visible, Sol no | `The Earth is in view, but the Sun is hidden behind terrain {dist} to the {dir}{rise}.` — `{rise}` = `, {h} m higher than the site` si la cota relativa es positiva; se omite si `blk_height_m` no existe (punto de malla, NaN) |
| Ninguno | `Neither the Sun nor the Earth is visible from here right now.` |
| Sol parcialmente visible (0 < fracción < 1), se añade | `Only {pct} % of the solar disc clears the terrain.` |
| Luna lisa | Se sustituye «terrain … to the …» por `the lunar horizon` |
| Astro bajo el horizonte liso (su elevación ≤ `smooth_el_deg` de la altura del observador: lo taparía también una Luna sin relieve, p. ej. la Tierra desde la cara oculta) | Para ese astro se sustituye «hidden behind terrain {dist} to the {dir}{rise}» por `below the lunar horizon` (sin distancia ni dirección): el relieve no es la causa y no se atribuye |
| Eclipse | Se añade `The Earth is covering {pct} % of the Sun (eclipse).` |

Frase 2: se evalúan las filas en este orden y se usa la primera que se cumple. «Fin de la misión» = `landing + mission`.

| Condición | Frase 2 |
| --- | --- |
| Hay Sol y hay `sunset` antes del fin de la misión | `Sunset comes in {countdown}, at {time}.` |
| Hay Sol y no hay `sunset` antes del fin de la misión | `The Sun stays up for the rest of the mission.` |
| No hay Sol y hay `sunrise` en 60 días | `Sunrise comes in {countdown}.` |
| No hay Sol ni `sunrise` en 60 días | `The Sun does not rise here in the next 60 days.` |
| Además, si el próximo suceso de la Tierra (60 días) llega antes que el próximo del Sol | Se añade `Earth contact {is lost|returns} in {countdown}.` |

La cuenta atrás del panel (F6, `07_visibilidad.md` §7) sigue buscando hasta 60 días aunque la misión acabe antes; solo la frase 2 se limita a la misión.

| Estado | Frase 3 |
| --- | --- |
| `go` | `For a {D}-day mission landing at this time, this site works: {sunPct} % sunlight, {earthPct} % Earth contact, longest night {night} h.` |
| `marginal` | `This site works for a {D}-day mission, but with little margin: {reason}.` — `{reason}`: `the Sun is partly hidden at landing` / `the Earth is less than 1° above the terrain at landing` / `the longest night ({night} h) is close to the limit` |
| `no_go` | `This site does not work for a {D}-day mission landing at this time: {reason}.` — `no Sun at landing` / `no Earth contact at landing` / `a night of {night} h exceeds the {limit} h limit` (varias, unidas con `and`) |

En Explore se muestran las tres; en la tabla de comparación, solo la tercera.

## 9. Estados de carga, vacío y error (regla general)

Cada vista que depende de datos implementa cuatro estados con el mismo componente `DataState`: `loading` (esqueleto + texto), `empty` (texto explicativo y, si procede, acción), `error` (mensaje + `Retry`) y `ready`. Ninguna vista queda en blanco. Los fallos de red reintentan una vez de forma automática a los 2 s antes de mostrar el error. Los mensajes exactos están en cada apartado del §6 y en `05`, `07` y `08`.

## 10. Enlace compartible (F16)

Estado en el fragmento de la URL: `#s=<base64url(JSON)>`. JSON (claves cortas):

```json
{ "v": 1, "m": "plan", "t": "panorama", "c": 1817389200, "f": "sun",
  "sc": [ { "s": "region-malapert-massif", "l": 1817078400, "d": 14, "h": 2 },
          { "s": "grid:538,117", "l": 1817078400, "d": 14, "h": 2 } ],
  "a": 0, "rq": { "n": 24, "su": 1, "ea": 1 }, "ml": "both", "mp": "2027-08" }
```

En el ejemplo, `l` = 1817078400 es 2027-08-01T00:00:00Z y `c` es 3 d 14 h 20 min después. `v` versión; `m` modo; `t` pestaña; `c` cursor (Unix); `f` astro de enfoque; `sc` escenarios (`s` sitio: id del catálogo, `grid:i,j` o `custom:lat,lon`; `l` aterrizaje; `d` días; `h` altura del observador); `a` escenario activo; `rq` requisitos; `ml`, `mp` capa y periodo del mapa. Al cargar: se valida cada campo; lo no válido se descarta y se muestra `Some settings in this link could not be restored.`; si nada es válido, se abre el estado inicial. La URL se actualiza con `history.replaceState` como mucho dos veces por segundo (no durante la reproducción). `Share` copia `location.href`; si el portapapeles no está disponible, muestra la URL en un campo seleccionado.

## 11. Historia guiada (F15): guion de 60 s

Modo `Learn`. Superposición inferior con el texto del paso, `Back`, `Next` (también ← →, barra espaciadora) y `1 / 7`. Cada paso aplica un **estado exacto** (función `storySteps[i].apply(defaults)`), de modo que la demo es reproducible y quien la maneja solo pulsa `Next`. Los sitios y la fecha salen de `sites.json.defaults` (`demo_pair = [A, B]`, `demo_landing_utc = T`, 14 días). Funciona sin el origen pesado (el paso 6 tiene variante).

| Paso | Segundos | Estado de la aplicación | Texto en pantalla (y voz) |
| --- | --- | --- | --- |
| 1 | 0–8 | Escenario A; pestaña Panorama centrada en el Sol; cursor en `T`; reproducción a `6 h/s` durante 4 s y pausa | `At the Moon's south pole the Sun never climbs more than a few degrees. Here it skims the horizon — and the terrain decides who gets light.` |
| 2 | 8–18 | Escenarios A y B; vista `Compare` | `These two sites are {distance} apart. At one, the Sun (power) and the Earth (radio link) are both in view for most of the mission. At the other, almost never, and the mission fails.` (T-92, D-121) |
| 3 | 18–27 | Escenario B activo; pestaña Terrain profile hacia el Sol | `Here is why: a ridge {blockerDist} away blocks the Sun. Every answer comes with its reason.` |
| 4 | 27–37 | Escenario A; pestaña Replan reducida; la columna activa pasa de `+0` a `+12 d` con una animación de 1 s | `Now the launch slips 12 days. Same site, new date — and it no longer works.` |
| 5 | 37–46 | Ranking de regiones para `T + 12 d`; la primera fila resaltada | `The tool ranks NASA's candidate regions for the new date and proposes an alternative in seconds.` |
| 6 | 46–53 | Con mapa: pestaña Map, capa `Sun + Earth`, mes de `T`, marcador en el mejor punto del panel `Best site`. Sin mapa: escenario `blue-ghost-1` con su fecha real, pestaña Timeline | Con mapa: `Or let it search: the best spot for sunlight and Earth contact, anywhere near the pole.` Sin mapa: `Near the equator a lunar day lasts two Earth weeks. At the pole, light can last months — or never come.` |
| 7 | 53–60 | Página de validación, las tres tarjetas | `Every number is checked: against JPL Horizons, the eclipse Blue Ghost saw from the Moon, and NASA's illumination maps.` |

En todos los pasos, `Exit tour` (vuelve a Explore sin tocar el estado). En el último paso, `Next` se sustituye por `Try it yourself` (vuelve a Explore con A y B) y `Restart` (`14_ux_malaga.md` §2). `{distance}` y `{blockerDist}` se calculan de los datos (`830 m`, `41 km`). La comparación Luna–Tierra del plan es la frase del paso 1 y la variante del paso 6. Con `prefers-reduced-motion`, sin animaciones automáticas.

Ensayo: el guion se cronometra en el «ensayo 0» (sábado, 17:30) y A3 ajusta los textos; los cambios de texto son de tipo 2 (dentro del módulo).

## 12. Accesibilidad

- **Teclado**: todo control es alcanzable con `Tab` en orden lógico (cabecera → escenarios → pestañas → vista → panel); foco visible (contorno de 2 px `#F0E442`); atajos: `1`–`4` pestañas, `Espacio` reproducir, `[` y `]` cursor ±1 h, `?` abre la ayuda de atajos. Sin trampas de foco salvo en diálogos.
- **Lectores de pantalla**: cada gráfico es `role="img"` con `aria-label` breve y `aria-describedby` apuntando al resumen llano y a una tabla de datos oculta visualmente (sucesos y ventanas). El estado y las cuentas atrás están en una región `aria-live="polite"` que se actualiza como mucho cada 10 s y nunca durante la reproducción.
- **Color**: paleta del §2; tramas en barras y mapa; iconos en estados.
- **Texto**: tamaño base 16 px; nada por debajo de 12 px; la interfaz aguanta zoom del 200 %.
- **Movimiento**: `prefers-reduced-motion` desactiva animaciones y la reproducción automática de la historia.
- **Táctil**: objetivos de 44 × 44 px como mínimo.
- **Idioma**: `<html lang="en">`.
- Comprobación (caso B9): auditoría de accesibilidad del navegador ≥ 90, recorrido completo solo con teclado y prueba con zoom del 200 %.

## 13. Rendimiento de la interfaz

| Medida | Objetivo | Cómo se mide |
| --- | --- | --- |
| Interfaz visible | < 3 s con 20 Mbit/s | Auditoría del navegador y Playwright |
| Respuesta al mover el cursor | < 50 ms (un fotograma a 20 fps como mínimo durante el arrastre) | Perfilador del navegador |
| Reproducción | ≥ 30 fotogramas/s en portátil; ≥ 20 en móvil | Ídem |
| Cambio de sitio (máscara en caché) | < 100 ms | Ídem |
| Cambio de capa del mapa | < 300 ms tras la descarga | Ídem |
| Memoria | < 300 MB con 4 escenarios y el mapa | Ídem |

Técnicas obligatorias: selectores memorizados; curvas de la línea temporal recalculadas solo cuando cambian escenario o misión (no con el cursor); panorama en Canvas; mapa en Canvas con la capa coloreada una vez por periodo a un `ImageBitmap`.

## 14. Pruebas de interfaz

- Unitarias (Vitest): `summarize` (todas las ramas del §8), formato de fechas, duraciones y coordenadas, serialización de la URL (ida y vuelta, y entradas corruptas), `storySteps` (cada paso produce un estado válido).
- Extremo a extremo (Playwright, `web/e2e/`): arranque con el par de la demo; cambio de sitio y de fecha; B1 (cinco escenarios: las cifras del panel coinciden con `core_vectors.json` a 0,01° y 1 min); B2 (matriz de Blue Ghost 1 con +14 d y +29,5 d); recorrido de la historia con `Next`; enlace compartido abierto en un contexto nuevo; perfil móvil (390 × 844): el modo Explore completo sin desplazamiento horizontal; navegación solo con teclado hasta cambiar de pestaña y mover el cursor.
- Manual (A3, caso B8): tres personas ajenas al equipo resuelven sin ayuda, cada una en menos de 60 s: (1) «¿Hasta cuándo hay Sol en el sitio A?», (2) «¿Cuál de los dos sitios pierde antes el contacto con la Tierra?», (3) «La misión se retrasa 12 días: ¿sigue valiendo el sitio A?». Pasa si 2 de 3 personas lo logran.
