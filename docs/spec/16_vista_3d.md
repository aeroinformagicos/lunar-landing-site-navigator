<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# 16 · Vista 3D realista y navegable

Carril I3 del rediseño 3D/2D (tarea de especificación T-70; implementación T-71 a T-73). Dueño: I3. La interfaz v2 que la contiene (armazón, paneles, conmutador 3D/2D y vista 2D) es del carril I2 y está en `15_interfaz_v2.md`. El contrato común entre los dos carriles está copiado tal cual en el anexo A; si este documento y el anexo A chocan, manda el anexo A y se habla con I2 antes de cambiarlo.

**Lo que no cambia:** ningún cálculo ni dato. La 3D es otra forma de enseñar lo que ya calcula `web/src/core`; las cifras (elevaciones, márgenes, horas, veredictos) son siempre las del núcleo, idénticas en 2D y 3D. El sombreado de la escena es ilustrativo y la interfaz lo dice (§6.7).

Decisiones de esta especificación: D-97 en `docs/decisions.md` (cada apartado cita su letra).

## 1. Qué se ve

Al entrar en la web (escritorio con WebGL 2), la vista central es el polo sur de la Luna en 3D, con su relieve real colocado sobre la curvatura lunar, iluminado por el Sol en su posición real del instante del cursor, con las sombras largas y rasantes del polo, el cielo negro con estrellas y la Tierra y el Sol en su sitio. La cámara arranca orbitando el escenario activo (A), mirando hacia el Sol para que la luz rasante cruce el terreno (§7.1). Sobre el terreno: chinchetas de los escenarios A–D, contornos de las regiones de Artemis, el resto de sitios del catálogo, las trayectorias del Sol (ámbar) y de la Tierra (cian) durante la misión y la cresta que tapa el Sol con `Ridge … away`. Se puede orbitar, volar y bajar a ras de suelo (ojos a 2 m), que coincide con el panorama 2D.

Inspiración: `docs/design/ref-3-concepto.jpg` (relieve con las trayectorias del Sol en ámbar y de la Tierra en cian sobre el sitio) y la estética de `docs/design/ref-1-open-horizon.jpg` y `docs/design/open-horizon/` (fondo `#0A0E17`, líneas finas, rótulos en Inter y cifras en JetBrains Mono). Nada de la imagen de concepto se copia literalmente: su malla de líneas es estilizada; la nuestra es relieve sombreado (D-97 a).

## 2. Datos

Solo lo que ya publica `09_contrato_datos.md`, sin física nueva. Ningún fichero nuevo es obligatorio.

### 2.1 Qué escena se monta (D-97 b)

Para el escenario activo, en este orden:

| Caso | Condición | Escena | Rótulo de relieve 3D |
| --- | --- | --- | --- |
| (a) Polar | El punto del sitio, pasado al mapa con `xyOfLatLon` (`core/grid.ts`), cae dentro del rectángulo de la malla (`x ∈ [−200, 176] km`, `y ∈ [−152, 184] km`, `08` §1.2) **y** `map/dem_500m.bin.gz` se ha cargado | Escena polar completa con `map/dem_500m.bin.gz`. Vale para sitios `lola_polar` del catálogo, puntos de malla `grid:i,j` y coordenadas propias dentro de la zona | `3D terrain: LOLA polar 500 m` |
| (b) Perfil | No es (a), el sitio es del catálogo y `has_profile` | Malla local radial desde `profile/<site_id>.bin.gz` (§4.2) | `3D terrain: reconstructed from the horizon profile` |
| (c) Anillo | No es (a) ni (b) y hay máscara (`has_mask` o punto de malla) | Suelo liso a la cota del sitio y anillo de horizonte desde la máscara (§4.3) | `3D terrain: horizon ring only` |
| (d) Luna lisa | Ninguno de los anteriores (`relief = smooth` o coordenadas propias fuera de la zona) | Esfera lisa (§4.4) con el aviso rojo de Luna lisa | `Smooth Moon (no terrain)` en rojo con triángulo |

Si la escena polar falla al cargar (sin origen pesado, error de red, cabecera o tamaño incorrectos), el sitio baja al caso (b), (c) o (d) que le corresponda y el grupo de controles muestra `3D terrain could not be loaded.` con `Retry` (§10.3). Nunca queda la pantalla vacía.

### 2.2 Relieve polar: `map/dem_500m.bin.gz`

- Origen pesado (`config.heavy_base_url`), ruta `map/dem_500m.bin.gz`. Formato (`09` §8.3): `int16[672][752]`, cota en metros en el centro de cada celda, −32768 = sin dato, sin cabecera, 1.010.688 B sin comprimir. Se comprueba el tamaño exacto tras descomprimir (`checkBinary` de `core/loaders.ts`); si no cuadra, error `contract` (`error.contract`).
- Malla y celdas: las de `08` §1.2 (752 × 672 celdas de 500 m; centro de (i, j) en `x = −200.000 + (i + 0,5)·500`, `y = 184.000 − (j + 0,5)·500`). Cubre unos 376 × 336 km.
- Huecos (−32768): el trabajador los rellena con la media de los vecinos válidos (iterando hasta 8 pasadas) y guarda una máscara de huecos; las celdas rellenadas se dibujan con una trama de puntos tenue (nada solo por color). Con datos reales no se esperan huecos (el ejemplo de T-02 no tiene).
- En desarrollo sin datos reales: el `dem_500m.bin.gz` sintético de `contract/examples/data/map/` (un cuenco liso de −2.996 a +257 m) ya está en `web/public/data/map/`. El fichero real lo genera `make layers` tras T-28 y lo publica I1 con T-39; I1 lo pasa a I3 por privado (`C:\lunar_datos\out\heavy\map\dem_500m.bin.gz`) para probar en local copiándolo a `web/public/data/map/` **sin hacer commit** (es dato pesado; `09` §1).

### 2.3 Sitios fuera del polo: `profile/<site_id>.bin.gz`

Formato `09` §6: `int16[720][512]` de cotas, una por acimut (`0,5·j` grados) e intervalo `b`; la distancia de dibujo del intervalo es `profileBinDistance(law, b)` (`core/law.ts`, `06` §8), con la ley del fichero (`law_id`). Cada valor es la cota de la muestra **de mayor elevación** del intervalo (`06` §8): reproduce exactamente la silueta del horizonte vista desde el sitio, pero vista desde arriba es una aproximación (crestas algo exageradas). Por eso su rótulo dice «reconstructed» (D-97 c). Se lee con `decodeProfile` (`core/loaders.ts`).

### 2.4 Máscara del sitio

La máscara (`horizon/<site_id>.json`, o la del cubo para `grid:i,j`) llega ya resuelta por `useScenarioModel` (`ui/common/model.ts`): `Mask` con `elDeg`, `distM`, `blkLatDeg`, `blkLonDeg`, `blkHeightM` (NaN en puntos de malla) y `siteHeightM`. La 3D la usa para la línea del horizonte calculado (§7.4), la cresta (§8.4), las trayectorias (§8.3) y el caso (c).

### 2.5 Teselas de detalle de 40 m (opcionales)

`detail/<id>.bin.gz` y `detail/index.json` los define el carril I1 en T-80 (recorte de 24 km a 40 m de `LDEM_80S_40M`, 600 × 600 cotas `int16` con su escala, centrado en cada región de `map/regions.json` y en cada sitio `lola_polar`; el índice da `x0`, `y0` en la proyección del mapa, el paso, el tamaño y la escala). Esta especificación **no** fija su formato: lo hará `09_contrato_datos.md` en una versión menor (T-80). Uso en la 3D (T-73, §4.5): sustituyen al relieve de 500 m dentro de su recuadro cuando la cámara se acerca. Si T-80 no está integrada o el índice no existe, la función no se pinta (`14_ux_malaga.md` §8) y no hay aviso.

### 2.6 Sol y Tierra

Con el núcleo existente y nada más: `useEphemerisTable`/`useScenarioModel` para la tabla y el marco del sitio, `skyAt(table, frame, t)` (`core/frames.ts`) para acimut, elevación, distancia y radio angular, y `evaluate` (`core/visibility.ts`) para el estado visible, el margen y el eclipse en el instante del cursor. Las trayectorias usan `bodyTrace` (`ui/panorama/texts.ts`), la misma función que el panorama 2D. Así la 3D y la 2D dan **los mismos** acimuts, elevaciones y márgenes (prueba U4, §15.1).

### 2.7 Otros ficheros que se reutilizan

`map/regions.json` (contornos de región, `box_m`), `sites.json` (marcas del catálogo), `map/grid.json` (comprobación de la malla con `gridMatches`), `cube/done.bin` y los trozos del cubo (clic en el terreno, como `on_map_click`), `layers/layers.json` y `layers/<period>.bin.gz` (capas proyectadas, §9). Se cargan con el mismo `loader` de `core/loaders.ts` y su caché, de modo que lo que ya cargó la vista del mapa no se pide dos veces.

## 3. Marco de la escena (D-97 d)

### 3.1 Definición

Cada escena tiene un **ancla** A con latitud, longitud y cota: el polo (−90°, 0°, 0 m) en la escena polar; el propio sitio (su latitud, longitud y `siteHeightM`, o 0 en Luna lisa) en las escenas (b), (c) y (d). Con la base local del ancla `(E, N, U) = enuBasis(latA, lonA)` (`core/frames.ts`) y su posición `o = (R + hA)·U` en MOON_ME (metros, R = 1.737.400 m):

```
toScene(p)   = ( (p − o)·E,  (p − o)·U,  −(p − o)·N )      # p en MOON_ME, metros
fromScene(s) = o + s.x·E + s.y·U − s.z·N
```

Ejes de three.js: +Y arriba (vertical local del ancla), +X al este del ancla, −Z al norte del ancla. Es una rotación propia (sin reflexión): `E × U = −N`. El centro de la Luna queda en `(0, −(R + hA), 0)`.

En el polo, `enuBasis(−90, 0)` da `E = (0, 1, 0)`, `N = (1, 0, 0)`, `U = (0, 0, −1)`: el eje +X de la escena es el eje +x del mapa (90° E) y el eje −Z es el eje +y del mapa (0° E, el lado de la Tierra). Visto desde arriba con `camera.up = (0, 0, −1)`, la escena polar se ve **igual que el mapa 2D**.

### 3.2 Del mapa a la escena (escena polar)

Con las fórmulas cerradas de `08` §1.2 (`ρ = √(x² + y²)`, `c = 2·atan(ρ/2R)`, `u0 = (sin c·y/ρ, sin c·x/ρ, −cos c)`), un punto del mapa (x, y) a cota h queda en

```
X = (R + h)·sin c·x/ρ
Y = (R + h)·cos c − R
Z = −(R + h)·sin c·y/ρ
```

y en ρ = 0, `(0, h, 0)`. La inversa (para el clic y la lectura bajo el puntero): `p = fromScene(s)`, `r = |p|`, `h = r − R`, `lat = asin(p.z/r)`, `lon = atan2(p.y, p.x)`, y `xyOfLatLon` → (x, y) → `cellOfXY` → (i, j).

### 3.3 Precisión

Las posiciones se calculan en `float64` en el trabajador y se guardan en `Float32Array` **relativas al centro de su tesela** (§4.1); el desplazamiento de cada tesela va en `mesh.position` (`float64` en la CPU). Error de posición < 1 cm en toda la escena. Profundidad: `logarithmicDepthBuffer: true` (plano cercano 0,5 m, lejano 4.000 km), porque la cámara pasa de 2 m sobre el suelo a 800 km de altura (D-97 e).

## 4. Mallas

Todo el trabajo pesado (descompresión, relleno de huecos, posiciones, normales, índices) se hace en un trabajador propio, `web/src/ui/stage3d/mesh.worker.ts` (`new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' })`), que devuelve los `ArrayBuffer` transferidos. El hilo principal solo crea los `BufferGeometry`.

### 4.1 Escena polar

- **Vértices**: uno por celda, en el centro de la celda, con la fórmula del §3.2 y la cota del DEM. Nivel `alto`: 752 × 672 = 505.344 vértices, 2 · 751 · 671 = 1.007.842 triángulos. Niveles `medio` y `bajo` (1 km): media de cada bloque de 2 × 2 celdas, 376 × 336 vértices (§12.2).
- **Teselas**: la malla se parte en 8 × 8 teselas (94 × 84 celdas en 500 m) con un vértice de solape, para descartar por frustum y para tener coordenadas locales pequeñas (§3.3).
- **Normales**: producto vectorial de las diferencias centrales de las posiciones 3D (incluye la curvatura).
- **Faldón**: en el borde exterior de la malla, una tira vertical que baja 3 km bajo el borde, para que no se vea el canto.
- **Más allá de la malla**: esfera lisa de radio R (centro en `(0, −R, 0)`) con el mismo material, 256 × 128 segmentos, cuyo sombreador descarta los fragmentos que caen dentro del rectángulo de la malla (encogido una celda) para no atravesar el relieve donde la cota es negativa. Cuando la esfera se ve, el rótulo de relieve añade `· beyond the mapped area: smooth Moon`.
- **Datos guardados en la CPU**: el `Int16Array` del DEM se queda también en el hilo principal (1 MB) para la colisión de la cámara y la lectura bajo el puntero (interpolación bilineal, §7.6).

### 4.2 Escena de perfil (caso b)

Malla radial alrededor del sitio: para cada acimut `a_j` (j = 0…719; en niveles medio y bajo, uno de cada dos) y cada intervalo `b` (0…511), el punto a distancia `d_b = profileBinDistance(law, b)` y cota `h[j][b]`:

```
θ = d_b / R;   T_j = cos a_j·N_s + sin a_j·E_s          # base del sitio (= del ancla)
p = (R + h)·(cos θ·U_s + sin θ·T_j)                     # MOON_ME; luego toScene
```

más un vértice central en el sitio a `siteHeightM`. Huecos: interpolación lineal en `b` entre vecinos válidos; un acimut entero sin datos toma la Luna lisa (`h = 0`). Más allá de 300 km, esfera lisa de radio R (descarta el disco de 300 km). Triangulación en abanico de anillos (bandas `b`/`b+1` × `j`/`j+1`).

### 4.3 Escena de anillo (caso c)

Suelo: casquete esférico de radio `R + siteHeightM` y 30 km de radio angular alrededor del sitio, sobre la esfera lisa. Anillo: para cada acimut j, un panel vertical en `dist_m[j]` desde la cota del suelo hasta `blk_height_m[j]`; si es NaN (punto de malla), la cota que da la elevación de la máscara, `h = siteHeightM + h_obs + d·tan(el) + d²/(2R)` (inversa aproximada de `06` §4.3, error < 1 m hasta 50 km; solo es dibujo). El anillo es exacto mirado desde el sitio y tosco desde fuera: su rótulo lo dice (§2.1).

### 4.4 Luna lisa (caso d)

Esfera de radio R con un casquete de 300 km de radio alrededor del sitio teselado fino (segmentos de ≤ 250 m cerca del sitio) para que la vista a ras de suelo dé el horizonte liso correcto (2.636 m a 2 m de altura, `06` §9). Rótulo rojo con triángulo `Smooth Moon (no terrain)` y el aviso `relief.smooth_warning` en el grupo de controles.

### 4.5 Teselas de detalle (T-73)

Si existe `detail/index.json` y alguna tesela contiene el punto bajo la cámara con altura sobre el suelo < 8 km (o el sitio activo en modo a ras de suelo), se carga esa tesela (una cada vez, caché de 3) en el trabajador: 600 × 600 vértices a 40 m, faldón de 200 m. La malla de 500 m descarta sus fragmentos dentro del recuadro de la tesela (encogido 500 m) y la tesela se dibuja encima. Las sombras de la tesela se calculan con su propio paso (§6.3) leyendo la tesela dentro del recuadro y el DEM de 500 m fuera. El rótulo de relieve pasa a `3D terrain: LOLA polar 40 m (near) + 500 m`.

## 5. Sol, Tierra y cielo

### 5.1 Direcciones (D-97 f)

Para el escenario activo y el instante del cursor, `skyAt` da `(az, el)` de cada astro en el marco local del **sitio**. La dirección en la escena se construye desde esos dos ángulos, no desde el vector de efemérides:

```
d_local = (cos el·sin az, cos el·cos az, sin el)                 # (E, N, U) del sitio
d_me    = d_local.x·E_site + d_local.y·N_site + d_local.z·U_site
d_scene = ( d_me·E_A, d_me·U_A, −d_me·N_A )                       # rotación del ancla, sin traslación
```

Así, en cualquier modo, la dirección del Sol y de la Tierra vista desde el sitio es la del núcleo hasta el último bit de `float64` (prueba U4). La paralaje de la Tierra (0,26° entre el centro de la Luna y la superficie) queda incluida porque `skyAt` ya parte de la posición del sitio. La paralaje de la cámara cuando se aleja del sitio (≤ 0,12° a 800 km para la Tierra) se ignora: el cielo es el del sitio activo, y el grupo de controles lo dice en el modo vuelo cuando la cámara está a más de 50 km del sitio (`Sky as seen from site {letter}`).

### 5.2 Cielo

Un segundo `Scene` de cielo, dibujado antes del terreno con una cámara que solo copia la rotación de la principal (cielo en el infinito; el terreno lo tapa por orden de dibujo):

- **Fondo**: negro `#000000` puro (sin atmósfera, sin niebla, sin degradado azul). El degradado del armazón queda debajo y no se ve con la 3D montada.
- **Estrellas**: 4.000 puntos con semilla fija (posición uniforme en la esfera, magnitud con distribución exponencial, tamaño 1–2 px, blanco a blanco azulado). Decorativas, no un catálogo (D-97 g). Brillo atenuado un 70 % cuando el Sol está en el campo de visión (deslumbramiento).
- **Sol**: disco a su radio angular real (`radiusDeg` de `skyAt`, ~0,27°), color `#FFF8E7` con un borde ligeramente oscurecido (oscurecimiento de limbo lineal, ilustrativo); halo aditivo de 8° de radio con caída exponencial teñido de `--c-sun` (`#F59E0B`) al 25 %, que tapa el terreno por orden de dibujo cuando el Sol está detrás de una cresta. Nivel `bajo`: sin halo.
- **Tierra**: esfera a su radio angular real (~0,95°), iluminada por la misma dirección del Sol, de modo que su **fase** sale sola de la geometría. Material propio sin imágenes: océano `#1E4E8C`, nubes de ruido procedural blanco al 35 %, borde atmosférico fino cian; **sin texturas de la NASA ni logotipos** (CLAUDE.md §10 bis). Cara nocturna `#05070C`. Durante un eclipse de Sol visto desde la Luna (`evaluate(...).eclipse.kind ≠ 'none'`) la Tierra se dibuja delante del Sol (orden de dibujo) y la luz del Sol se multiplica por `1 − covered`; sin colores rosas ni morados.
- **Exposición**: mapeo de tonos ACES fílmico, exposición fija 1,0; sin ajuste automático.

## 6. Realismo del terreno

### 6.1 Luz del Sol

Luz direccional con la dirección `d_scene` del Sol (§5.1), intensidad 8,0 (visual; D-107 c) multiplicada por la fracción no eclipsada. Dentro de la escena polar, el ángulo del Sol en cada punto cambia con la vertical local (hasta 9° de diferencia entre el centro y la esquina de la malla): no hace falta hacer nada, sale de usar la dirección global y las normales reales.

### 6.2 Material de regolito (D-97 h)

Sombreador propio (`ShaderMaterial`), no `MeshStandardMaterial`:

- **Reflectancia**: modelo lunar-Lambert de McEwen, `I = A·[ 2·L(α)·cos i/(cos i + cos e) + (1 − L(α))·cos i ]`, con `i` el ángulo de incidencia, `e` el de emisión (hacia la cámara) y α el ángulo de fase. `L(α)` con el polinomio de McEwen (1991/1996). **Los coeficientes y la fuente exacta se verifican en T-71 antes de usarlos** (documentación del modelo `LunarLambertMcEwen` de USGS ISIS) y se anotan en `docs/constants.md` con su fuente; si no se encuentran, `L = 0,5` constante con la nota «visual only» (CLAUDE.md §2: ninguna constante sin fuente).
- **Albedo**: gris neutro `A = 0,12` modulado ±15 % por ruido de baja frecuencia anclado al mapa (para que el relieve se lea), visual.
- **Detalle cercano**: ruido procedural fBm de 3 octavas (longitudes de onda 40, 12 y 3 m) que modula el albedo (±10 %) y perturba la normal; entra con la distancia a la cámara entre 6 y 1,5 km y se desactiva en el nivel `bajo`. Es textura inventada, no relieve: el texto del §6.7 lo cubre.
- **Trama de huecos** (§2.2) y **capa proyectada** (§9) se mezclan en este mismo sombreador.

### 6.3 Sombras proyectadas: horizonte por celda en la GPU (D-97 i)

Los mapas de sombras clásicos fallan con el Sol a 0–2° sobre un terreno de 376 km (acné, estiramiento, resolución). En su lugar, cada vez que cambia la dirección del Sol se calcula en la GPU, con un paso de sombreador a una textura `R8` del tamaño de la malla (752 × 672 en `alto`, 376 × 336 en `medio` y `bajo`), la **elevación del horizonte de cada celda en el acimut del Sol** con la misma geometría que el cubo (`08` §3.2) y, de ahí, la fracción de disco iluminada:

```
para cada celda (x, y) con cota h0:
    u0, E, N = base local (08 §1.2);  E_map = (y/ρ, −x/ρ);  N_map = (x/ρ, y/ρ)   (en ρ = 0: (1,0) y (0,1))
    el_sol = asin(s·u0);  az = atan2(s·E, s·N)                   # s = dirección del Sol en MOON_ME
    dir = sin az·E_map + cos az·N_map                             # dirección en el plano del mapa
    H = −∞
    para k = 0, 1, …:  d_k = 250 m · 1,04^k  (hasta 300 km o la salida de la malla; ≤ 181 pasos)
        (xk, yk) = (x, y) + d_k·dir
        hk = bilineal(DEM, xk, yk)                                # texelFetch + bilineal a mano (D-97 j)
        θ = d_k / R
        el_k = atan2((hk − h0 − 2) − 2·(R + hk)·sin²(θ/2), (R + hk)·sin θ)
        H = max(H, el_k);  si H > el_sol + ρ_sol: salir            # ya está en sombra
    luz = clamp((el_sol − H) / (2·ρ_sol) + 0,5, 0, 1)            # ρ_sol = radio angular del Sol
```

- El observador a 2 m (`− 2`) evita la autosombra por muestreo y coincide con el convenio del proyecto.
- La distancia en el mapa se toma igual a la distancia sobre el terreno (el factor de escala de la estereográfica es ≤ 1,006 en la malla): es dibujo.
- Fuera de la malla no hay relieve: el rayo termina. Una montaña fuera de la malla no hace sombra (aceptado; el borde de la malla está a ≥ 13,5 km de las regiones, `08` §1.2).
- La penumbra lineal en el ángulo es la versión continua del criterio del proyecto («centro del disco sobre el horizonte»: `luz = 0,5` exactamente cuando el centro roza el horizonte).
- Coste: 505.344 celdas × ≤ 181 muestras ≈ 9·10⁷ lecturas: unos milisegundos en una GPU integrada. Se recalcula cuando el Sol se mueve más de 0,01° (un cambio de cursor), con el límite de frecuencia de su nivel (§12.2).
- En la escena de perfil (b) el mismo algoritmo corre sobre la malla radial: textura `720 × 512` indexada por (acimut, intervalo), muestreando a lo largo de la dirección del Sol en el plano tangente del sitio por interpolación en la malla radial. En (c) y (d) no hay sombra proyectada (solo Lambert y el anillo).

El sombreado del terreno es `luz × reflectancia + tierra + ambiente` (§6.4). **Las sombras son ilustrativas**: usan el relieve de 500 m (o el perfil), no el de 40 m + 120 m de las máscaras. La chincheta y las cifras del sitio dicen la verdad del núcleo (§8.1), aunque la textura de sombra discrepe en el borde.

### 6.4 Luz de la Tierra y ambiente

- **Luz de la Tierra** (tierra clara, *earthshine*): direccional desde la Tierra (§5.1), intensidad `0,004 × fase_iluminada_de_la_Tierra` (visual, unas 1/750 de la luz del Sol), color `#AFC6E8`, sin sombras. Hace legibles, muy tenues, las zonas en sombra del lado de la Tierra (0° E), como en la realidad.
- **Ambiente**: 0,002, gris neutro. Nada más: las sombras del polo son casi negras y así se ven (realismo).

### 6.5 Curvatura

Sale de las posiciones reales (§3.2): a 200 km del ancla el suelo cae 11,5 km (`d²/2R`). Desde 100 km de altura se ve el borde curvo de la Luna contra el cielo negro.

### 6.6 Lo que no se hace

Sin exageración vertical (×1 siempre, para que el modo a ras de suelo coincida con el panorama; D-97 k), sin atmósfera, sin niebla, sin desenfoque de profundidad, sin texturas de imágenes reales, sin posprocesado salvo el halo del Sol y el mapeo de tonos.

### 6.7 Aviso obligatorio

En el grupo de controles, siempre visible con la 3D montada, en texto de 12 px `--c-muted`:
`Illustrative 3D shading. All figures come from the horizon calculation.`
y debajo la línea de relieve: `3D terrain: LOLA polar 500 m · Figures: {relief_label}` (CLAUDE.md §11: nunca mezclar relieves sin decirlo).

## 7. Navegación

Tres modos con un selector de texto (`Orbit`, `Fly`, `Ground`) en el grupo de controles. Todas las teclas de este apartado actúan **solo con el foco en la vista 3D** (§10.1), salvo que se diga otra cosa; no chocan con los atajos globales (`1`–`4`, `Espacio`, `[`, `]`, `?`, `V`; D-97 l).

### 7.1 Órbita (por defecto)

- Centro: el sitio activo, en la superficie del DEM. Arrastre con el botón principal, gira; rueda o pellizco, acerca y aleja (exponencial); arrastre con el secundario o con dos dedos, desplaza el centro sobre el terreno.
- Distancia de 300 m a 800 km; ángulo sobre el horizonte local del centro de 3° a 89°; la cámara nunca queda a menos de 50 m sobre el terreno (§7.6). Amortiguación suave (sin ella con movimiento reducido).
- **Encuadre inicial** (y de `Recenter`): distancia 18 km, 14° sobre el horizonte, rumbo de la cámara = acimut del astro de enfoque (`focusBody`) + 180°, de modo que la cámara mira hacia ese astro y su luz rasante cruza el terreno hacia el espectador. Si el escenario B está a menos de 25 km de A, la distancia se ajusta para que entren los dos.
- Teclado: flechas giran 5°; `+` / `−` (o `PageUp` / `PageDown`) acercan y alejan ×1,25; `Enter` equivale a un clic en el centro (§10.2); `Home` = `Recenter`.
- Al cambiar `focusBody` (botones `Centre on Sun` / `Centre on Earth` del armazón), la cámara gira (vuelo suave de 1 s) al rumbo del nuevo astro.

### 7.2 Vuelo

- Movimiento: `W`/`S` o `↑`/`↓` adelante y atrás; `A`/`D` o `←`/`→` a los lados; `E` sube y `Q` baja; `Mayúsculas` ×5. Mirar: arrastre con el ratón (giro y cabeceo, cabeceo limitado a ±89°). Sin bloqueo del puntero (es una trampa de foco).
- Velocidad según la altura sobre el suelo `AGL`: `v = clamp(0,8·AGL /s, 20 m/s, 80 km/s)`. Arriba = vertical local de la cámara (no la del ancla), así que volar lejos no inclina el mundo.
- Táctil: un dedo mira; pellizco avanza o retrocede; dos dedos en vertical suben y bajan.
- Nunca se atraviesa el terreno (§7.6); altura máxima 2.000 km.

### 7.3 A ras de suelo

- Ojo en el sitio activo, a `max(DEM bilineal, siteHeightM) + observerHeightM` (2 m o 10 m, la del escenario). Se mira 360°: arrastre, flechas (±1°, como el panorama), rueda o pellizco cambian el campo de visión de 20° a 90° (60° por defecto).
- Al entrar: rumbo = acimut del astro de enfoque y cabeceo = elevación del horizonte calculado en ese acimut, igual que el centro del panorama 2D (`10` §6.1).
- Se dibuja sobre el cielo la **línea del horizonte calculado** (la máscara: 720 puntos `(az_j, el_j)` como direcciones desde el ojo), línea de 1,5 px `--c-text` al 70 %, con el rótulo `Computed horizon` una vez; y, si `showSmooth`, la línea del horizonte liso discontinua (`--c-muted`) con `Smooth Moon`. Es lo que hace que la 3D a ras de suelo **coincida con el panorama**: la silueta del relieve de 500 m puede diferir, la línea no (prueba E3).
- Lectura del centro de la vista con el formato del panorama: `Az 271.5° · El 0.92° · Horizon 0.88°` (`pointerReadout` de `ui/panorama/texts.ts`).
- En los casos (b)–(d) el ojo se coloca igual, sobre su malla.

### 7.4 Vuelos «Go to»

- Al activar otro escenario (`setActiveScenario`) o cambiar su sitio (selector, clic en el mapa o en el terreno), la cámara vuela al nuevo sitio conservando el modo (en `Ground`, aterriza en él).
- Menú `Go to…` del grupo de controles: escenarios A–D (letra, forma y nombre), las regiones de Artemis de `map/regions.json` y `South Pole`. Elegir una región vuela a encuadrar su caja (`box_m`) sin cambiar ningún escenario.
- Trayectoria: el centro recorre el círculo máximo entre origen y destino; la distancia de la cámara sigue un arco que sube hasta `max(d_inicial, d_final, 0,6 × separación)` a mitad de camino; duración `clamp(0,8 + 0,4·log10(separación_km + 1), 0,8, 3) s`, aceleración y frenado suaves; una tecla o un arrastre lo interrumpen.
- Si el destino está en otra escena (p. ej. de un sitio polar a Blue Ghost 1), fundido a negro de 250 ms, se monta la otra escena y fundido de entrada.
- Con `prefers-reduced-motion`: salto directo, sin vuelo ni fundido (§13).

### 7.5 Recentrar y ayuda

- `Recenter` (y `Home`): vuelve al encuadre inicial de la órbita del sitio activo (§7.1).
- `?` del grupo (botón, no la tecla global): ventana pequeña no modal con los controles del modo actual, en una lista de dos columnas (tecla · acción) y su equivalente táctil. Se cierra con `Esc` o `✕`. Los atajos de la 3D se añaden también a la ayuda global de atajos del armazón (I2) con la lista exportada `STAGE3D_SHORTCUTS` (§10.4).

### 7.6 No atravesar el terreno

`groundAt(x, y)`: cota bilineal del DEM de la CPU (o de la tesela de detalle si está cargada, o del perfil/esfera en los otros casos). Después de cada movimiento de cámara: `altura ≥ groundAt + margen`, con margen 2 m en `Ground`, 5 m en `Fly` y 50 m en `Orbit`; si no se cumple, la cámara sube por la vertical local hasta cumplirlo. En `Orbit`, además, si el segmento cámara–centro corta el terreno (8 muestras), la distancia se acorta hasta despejarlo. Prueba U5.

### 7.7 Historia guiada (modo Learn)

En Learn la 3D no captura teclas (las flechas y el espacio son de la historia, D-83 e); el ratón y el táctil siguen funcionando. Si el paso activo muestra la pestaña Horizon con la 3D, se aplica una cámara fija por paso: paso 1, órbita sobre A a 12 km, 10° sobre el horizonte, rumbo hacia el Sol (la reproducción a 6 h/s de 4 s del guion anima las sombras). Los demás pasos usan otras pestañas. Con movimiento reducido, la misma cámara sin transición.

## 8. Señales en la escena

Rótulos en una capa DOM superpuesta (no texto dentro de WebGL): nítidos, accesibles y con las fuentes del contrato. Cada fotograma con cambios se proyectan sus anclas y se escribe `transform` directamente (sin rerender de React). Ocultación: un rótulo se oculta si su ancla queda detrás del terreno (rayo contra la malla de 1 km, como mucho cada 200 ms) o fuera de la pantalla. Prioridad cuando se solapan (se oculta el de menor prioridad): chinchetas de escenario > cresta > regiones > sitios del catálogo. Como mucho 14 rótulos a la vez.

### 8.1 Chinchetas de los escenarios A–D

- En cada escenario cuyo sitio cae en la escena: un mástil fino vertical de 300 m (escala con la distancia para medir siempre entre 24 y 80 px en pantalla) y, arriba, un botón DOM de 44 × 44 px con la **forma** del escenario (círculo, cuadrado, triángulo, rombo; `10` §2) y su **letra**, borde `--c-text`; el activo, más grande (56 px) y con el anillo de acento del armazón (`--c-accent`, lo fija I2). Al lado, el `short_name` del sitio en Inter 13 px.
- Debajo, en el activo, una línea de estado del núcleo en el instante del cursor: icono + texto, p. ej. `☀ Sun hidden · 🜨 Earth 1.71°` con los iconos del proyecto (`10` §2) y los mismos números que el panel `Now at site`.
- Clic o `Enter` en una chincheta: `setActiveScenario(letra)`.
- Escenarios cuyo sitio está en otra escena: no se dibujan; el menú `Go to…` los lista.

### 8.2 Regiones de Artemis

Contorno de cada caja `box_m` de `map/regions.json` como línea pegada al terreno: los cuatro lados muestreados cada 250 m con la cota bilineal + 15 m, línea de 1,5 px `--c-text` al 55 %, discontinua para `status` distinto de `candidate_2024`. Rótulo con el nombre (`name`) en el centro de la caja, visible si la cámara está a menos de 250 km. Clic en el rótulo: `Go to` esa región (§7.4).

### 8.3 Trayectorias del Sol y la Tierra

- Para el escenario activo, `bodyTrace` (la misma que el panorama) de aterrizaje a fin de misión, con paso de 1 h. Cada punto `(az, el)` → dirección (§5.1) → punto en una cúpula de 20 km de radio centrada en el ojo del sitio (`siteHeightM + h_obs`). Vista desde el sitio, la dirección es exacta (la paralaje de 2 m a 20 km es despreciable); vista desde fuera, se lee como en `ref-3-concepto.jpg`.
- Trazo: el Sol en `--c-sun` (`#F59E0B`) continuo de 2 px; la Tierra en `--c-earth` (`#38BDF8`) continuo de 2 px con un patrón de rayas largas. Donde el astro está bajo el horizonte calculado (`el ≤ horizonAt(mask.elDeg, az)`), el trazo pasa a punteado fino al 45 % (oculto por el relieve): el estado se lee por el patrón, no solo por el color.
- Marcas cada 24 h desde el aterrizaje, con `Day n` cada 2 días; el instante del cursor, una cuenta de 6 px rellena. Rótulos `Sun path` y `Earth path` en el extremo final.
- Si la cúpula corta el terreno (crestas de más de 20 km de radio que superan la cúpula), se dibuja igualmente encima (sin prueba de profundidad), con borde oscuro de 1 px para leerse sobre el relieve.

### 8.4 La cresta que bloquea

- Para el astro de enfoque en el instante del cursor (y además el Sol si está tapado aunque el enfoque sea la Tierra): `blockerAt(mask, az)` (`core/horizon.ts`) da el punto que bloquea (latitud, longitud, cota o NaN, distancia). Se dibuja en él un rombo de 10 px sobre el terreno (cota de la máscara o, si es NaN, la del DEM), una línea de visión fina del ojo al rombo prolongada hacia el astro, y el rótulo `Ridge 41 km away` (`ridgeLabel`, el mismo texto del panorama) con la elevación y el margen del núcleo debajo en JetBrains Mono (`0.24° · margin −1.21°`).
- **Cresta del horizonte**: los 720 puntos que bloquean de la máscara forman una polilínea sobre el terreno (cota de la máscara o del DEM), 1 px `--c-text` al 35 %; el tramo de ±3° alrededor del acimut del Sol se resalta en `--c-sun` a 2 px cuando el Sol está tapado. Así se ve **qué** cresta tapa el Sol.

### 8.5 Resto de sitios del catálogo

Cada sitio de `sites.json` que cae en la escena y no es escenario: punto de 6 px `--c-text` al 70 % con un anillo; rótulo `short_name` visible a menos de 60 km de la cámara. Clic o `Enter`: el sitio pasa a ser el del escenario activo (`updateScenario(activo, { siteRef: id })`), igual que un clic en un marcador del mapa (`10` §6.4).

### 8.6 Rosa de rumbos, escala y lectura

En el grupo de controles (§10.1):
- **Rosa de rumbos**: círculo de 44 px con `N` que gira con la cámara (norte local del sitio activo; en la escena polar, además, una marca `0° E` hacia el lado de la Tierra). Es un botón: clic = norte arriba (vuelo de 0,5 s).
- **Barra de escala**: longitud redonda (1–2–5 × 10ⁿ m) que mide entre 60 y 120 px a la distancia del centro de la pantalla; texto `2 km` (`units.km`) o `500 m`.
- **Lectura** bajo el puntero, o bajo la cruz central si no hay puntero (teclado y táctil, `14` §6): `87.21° S, 125.48° E · +1,204 m` con `formatLatLon` (3 decimales) y `formatInt`; fuera del terreno, `—` no: se oculta la línea.

## 9. Capas del mapa proyectadas

- Botón `Overlay` del grupo de controles: `None` (por defecto en la 3D), `Sunlight`, `Earth contact`, `Sun + Earth`. Elegir una capa la escribe en el almacén (`setMapLayer`), de modo que el mapa 2D queda igual; el periodo es el del almacén (`mapPeriod`) y se cambia en la vista del mapa (la 3D lo rotula: `Period: Aug 2027 · change it in the Map view`). Solo en la escena polar.
- `layers/<period>.bin.gz` (`09` §9.2) → textura `R8` de 752 × 672 por banda, misma rejilla que el DEM, sin reproyección. Color con las rampas del mapa 2D (`rampStep` y `rampColour` de `ui/map/mapData.ts`, que I2 actualiza con la paleta v2 de `15_interfaz_v2.md`) en una tabla de 11 colores; 255 = sin dato, transparente con la trama de puntos.
- Mezcla en el material: `mix(regolito iluminado, color de la rampa × (0,55 + 0,45·cos i), 0,7)`, para que el relieve se siga leyendo bajo la capa.
- Leyenda en el grupo de controles: rampa de 0 a 100 %, `Share of time (%)`, el criterio `Sun or Earth centre above the real horizon, observer at 2 m` y el periodo. Mismos textos que el mapa (`10` §6.4).
- Plan B (`source = nasa_avgvisib`): solo `Sunlight` y la banda fija de `10` §6.4.

## 10. Integración con la aplicación

### 10.1 Componente y superficie (anexo A)

- `web/src/ui/stage3d/index.tsx`: `export default function Stage3D()`, sin props. El armazón (I2) lo carga con `import()` dinámico y lo monta cuando `viewMode = '3d'` y la pestaña activa es Horizon (`tab = 'panorama'` en el almacén).
- Llena su contenedor (`position: absolute; inset: 0`). Estructura:
  - `div.stage3d` con `role="group"`, `aria-roledescription="3D view"`, `aria-label` = `3D view of {site}. Use the arrow keys to look around; press ? in the controls for help.` y `tabIndex=0`: recibe el foco y las teclas de §7;
  - dentro, el `<canvas>` con `role="img"`, `aria-label` breve (`3D view of the lunar surface around {site}`) y `aria-describedby` apuntando a la descripción textual (§13);
  - la capa DOM de rótulos (§8);
  - el **grupo de controles de cámara** (único panel propio).
- **Grupo de controles**: abajo a la derecha, por encima de la barra de tiempo. Para no chocar con el minimapa y la franja inferior de I2, se coloca con dos variables CSS que pone el armazón en el contenedor del escenario: `right: var(--stage3d-inset-right, 24px)` y `bottom: var(--stage3d-inset-bottom, 120px)` (D-97 m, propuesta a I2). Contenido, en dos filas: (1) selector `Orbit` / `Fly` / `Ground`, `Go to…`, `Recenter`, `Overlay`, `?` (botones de 44 × 44 px como mínimo, 8 px de separación, componente `Button` del proyecto); (2) rosa de rumbos, barra de escala, lectura, y debajo el aviso y la línea de relieve (§6.7). Fondo `--c-panel`, `backdrop-filter: blur(12px)`, borde `--c-line`, radio el de los paneles de I2. Plegable con un botón `✕`/`3D controls` para despejar el centro (estado local, recordado en `localStorage` con `try/catch`).
- Los paneles del armazón quedan encima y solo capturan el puntero en su superficie: el resto del área es de la 3D.

### 10.2 Lo que lee y escribe del almacén

Lee, con los selectores existentes y `useScenarioModel`: escenarios, escenario activo, `cursorUnix`, `playing`, `focusBody`, `showSmooth`, `mapLayer`, `mapPeriod`, `mode`, `storyStep`. Escribe solo con acciones existentes: `setActiveScenario` (chincheta), `updateScenario` (clic en el terreno o en un sitio del catálogo), `setMapLayer` (capas). Nada de estado propio en el almacén salvo lo del §10.3.

**Clic en el terreno** = `on_map_click` (`08` §7): el clic (puntero que se mueve menos de 5 px entre bajar y subir) o `Enter` sobre la cruz central lanza un rayo contra la malla, pasa el punto al mapa (§3.2), y si (i, j) está en la malla: comprueba `cube/done.bin` y la cota del punto con `loadCellMask` (`ui/map/mapData.ts`) y, si hay datos, `updateScenario(activo, { siteRef: gridRef(i, j) })`; si no, `This area has not been computed yet.` (`map.not_computed`) como aviso breve en el grupo de controles y no cambia nada. Mismo comportamiento que D-85 b. Fuera de la escena polar, el clic no selecciona (solo orbita).

### 10.3 Paso a 2D por fallo (D-97 n, propuesta a I2)

El armazón decide `viewMode` al arrancar (anexo A: `'2d'` sin WebGL o con ventana < 768 px). **Requisito concreto: WebGL 2** (three.js ya no admite WebGL 1); I2 debe comprobar `canvas.getContext('webgl2')`. Si la 3D falla después de montarse (contexto perdido y no recuperado en 3 s, error de compilación de sombreadores, fallo del trabajador o de three.js), Stage3D **lanza el error durante el render** y el límite de errores del armazón (D-102) monta la 2D con su aviso; no hace falta acción ni campo nuevo en el almacén (D-107 a). En la interfaz actual con `?ui=v2&vm=3d`, el límite propio de `stage3d/V1Mount.tsx` hace lo mismo con `stage3d.fallback`. Un error de **datos** no pasa a 2D: baja de escena (§2.1).

### 10.4 Textos

Todos en `web/src/i18n/en.json`, en un bloque contiguo de claves `stage3d.*` colocado en su orden alfabético (entre `section.*` y `status.*`) para no chocar con los cambios de I2 en el mismo fichero. Lista mínima (A3 revisa el tono):

| Clave | Texto |
| --- | --- |
| `stage3d.loading` | `Loading 3D view…` |
| `stage3d.loading_terrain` | `Loading 3D terrain…` |
| `stage3d.terrain_error` | `3D terrain could not be loaded.` |
| `stage3d.fallback` | `The 3D view is not available on this device. Showing the 2D view.` |
| `stage3d.disclaimer` | `Illustrative 3D shading. All figures come from the horizon calculation.` |
| `stage3d.relief_polar` | `3D terrain: LOLA polar 500 m · Figures: {relief}` |
| `stage3d.relief_detail` | `3D terrain: LOLA polar 40 m (near) + 500 m · Figures: {relief}` |
| `stage3d.relief_profile` | `3D terrain: reconstructed from the horizon profile · Figures: {relief}` |
| `stage3d.relief_ring` | `3D terrain: horizon ring only · Figures: {relief}` |
| `stage3d.beyond` | `Beyond the mapped area: smooth Moon` |
| `stage3d.mode` / `.orbit` / `.fly` / `.ground` | `Camera` / `Orbit` / `Fly` / `Ground` |
| `stage3d.goto` / `stage3d.goto_pole` | `Go to…` / `South Pole` |
| `stage3d.recenter` | `Recenter` |
| `stage3d.overlay` / `stage3d.overlay_none` | `Overlay` / `None` |
| `stage3d.overlay_period` | `Period: {period} · change it in the Map view` |
| `stage3d.help` / `stage3d.help_title` | `3D controls help` / `3D controls` |
| `stage3d.controls` / `stage3d.hide_controls` | `3D controls` / `Hide 3D controls` |
| `stage3d.north_up` | `North up` |
| `stage3d.computed_horizon` | `Computed horizon` |
| `stage3d.sun_path` / `stage3d.earth_path` | `Sun path` / `Earth path` |
| `stage3d.sky_from` | `Sky as seen from site {letter}` |
| `stage3d.label` / `stage3d.img_label` | `3D view of {site}. Use the arrow keys to look around; press ? in the controls for help.` / `3D view of the lunar surface around {site}` |
| `stage3d.desc.*` | Plantillas de la descripción textual (§13) |
| `stage3d.keys.*` | Filas de la ayuda (§7.5), p. ej. `W A S D / arrows` · `Move` |

`STAGE3D_SHORTCUTS` (exportado desde `web/src/ui/stage3d/shortcuts.ts`, sin importar three.js) es la lista de `{ keys, actionKey }` que usa la ayuda propia y que I2 puede mostrar en la ayuda global.

### 10.5 Antes de que exista el armazón v2

Si T-71 empieza antes de que T-61 esté en `main`: Stage3D se ve con `?ui=v2&vm=3d` en la interfaz actual, sustituyendo al panorama dentro del recuadro de la vista principal (cambio mínimo en `ui/layout/AppLayout.tsx`, explicado en la petición), sin tocar nada más. Sin esos parámetros, la interfaz actual no cambia (prueba E5).

## 11. Ficheros del carril

Todo dentro de `web/src/ui/stage3d/` (más sus pruebas y `web/e2e/stage3d.spec.ts`):

| Fichero | Contenido | Importa three.js |
| --- | --- | --- |
| `index.tsx` | `Stage3D`: ciclo de vida, estados, superficie, teclas | Sí (es el trozo dinámico) |
| `frame.ts` | Marco de la escena (§3): `makeSceneFrame`, `toScene`, `fromScene`, `mapToScene`, `sceneToMap`, `dirToScene` | No (puro, `Float64Array`) |
| `meshes.ts` | Construcción de mallas (§4), puras, usadas por el trabajador y las pruebas | No |
| `mesh.worker.ts` | Descarga, descompresión, relleno, mallas | No |
| `shadow.ts` / `shadow.glsl.ts` | Algoritmo de §6.3 en TypeScript (referencia para pruebas) y en GLSL | No / cadena |
| `camera.ts` | Modos, vuelos, colisión (§7), puros salvo el adaptador a `PerspectiveCamera` | Solo el adaptador |
| `signals.ts` | Geometría de chinchetas, contornos, trayectorias, cresta (§8) | No |
| `scene/*.ts` | Objetos de three.js: terreno, cielo, Sol, Tierra, líneas, capa | Sí |
| `labels.tsx`, `Controls.tsx` | Capa de rótulos y grupo de controles | No |
| `quality.ts` | Niveles y calidad adaptativa (§12) | No |
| `shortcuts.ts` | `STAGE3D_SHORTCUTS` | No |
| `look.ts` | Parámetros visuales (intensidades, colores, radios) con el comentario «visual only» | No |

Regla: lo que no es dibujo (geometría, cámara, señales, sombras de referencia) es puro y tiene prueba unitaria en Node, sin WebGL.

## 12. Tecnología y rendimiento

### 12.1 Tecnología (D-97 o)

- **three.js** `0.187.0` (última estable al escribir esto; T-71 fija la versión exacta en `web/package.json` sin `^` y la añade a `02_arquitectura.md` §3.2 y a `SOURCES.md` con su licencia MIT). Con `@types/three` de la misma serie. Se usan `WebGLRenderer` (WebGL 2), `ShaderMaterial`, `BufferGeometry` y `OrbitControls` de `three/addons` (MIT, mismo paquete); nada de `WebGPURenderer` ni de cargadores de modelos.
- Todo three.js entra solo por el `import()` dinámico de Stage3D: el JavaScript principal no crece (sigue ≤ 350 kB comprimido, `02` §7).
- El trabajador de mallas va en su propio trozo.
- Pintado bajo demanda: solo se renderiza cuando cambia algo (cámara en movimiento o amortiguando, cursor, datos, tamaño, rótulos); en reposo, 0 fotogramas.

### 12.2 Niveles de calidad

| Nivel | Cuándo | Malla | Textura de sombra y recálculo | Halo del Sol | Detalle procedural | `pixelRatio` |
| --- | --- | --- | --- | --- | --- | --- |
| `alto` | Escritorio por defecto | 500 m (505.344 vértices) | 752 × 672, en cada cambio | Sí | Sí | `min(devicePixelRatio, 2)` |
| `medio` | Escritorio que no sostiene 45 fps, o `hardwareConcurrency ≤ 4` | 1 km (126.336 vértices) | 376 × 336, ≤ 10 Hz durante la reproducción | Sí | Sí | 1 |
| `bajo` | Puntero grueso (táctil), ventana < 768 px o renderizador por software (`SwiftShader`, `llvmpipe`, `Software` en `WEBGL_debug_renderer_info`) | 1 km | 376 × 336, ≤ 4 Hz | No | No | 0,75 |

Calidad adaptativa: mientras se pinta de forma continua (cámara moviéndose o reproducción), media de los últimos 90 fotogramas; si baja de 45 fps durante 2 s seguidos, se baja un nivel (una vez por cada 10 s como mucho). No se sube sola. `?q=alto|medio|bajo` lo fuerza (pruebas y demo); `?fps=1` muestra un contador de fotogramas en el grupo de controles.

### 12.3 Presupuestos

| Medida | Objetivo | Cómo se mide |
| --- | --- | --- |
| JavaScript extra comprimido (gzip) de la 3D (three.js + carril + trabajador) | ≤ 1,5 MB; esperado ~0,25 MB | Comprobación de tamaño en `make check` (T-73, `ops/`) |
| JavaScript principal | Sin cambio (≤ 350 kB) | Ídem |
| Fotogramas por segundo moviendo la cámara | ≥ 60 en el portátil de la demo (nivel `alto`); ≥ 30 en un portátil con gráfica integrada (nivel `medio`) | `?fps=1`, medido a mano en los dos equipos, cifras en `docs/handoff/T-73.md` |
| Mover el cursor → sombras actualizadas | < 100 ms (`14_ux_malaga.md` §7) | Perfilador del navegador |
| Primer fotograma 3D con la escena polar | ≤ 3,5 s en frío a 20 Mbit/s; ≤ 1,5 s con los datos en caché | Playwright (traza) |
| Decodificar y construir la malla de 500 m en el trabajador | ≤ 400 ms | `performance.now()` en el trabajador, a la consola en desarrollo |
| Memoria de GPU | ≤ 150 MB | Estimación por buffers y texturas (registrada en el traspaso) |
| Datos extra descargados | `dem_500m.bin.gz` (~0,27 MB el de ejemplo; real, pocos MB) una vez | Red |

## 13. Accesibilidad y UX (`14_ux_malaga.md`, `10` §12)

- **Lectores de pantalla**: el lienzo es `role="img"` con `aria-label` breve y `aria-describedby` a una descripción textual oculta visualmente, generada por plantillas `stage3d.desc.*` y actualizada como mucho cada 10 s y nunca durante la reproducción: `3D view centred on site A, Chang'e 7 site (88.80° S, 123.40° E). The Sun is 0.24° above the flat horizon but hidden behind a ridge 41 km to the east-northeast. The Earth is 1.71° above the horizon. Camera: orbit, 18 km from the site, looking toward the Sun.` La información importante está además en los paneles del armazón: la 3D no es la única fuente de nada.
- **Teclado**: todo se maneja sin ratón (§7); `Tab` recorre, dentro de la vista, las chinchetas, los rótulos de región y el grupo de controles; el foco es visible (contorno de 2 px del proyecto, también en el `div.stage3d`). Sin trampas de foco: `Tab` sale de la vista. `Esc` cierra la ayuda y el menú `Go to…`.
- **Nada solo por color**: escenarios con letra y forma; Sol y Tierra con rótulo y patrón de trazo distinto; tramo oculto de las trayectorias punteado; cresta con rótulo; huecos con trama; Luna lisa con triángulo y texto.
- **Movimiento**: con `prefers-reduced-motion`, sin vuelos ni fundidos (saltos directos), sin amortiguación de la órbita, sin rotación automática (no la hay en ningún caso) y estrellas sin titileo.
- **Táctil**: objetivos de 44 × 44 px; nada depende de pasar el ratón (la lectura usa la cruz central sin puntero; la ayuda se abre al tocar).
- **Estados** (`DataState`, `10` §9), ninguna pantalla vacía: (1) mientras llega el trozo de three.js, fondo `--c-bg-0` con el texto `Loading 3D view…`; (2) mientras llega el DEM, cielo, Sol, Tierra, esfera lisa y chinchetas ya dibujados con `Loading 3D terrain…` en el grupo de controles; (3) efemérides cargando o con error: el estado y el `Retry` del armazón, la 3D dibuja el terreno sin Sol; (4) error de terreno: §2.1; (5) fallo de WebGL: §10.3.
- **Alerta roja** (`14` §8): nada de `undefined`, `NaN` ni identificadores a la vista (p. ej. un punto de malla se rotula `Nearest mesh point: …`, nunca `grid:538,117`); ningún botón sin función; las teselas de detalle no se pintan si no existen.
- **Móvil** (< 768 px): el armazón arranca en 2D (anexo A). Si se elige 3D, nivel `bajo`, grupo de controles plegado por defecto y gestos de §7.

## 14. Riesgos y plan B

| Riesgo | Señal | Respuesta |
| --- | --- | --- |
| La 3D va lenta en el portátil de la demo | `< 45 fps` en `alto` con `?fps=1` | Calidad adaptativa; si ni `medio` llega a 60, la demo arranca con `?q=medio`. Domingo 09:00: si sigue mal, v2 entra en 2D y la 3D queda tras el conmutador (instrucciones del equipo, plan B) |
| El DEM real no llega esta noche (T-28/T-39) | Sin `map/dem_500m.bin.gz` real publicado | La escena se desarrolla con el cuenco de ejemplo; la web publicada **no** debe enseñar el cuenco sintético (`14` §8): si el origen pesado no tiene el DEM real, la escena polar no se monta y se usa el caso (b)/(c)/(d) |
| Sombras de 500 m que contradicen al núcleo en el sitio | Chincheta «Sun hidden» con el terreno iluminado alrededor | El aviso del §6.7, la línea del horizonte calculado en `Ground` y las teselas de 40 m (T-73) |
| Renderizado por software en las pruebas | Playwright sin GPU | Nivel `bajo` automático y comprobaciones por estado, no por píxel exacto (§15.2) |
| Choques con el carril I2 | Mismos ficheros | Solo `web/src/ui/stage3d/`; los cambios mínimos fuera (store, `AppLayout`, `en.json`, `package.json`, `playwright.config.ts`) se dicen en la petición |

## 15. Pruebas

### 15.1 Unitarias (Vitest, Node, sin WebGL; `web/src/ui/stage3d/__tests__/`)

| Id | Prueba | Esperado |
| --- | --- | --- |
| U1 | Marco polar: `mapToScene(0, 0, 0)`; `mapToScene(+x)`; `mapToScene(+y)`; ida y vuelta `sceneToMap(mapToScene(x, y, h))` en 1.000 puntos al azar de la malla | Origen; +X; −Z; error < 1 mm en x, y y h |
| U2 | Malla de un relieve sintético: DEM de cota 0 | Todos los vértices a distancia R del centro de la Luna (± 5 mm: posiciones `float32` relativas a la tesela, D-107 e); 752 × 672 vértices y 2·751·671 triángulos en `alto`; 376 × 336 en 1 km |
| U3 | Relieve sintético en rampa (`h = 0,01·x`) y un hueco de 3 × 3 celdas | Cota de cada vértice = la del DEM; normales inclinadas `atan(0,01)` respecto a la vertical local (± 0,01°); hueco rellenado con valores entre sus vecinos y marcado |
| U4 | Dirección del Sol y de la Tierra en la escena: para 200 pares (az, el) al azar y para el escenario A de ejemplo en 3 instantes (con `skyAt` de la tabla de ejemplo), `dirToScene` y vuelta al marco local del sitio | Mismos acimut y elevación que `skyAt` a 10⁻⁹° (la 3D y la 2D dan los mismos números) |
| U5 | Cámara nunca bajo el terreno: montaña gaussiana sintética de 3 km; 1.000 posiciones y pasos de vuelo al azar (incluidos pasos de 50 km hacia la montaña) y órbitas con el segmento cortando la montaña | Tras `clampCamera`, altura ≥ `groundAt` + margen del modo en todos los casos |
| U6 | Sombras de referencia (`shadow.ts`): muro de 1 km a 10 km al este de un punto en terreno llano, Sol al este | Elevación del Sol 2° → luz 0; 10° → luz 1; centro del disco justo en la cresta → luz 0,5 ± 0,01; sin muro → luz 1 con el Sol a 0,3° |
| U7 | Malla de perfil: perfil sintético de cota constante 100 m | Vértice (j, b) a `profileBinDistance(law, b)` del sitio por el círculo máximo (± 1 m) y a 100 m de cota (± 1 cm); acimut j = 0 hacia el norte, j = 180 hacia el este |
| U8 | Clic: punto de la escena sobre el centro de la celda de Shackleton (415, 380) | `sceneToMap` → `cellOfXY` = (415, 380) |
| U9 | Señales: contorno de una región sigue el terreno; trayectoria con 24·días + 1 puntos y tramos ocultos donde `el ≤ horizonAt` | Cotas = DEM + 15 m; tramos y marcas diarias en los índices esperados |
| U10 | Selección de escena (§2.1) | (a) para `demo-a`, `grid:…` y coordenadas dentro; (b) para un sitio con perfil fuera; (c) sin perfil con máscara; (d) liso; (a) sin DEM → (b)/(c)/(d) |
| U11 | Niveles de calidad (§12.2) | Táctil → `bajo`; `SwiftShader` → `bajo`; `?q=` manda; bajada tras 2 s por debajo de 45 fps y no más de una cada 10 s |
| U12 | Textos | Ninguna plantilla `stage3d.desc.*` produce `NaN`, `undefined` ni identificadores para los sitios de ejemplo |

### 15.2 Extremo a extremo (Playwright, `web/e2e/stage3d.spec.ts`)

Chromium sin cabeza con WebGL 2 por software (`--enable-unsafe-swiftshader` en `launchOptions.args` de un proyecto `stage3d` de `playwright.config.ts`, cambio mínimo). Stage3D publica su estado en `div.stage3d[data-state="loading|terrain|ready|error"]` y, con `?test3d=1`, usa `preserveDrawingBuffer` y expone el número de fotogramas en `data-frames`, para comprobar sin comparar píxeles exactos:

| Id | Prueba | Esperado |
| --- | --- | --- |
| E1 | Abrir la web en 3D (`?ui=v2&vm=3d` o el armazón) con los datos de ejemplo | `data-state="ready"` en < 10 s; el lienzo no es uniforme (desviación típica de la luminancia de una copia a un lienzo 2D > 4); las chinchetas A y B visibles; captura `docs/handoff/T-71-3d.png` |
| E2 | Teclado: foco en la vista, flechas y `+` | La cámara cambia (`data-camera` cambia); ningún atajo global se dispara |
| E3 | Modo `Ground` en A centrado en el Sol | La lectura del centro coincide con la del panorama 2D en el mismo instante (acimut y horizonte a 0,01°); captura `docs/handoff/T-72-ground.png` |
| E4 | Conmutador a 2D (tecla `V` o botón `2D`) y vuelta | Se ve el panorama 2D; vuelve la 3D sin recargar los datos; captura `docs/handoff/T-71-to-2d.png` |
| E5 | Sin WebGL 2 (`addInitScript` que hace devolver `null` a `getContext('webgl2')`) | Arranca en 2D; nada roto; sin `undefined`/`NaN` en el DOM visible |
| E6 | Pérdida de contexto forzada (`WEBGL_lose_context`) sin recuperación | Pasa a 2D con el aviso `stage3d.fallback` |
| E7 | Clic en el terreno sobre una celda calculada del ejemplo | El escenario activo pasa a `Nearest mesh point: …` y la cámara vuela allí |
| E8 | Alerta roja y tamaños (`14` §9) con la 3D montada | Botones del grupo ≥ 44 × 44 px; ningún texto prohibido; auditoría de accesibilidad de la página ≥ 90 (B9) |

Las capturas van a `docs/handoff/` (lo piden las instrucciones del equipo) y no se comparan con referencia: el renderizado por software varía entre máquinas.

### 15.3 A mano (en el traspaso de T-73)

FPS en el portátil de la demo y en uno modesto (§12.3), en el proyector de la sala el domingo (16:30–17:15): contraste del grupo de controles y legibilidad de los rótulos; recorrido de la «Ruta de lanzamiento» con la 3D.

## 16. Tarjetas

Tres tarjetas en `docs/tasks/`, en orden de valor; cada una deja algo enseñable:

| Tarjeta | Tamaño | Qué deja | Depende de |
| --- | --- | --- | --- |
| **T-71** · Escena polar realista | L | Relieve de 500 m sobre la curvatura, regolito, luz y sombras rasantes del Sol, cielo con estrellas, Sol con halo, Tierra con su fase, chinchetas A–D, órbita con `Recenter`, estados, aviso, paso a 2D | T-70; T-61 (si no, §10.5); DEM de ejemplo (real con T-28/T-39) |
| **T-72** · Navegación y señales | L | Vuelo, a ras de suelo con el horizonte calculado, `Go to…`, ayuda, regiones, sitios del catálogo, trayectorias, cresta, rosa, escala, lectura, clic en el terreno | T-71 |
| **T-73** · Capas, fuera del polo, detalle y rendimiento | L | Capas proyectadas con leyenda, escenas (b)–(d), teselas de 40 m (si T-80), calidad adaptativa medida, presupuesto de tamaño en `make check`, pruebas finales | T-72; T-80 opcional |

Si el tiempo aprieta (congelación el domingo a las 11:30): T-71 es lo mínimo para enseñar; de T-72, primero `Ground` + trayectorias + cresta (lo que cuenta la historia); de T-73, primero el rendimiento.

## Anexo A · Contrato común entre los carriles I2 e I3 (copiado sin cambios)

> CONTRATO COMÚN ENTRE LOS CARRILES I2 (interfaz v2) E I3 (vista 3D). No lo cambies sin acordarlo con el otro carril.
>
> - Especificaciones nuevas: docs/spec/15_interfaz_v2.md (I2: diseño, disposición, paneles, cabecera, tokens, conmutador y vista 2D) y docs/spec/16_vista_3d.md (I3: vista 3D). Tarjetas: I2 usa T-60 a T-69; I3 usa T-70 a T-79.
> - Estado: el store gana viewMode: '3d' | '2d'. Por defecto '3d' en escritorio con WebGL; '2d' si no hay WebGL o la ventana mide menos de 768 px. Se guarda en el enlace compartible (F16) con el parámetro vm.
> - El armazón (I2) ocupa toda la ventana (100vw x 100vh), dibuja el escenario central a pantalla completa debajo de los paneles flotantes y monta <Stage3D/> o <Stage2D/> según viewMode cuando la pestaña activa es Horizon. Stage3D se carga con import() dinámico desde web/src/ui/stage3d/index.tsx (export default Stage3D, sin props).
> - Stage3D (I3) llena su contenedor (position:absolute; inset:0), lee todo del store con los selectores existentes (escenario activo, cursor de tiempo, astro de enfoque, compare with smooth Moon, escenarios) y no dibuja paneles propios, salvo un grupo pequeño de controles de cámara abajo a la derecha, por encima de la barra de tiempo. Los paneles del armazón quedan encima y solo capturan el puntero en su propia superficie.
> - Conmutador 3D/2D: lo pone el armazón (I2), siempre visible sobre el escenario central, con el texto «3D» y «2D» (no solo iconos) y el atajo de teclado V.
> - Tokens en web/src/styles/tokens.css (los crea I2; I3 los usa por nombre aunque aún no existan): --c-bg-0 #0A0E17; --c-bg-1 #162032; --c-panel de rgba(17,24,39,0.72) a rgba(30,41,59,0.72) con backdrop-filter: blur(12px); --c-line #334155; --c-earth #38BDF8; --c-sun #F59E0B; --c-text #F8FAFC; --c-muted #94A3B8. Prohibidos los morados, violetas, magentas y rosas, también en el eclipse. Los demás colores de estado (go, marginal, no-go, ambos, eclipse) los fija I2 con esa restricción y siempre con icono y texto.
> - Tipografía: Inter (títulos, botones, paneles) y JetBrains Mono (coordenadas, horas, ángulos, cifras), empaquetadas con @fontsource, sin peticiones a Google Fonts.
> - Red de seguridad: la interfaz actual sigue disponible con ?ui=v1 hasta que la nueva pase todas las pruebas (Playwright B1, B2 y B9, validación, auditoría de accesibilidad >= 90 y docs/spec/14_ux_malaga.md). Ningún cálculo ni dato cambia: solo la presentación.
> - Referencia visual: docs/design/open-horizon/ (maqueta exportada C-Cinematic.dc.html; sus estilos en línea son la referencia de valores, no código para copiar) y docs/design/ref-1-open-horizon.jpg, ref-2-emblema.jpg y ref-3-concepto.jpg.

Lo que esta especificación **pide a I2** sin cambiar el contrato (se habla antes de integrar): comprobar WebGL **2** (§10.3); la acción `fallbackTo2d(reason)` y el aviso (§10.3); las variables `--stage3d-inset-right` y `--stage3d-inset-bottom` en el contenedor del escenario (§10.1); el token `--c-accent` para el anillo del escenario activo (§8.1); mostrar `STAGE3D_SHORTCUTS` en la ayuda global (§7.5); las rampas v2 en `rampColour` (§9).
