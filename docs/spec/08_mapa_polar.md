# 08 · Mapa del polo sur, cubo de horizontes y sitio óptimo

Cubre F11 (mapa con capas y clic), F32 (sitio óptimo en sus dos modos) y la comparación con los mapas de la NASA (A7, B6, B7). Módulos: `pipeline/horizon/cube.py`, `engine_torch.py`, `compact.py`; `pipeline/layers/` (I1); `web/src/core/grid.ts`, `cube.ts`; `web/src/ui/map/`; `web/src/workers/optimal.worker.ts` (I2). Operación del cálculo: I3.

## 1. Zona y malla

### 1.1 Dónde caen las 9 regiones candidatas

Centros y tamaños de `04_catalogo_sitios.md` §3, pasados a coordenadas del mapa con `03_datos_y_fuentes.md` §3.1 (r = 3.474,8 km · tan(c/2); x = r·sin λ; y = r·cos λ):

| Región | Lat | Lon | c (°) | r (km) | x (km) | y (km) | Lado (km) | ¿Dentro del cuadrado de 85° S (±151,68 km)? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| de Gerlache Rim 2 | −88,2 | −64,6 | 1,8 | 54,59 | −49,31 | 23,41 | 11 | Sí |
| Haworth | −86,8 | −22,8 | 3,2 | 97,06 | −37,61 | 89,48 | 17 | Sí |
| Malapert Massif | −86,0 | −0,2 | 4,0 | 121,34 | −0,42 | 121,34 | 12 | Sí |
| Mons Mouton | −85,4 | 31,7 | 4,6 | 139,56 | 73,33 | 118,74 | 9 | Sí |
| Mons Mouton Plateau | −84,3 | 30,6 | 5,7 | 172,99 | 88,06 | 148,90 | 38 | **Parcial** (llega a y = 167,9) |
| Nobile Rim 1 | −85,4 | 37,3 | 4,6 | 139,56 | 84,57 | 111,02 | 11 | Sí |
| Nobile Rim 2 | −84,0 | 58,8 | 6,0 | 182,11 | 155,77 | 94,34 | 11 | **No** (x de 150,3 a 161,3) |
| Peak near Cabeus B | −83,6 | −68,7 | 6,4 | 194,27 | −181,00 | 70,57 | 11 | **No** (x de −186,5 a −175,5) |
| Slater Plain | −87,2 | 125,5 | 2,8 | 84,92 | 69,14 | −49,31 | 11 | Sí |

Conclusión: la zona mínima del plan (85°–90° S, ±152 km) deja fuera tres regiones en todo o en parte. Se amplía, como pide el plan. Las nueve regiones y toda la malla ampliada quedan dentro de P1 (`LDEM_80S_40M`, ±304 km), así que todos los puntos tienen relieve cercano de 40 m.

### 1.2 Malla (D-13)

| Parámetro | Valor |
| --- | --- |
| Proyección | Estereográfica polar sur de LOLA (R = 1.737.400 m, 0° E arriba, 90° E a la derecha) |
| Extensión | x ∈ [−200.000, +176.000] m; y ∈ [−152.000, +184.000] m |
| Celda | 500 m |
| Tamaño | `nx` = 752, `ny` = 672 → **505.344 puntos** |
| Centro de la celda (i, j) | x = −200.000 + (i + 0,5)·500; y = 184.000 − (j + 0,5)·500 |
| Celda de un punto (x, y) | i = floor((x + 200.000)/500); j = floor((184.000 − y)/500) |
| Margen sobre las cajas de las regiones | ≥ 13,5 km al oeste, 14,7 km al este, 16,1 km al norte del mapa |
| Latitud más baja (esquina x = −200, y = +184 km) | r = 271,8 km → −81,05° |
| El polo | En la esquina común de las celdas (399, 367), (400, 367), (399, 368) y (400, 368); ninguna celda tiene su centro en el polo |

Dentro del círculo de 85° S hay unos 289.000 puntos; la ampliación añade un 75 %. El orden de cálculo (§2) garantiza que lo importante se calcula primero.

Relieve de cada punto: pila `lola_polar` sin P3 (`03` §7). Toda la malla cae dentro de P1 (el punto más alejado del polo en un eje está a 200 km y P1 llega a 304 km), así que todos los puntos se rotulan `LOLA polar 40 m + 120 m`. Cada rayo usa P1 hasta salir de su cuadrado (como mínimo 104 km desde el punto) y P2 a partir de ahí. Los rayos de los puntos del borde oeste se cortan a 257 km en el borde de P2 (`06` §6).

Paso de celda a dirección unitaria y base local, sin trigonometría inversa (lo usan el motor del cubo y `core/grid.ts`):

```
ρ = sqrt(x² + y²);  c = 2·atan(ρ / (2R))
u0 = ( sin c · y/ρ,  sin c · x/ρ,  −cos c )
E  = ( −x/ρ,          y/ρ,          0     )
N  = ( cos c · y/ρ,   cos c · x/ρ,  sin c )
lat = −90° + degrees(c);  lon = degrees(atan2(x, y))
```

Comprobación: en (x, y) = (0, +ρ) (meridiano cero) sale u0 = (sin c, 0, −cos c), E = (0, 1, 0), N = (cos c, 0, sin c): el norte local apunta hacia arriba en el mapa y el este a la derecha.

## 2. Trozos y orden de cálculo

- Trozo = 16 × 16 celdas (8 km × 8 km). 47 columnas × 42 filas = **1.974 trozos**. Fichero `cube/c_<RR>_<CC>.bin.gz` (`09` §10).
- Cada trozo es independiente: el cálculo es reanudable (un trozo existente y válido se salta), se puede repartir entre máquinas (`--shard k/n`: la máquina k calcula los trozos cuyo índice en la lista ordenada cumple `índice mod n == k`) y un cubo a medias ya sirve.
- Escritura atómica: se escribe `c_RR_CC.bin.gz.tmp` y se renombra.

Lista ordenada por prioridad (`python -m pipeline.cli cube-plan` la escribe en `data/out/cube/plan.json`):

| Nivel | Trozos | N.º aproximado | Para qué |
| --- | --- | --- | --- |
| 1 | Los que cortan alguna caja de región ampliada 2 km | ~90 (≈ 23.000 puntos) | F32 y ranking; clic dentro de las regiones |
| 2 | Los que tienen alguna celda con latitud ≤ −88° y no están en el nivel 1 | ~180 | Plan B «88°–90° S»; alrededores de Shackleton |
| 3 | Los que tienen alguna celda con latitud ≤ −85° | ~900 | Comparación con la NASA a 60 m |
| 4 | El resto | ~800 | Mapa completo |

Dentro de cada nivel, por distancia creciente del centro del trozo al polo.

## 3. Motor del cubo (`engine_torch.py`)

### 3.1 Datos en memoria

P1 como tensor `int16` [15200, 15200] (462 MB) y P2 como tensor `int16` [7624, 7624] (116 MB), los dos en unidades de 0,5 m; los cuatro vecinos de cada muestra se leen en `int16` y se pasan a metros en `float32` (× 0,5) antes de interpolar. Dispositivo: `cuda` si `torch.cuda.is_available()`, si no `cpu` (mismo código). Cabe en los 8 GB de la RTX 4060 con margen.

### 3.2 Algoritmo por trozo

```
function compute_chunk(row, col, law, h_obs = 2.0, pts_batch = 64, ring = 128):
    puntos = las 256 celdas del trozo → u0, E, N (§1.2)                         # [256, 3]
    h_site = sample_stack(u0)                                                   # [256]
    d = law_distances(law);  θ = d/R_M;  s2 = sin²(θ/2);  sinθ, cosθ           # [N_S]
    a = radians(0.5·[0..719]);  T = cos a·N[:,None,:] + sin a·E[:,None,:]       # [256, 720, 3]
    best = −inf [256, 720];  best_i = 0 [256, 720]
    for lote de pts_batch puntos:
        for bloque de `ring` muestras consecutivas (índices i0..i1):
            P = cosθ[i0:i1]·u0[:,None,None,:] + sinθ[i0:i1]·T[:,:,None,:]       # [B, 720, ring, 3]
            xm = 2R·P.y/(1 − P.z);  ym = 2R·P.x/(1 − P.z)                       # metros de mapa
            h, valid = sample_stack_xy(xm, ym)                                  # P1 si cae dentro; si no, P2
            r_t = R_M + h
            el = atan2((h − h_site − h_obs) − 2·r_t·s2, r_t·sinθ);  el[~valid] = −inf
            m, k = max(el, dim = muestras)                                      # primer máximo del bloque
            mejora = m > best                                                   # estricto: gana la muestra más cercana
            best = where(mejora, m, best);  best_i = where(mejora, i0 + k, best_i)
            (opcional) terminar el lote si todos los rayos cumplen el criterio de 06 §11
    el_deg = degrees(best);  dist_m = d[best_i]
    los rayos sin ninguna muestra válida toman el valor de la Luna lisa
    return height_m = h_site, el_deg, dist_m

function sample_stack_xy(xm, ym):
    for g in [P1, P2]:
        s = xm/g.S + g.N/2 − 0.5;  l = g.N/2 − 0.5 − ym/g.S
        dentro = (s ≥ 0) & (l ≥ 0) & (s ≤ g.N − 1) & (l ≤ g.N − 1)
        s0 = clamp(floor(s), 0, g.N − 2);  l0 = clamp(floor(l), 0, g.N − 2);  fs = s − s0;  fl = l − l0
        hg = (1−fl)·((1−fs)·g[l0, s0] + fs·g[l0, s0+1]) + fl·((1−fs)·g[l0+1, s0] + fs·g[l0+1, s0+1])   # g[...]·0.5 en float32
    h = where(dentro_P1, h_P1, h_P2);  valid = dentro_P1 | dentro_P2
```

Memoria del bloque mayor: 64 × 720 × 128 × 3 × 4 B = 71 MB para `P`, y unas diez matrices de 24 MB: menos de 400 MB. `pts_batch` y `ring` son parámetros de línea de órdenes.

### 3.3 Precisión en `float32`

- Posición de la muestra: los vectores unitarios tienen un error relativo de 6·10⁻⁸, unos 0,1–0,2 m en el terreno, es decir, menos de 0,005 píxeles de 40 m.
- Elevación: la fórmula cerrada trabaja con diferencias de cota y con θ exacto; error esperado < 0,001°.
- Diferencia admitida frente al motor de referencia: 0,002° (§3.5).

### 3.4 Salida

`el_deg` se cuantiza a 0,01° y `dist_m` al código logarítmico; se escribe el trozo con el formato de `09` §10.2 y se actualizan `cube/done.bin` y `cube/cube.json` (`chunks_done`).

### 3.5 Pruebas del motor

| Prueba | Esperado |
| --- | --- |
| Terreno sintético en rejillas polares de 40 m y 120 m en memoria; 16 puntos; `engine_torch` (CPU) frente a `engine_ref` | max \|Δ elevación\| < 0,002°; `dist_m` igual salvo donde dos muestras empatan a menos de 0,002° |
| Esfera lisa (rejillas a cota 0) | −0,0869° en los 720 acimuts de todos los puntos; tras cuantizar, −9 (×0,01°) |
| Codificación y decodificación de un trozo | Elevación recuperada con error ≤ 0,005°; distancia con error ≤ 2 %; un salto de +300° a −300° entre acimuts vecinos (valores de prueba representables: \|q\| ≤ 32.767, es decir, \|el\| ≤ 327,67°) produce una diferencia de −60.000 que desborda `int16` y se recupera exacta con la suma acumulada en `Int16Array` |
| Reanudación | Lanzar dos veces: la segunda no recalcula nada y los ficheros son idénticos byte a byte |
| Con datos reales (lenta): 10 puntos de la malla, cubo frente a `site-mask` con la misma ley (caso B6) | \|Δ elevación\| ≤ 0,01° (un paso de cuantización) en el 99 % de los acimuts y ≤ 0,02° en todos |

## 4. Coste y cómo se mide

Muestras del cubo completo: 505.344 × 720 × 3.709 = 1,35·10¹² (`full`) o 505.344 × 720 × 1.855 = 6,75·10¹¹ (`fast`).

| Supuesto de velocidad | `full` | `fast` | Solo nivel 1 (`full`) |
| --- | --- | --- | --- |
| 5·10⁸ muestras/s (GPU, optimista) | 45 min | 23 min | < 3 min |
| 2·10⁸ muestras/s (GPU, prudente) | 1 h 53 min | 56 min | 5 min |
| 5·10⁷ muestras/s (CPU de muchos núcleos) | 7 h 30 min | 3 h 45 min | 21 min |

Las velocidades son supuestos de diseño, no medidas. **Coste real: PENDIENTE DE VERIFICAR (I3, I1)** con la orden siguiente, en cuanto el motor pase las pruebas sintéticas (plan: «se mide con 1.000 puntos»):

```
make cube-bench        # = python -m pipeline.cli cube --bench
```

Calcula 4 trozos fijos (1.024 puntos): el que contiene el centro de Shackleton (fila 23, columna 25), el del centro de Mons Mouton Plateau (fila 4, columna 36), el de Peak near Cabeus B (fila 14, columna 2) y el de la esquina (fila 41, columna 0). Imprime muestras por segundo, segundos por punto y la extrapolación a los cuatro niveles con las dos leyes, y lo guarda en `data/out/cube/bench.json`.

Regla de decisión (la aplica I3 con la cifra medida, T = tiempo extrapolado del cubo completo en la mejor máquina disponible):

| Resultado | Decisión |
| --- | --- |
| T(`full`) ≤ 6 h | Ley `full`, niveles 1 a 4 |
| T(`full`) > 6 h y T(`fast`) ≤ 6 h | Ley `fast` para todo el cubo (las máscaras de sitio siguen en `full`; B6 se comprueba con la ley del cubo) |
| T(`fast`) > 6 h | Plan B del §9 |

El nivel 1 se lanza siempre primero y en el portátil: tarda minutos y desbloquea F32 y el clic en las regiones. El resto corre después, en la GPU o en la nube, y de noche.

Dónde se ejecuta: portátil con RTX 4060 (PyTorch con CUDA) o máquina de muchos núcleos en la nube (PyTorch CPU; hilos = núcleos). Entrada necesaria en esa máquina: P1 y P2 (578 MB) y el repositorio. Salida: `data/out/cube/` (hasta ~1,1 GB sin comprimir; se guarda ya comprimido, estimación 0,3–0,6 GB).

## 5. Capas

### 5.1 Qué se calcula

Para cada celda con máscara y para cada periodo, el porcentaje de pasos horarios en que hay Sol, hay enlace y hay ambos, con el **criterio del centro** y el observador a 2 m. Periodos: `mean186` (163.152 pasos desde 2026-01-01T00:00:00Z, D-22) y los 60 meses de 2026-01 a 2030-12, que son los primeros 43.824 pasos del mismo recorrido. Además, la capa de validación `mean186_any` con el criterio «cualquier fracción» (§8).

### 5.2 Algoritmo (`python -m pipeline.cli layers`)

```
tabla = ephemeris.bin (tramo main);  k0 = índice de 2026-01-01T00:00:00Z = 1 + 731·24 = 17.545
mes[k] = índice de mes 0…59 del paso k, o −1 si es posterior a 2030-12
for lote de trozos (p. ej. 64 trozos = 16.384 puntos) en el dispositivo:
    M = máscaras decodificadas [P, 720] en grados;  p, E, N, U de cada punto (con cota + 2 m)
    cnt_sun, cnt_earth, cnt_both = ceros [P, 61];  cnt_any = ceros [P, 2];  n_any = 0
    for bloque de B pasos (p. ej. 512):
        S, T = vectores Luna→Sol y Luna→Tierra de la tabla en esos pasos (son nodos exactos: no se interpola)
        for astro in (Sol, Tierra):
            v = astro[None,:,:] − p[:,None,:];  e, n, u = v·E, v·N, v·U
            az = atan2(e, n) mod 360;  el = degrees(atan2(u, sqrt(e² + n²)))
            x = az/0.5;  j = floor(x);  f = x − j
            H = (1 − f)·M[punto, j mod 720] + f·M[punto, (j + 1) mod 720]
            vis_astro = el > H
        acumular vis_sol, vis_tierra y (vis_sol & vis_tierra) en la columna 60 (media) y en la columna mes[k] si mes[k] ≥ 0
        en uno de cada 3 pasos: acumular disc_any (07 §4.2) de Sol y Tierra en cnt_any;  n_any += 1
    pct = 100 · cnt / n_pasos_del_periodo;  v = round(pct / 0.4)
escribir layers/<period>.bin.gz (61 ficheros), layers/mean186_any.bin.gz y layers/layers.json
celdas sin trozo calculado → 255
```

Cuenta de `k0`: de 2024-01-01 a 2026-01-01 hay 366 + 365 = 731 días; la muestra 1 del tramo es 2024-01-01T00:00Z.

Coste: 505.344 puntos × 163.152 pasos = 8,2·10¹⁰ evaluaciones por astro. Estimación de diseño: 10–30 min en GPU y 2–4 h en CPU de muchos núcleos. Reanudable por lotes de trozos (los contadores de cada lote se guardan en `data/out/layers/partial/`). Se puede lanzar con el cubo a medias: las celdas pendientes quedan en 255 y `coverage` lo indica.

### 5.3 Pruebas de las capas

| Prueba | Esperado |
| --- | --- |
| Máscara de −90° en todos los acimuts | 100 % en las tres bandas de todos los periodos (v = 250) |
| Máscara de +90° | 0 % en las tres |
| Celda junto al polo con máscara lisa (−0,0869°) | `sun` de `mean186` entre 45 % y 60 %; `earth` entre 40 % y 60 %; `both` ≤ min(`sun`, `earth`) |
| Coherencia | `both ≤ min(sun, earth)` y `both ≥ sun + earth − 100` (± 0,4) en todas las celdas y periodos |
| Meses | La suma de pasos de los 60 meses es 43.824; febrero de 2028 tiene 696 pasos |
| B6: 10 celdas, capa frente al cálculo de sitio (`07`) con la misma máscara y paso de 1 h | Diferencia ≤ 0,4 puntos (un paso de cuantización) |

## 6. Fondo y lectura del mapa

- `map/hillshade_250m.png`: sombreado de P2 remuestreado a 250 m sobre la zona. Pendientes por diferencias centrales en x e y, con x hacia la derecha e y **hacia arriba** en el mapa: sobre la imagen de cotas `Z[fila][col]` (fila hacia abajo, paso 250 m), ∂h/∂x = (Z[f][c+1] − Z[f][c−1]) / 500 y ∂h/∂y = (Z[f−1][c] − Z[f+1][c]) / 500 (el signo de y se invierte respecto al índice de fila); en el borde de la imagen se usan diferencias de un lado; normal n = (−∂h/∂x·k, −∂h/∂y·k, 1) normalizada con k = 2; luz L = (−cos 30°·sin 45°, cos 30°·cos 45°, sin 30°) (desde arriba a la izquierda); valor = round(255·clamp(0,35 + 0,65·n·L, 0, 1)).
- `map/dem_500m.bin.gz`: cota en el centro de cada celda, para la lectura al pasar el puntero.
- La web dibuja: fondo en gris → capa coloreada con opacidad 0,75 → contornos de las regiones → marcadores de sitios → marcador del punto elegido. Paleta y leyenda: `10_interfaz.md` §6.

## 7. Clic en el mapa (F11) y coordenadas a medida

```
function on_map_click(x, y):                                   # metros de mapa
    i = floor((x + 200000)/500);  j = floor((184000 − y)/500)
    if i, j fuera de [0, 751] × [0, 671]: return
    row = floor(j/16);  col = floor(i/16)
    if done[row][col] == 0: mostrar "This area has not been computed yet."; return
    chunk = fetch_gz(heavy + "/cube/c_RR_CC.bin.gz")           # caché de los 8 últimos trozos
    p = 16·(j mod 16) + (i mod 16)
    if chunk.height_m[p] == −32768: mostrar el mismo mensaje; return
    mask = { el_deg: suma acumulada de el_delta[p] × 0.01, dist_m: 20 × 1.04^dist_code[p], observer_height_m: 2,
             blk_lat_deg, blk_lon_deg: punto a dist_m[j] en el acimut 0,5·j desde el centro de la celda (06 §4.1),
             blk_height_m: NaN en los 720 acimuts (el cubo no guarda la cota del punto que bloquea) }
    site = { id: "grid:<i>,<j>", lat, lon: del centro de la celda, height_m: chunk.height_m[p],
             relief_label según §1.2 }
    añadir o sustituir un escenario con ese sitio y calcularlo como cualquier otro (07)
```

Rótulo obligatorio en la tarjeta: `Nearest mesh point: 89.123° S, 45.678° E (500 m grid)`. Para un punto de malla no hay máscara de 10 m ni perfil de corte: la pestaña Corte muestra `Cross-section is available for catalogue sites only.` y F18 da la dirección y la distancia del punto que bloquea, sin cota (con `blk_height_m` = NaN la plantilla omite `{rise}`, `10_interfaz.md` §8). `minElDeg` y `maxElDeg` de la máscara se calculan igual que para un sitio.

Coordenadas a medida (modo Planificar): si el punto cae dentro de la malla, se trata como un clic en esa posición; si no, Luna lisa con el aviso en rojo `No terrain data here — smooth Moon. Real sunrise, sunset and Earth visibility will differ.`

## 8. Comparación con los mapas de la NASA (A7, B7)

Productos: N1 y N2 (60 m, ±151,74 km); para las celdas que quedan fuera, N3 y N4 (120 m). Lectura: `03_datos_y_fuentes.md` §6.

### 8.1 Condiciones para comparar lo mismo

| Aspecto | NASA (etiquetas y PGDA) | Nosotros | Qué se hace |
| --- | --- | --- | --- |
| Criterio | Cualquier fracción del disco | Centro (producto) | Se compara la capa `mean186_any` (D-21); la del centro se informa aparte |
| Periodo | 18,6 años, paso de 1 h | 6.798 días desde 2026, uno de cada 3 pasos horarios en `_any` | Se acepta: ambas son medias de un ciclo completo |
| DEM | `LDEM_85S_060M` (datos hasta 2013) | P1 de 40 m y P2 de 120 m (datos hasta 2017) | Se anota |
| Altura | No indicada (superficie) | 2 m | Se anota: nuestra cifra tiende a ser algo mayor |
| Muestreo | Píxel de 60 m | Punto cada 500 m | Remuestreo siguiente |

### 8.2 Remuestreo y métricas (`python -m pipeline.cli compare-nasa`)

```
for cada celda (i, j) calculada:
    (x, y) = centro de la celda
    producto = N1/N2 si |x| ≤ 151.500 y |y| ≤ 151.500; si no, N3/N4
    s = round(x/S + N/2 − 0.5);  l = round(N/2 − 0.5 − y/S)        # píxel que contiene el punto
    nasa_pct = 100 × media de DN × 0,00004 en la ventana de 3 × 3 píxeles centrada en (s, l)
    ours_pct = valor de mean186_any (banda sun_any o earth_any)
métricas, para Sol y para Tierra, sobre el conjunto «85S» (celdas comparadas con N1/N2) y sobre el total:
    n, r de Pearson, sesgo = media(ours − nasa), mae = media(|ours − nasa|), rmse
    fracción de celdas con |ours − nasa| ≤ 10 puntos
salida: data/out/test_results/A7B7.json, a7b7_scatter.png y a7b7_diff_map.png (formato en 09 §7.1) para la página de validación
```

### 8.3 Umbrales

| Caso | Conjunto | Umbral | Fuente del umbral |
| --- | --- | --- | --- |
| A7 | 20 puntos al azar entre 85° y 90° S (semilla 42; x, y uniformes con r ≤ 150 km), con máscara de sitio propia | r > 0,9 y `mae` < 10 puntos, para Sol y para Tierra | Plan |
| B7 | Todas las celdas del conjunto «85S» | r > 0,9 | Plan |

A7 no necesita el cubo: calcula 20 máscaras de sitio y su media de 18,6 años con el mismo código de capas. Corre de noche. Si un umbral no se cumple, no se cambia: se muestra la diferencia con su explicación (plan) y A1 decide.

## 9. Plan B del mapa

Se aplica, por orden, lo primero que quepa en el tiempo disponible. Con dos cuentas el cubo completo se calcula de noche (`12_tareas.md` §11), así que la decisión se toma con la medida del §4 en cuanto exista (sábado, hacia las 19:30) contra el tiempo de cálculo disponible hasta las 07:30 del domingo, y la revisión del plan del sábado a las 23:00 comprueba solo que el nivel 1 ha terminado y que la velocidad real del nivel 1 confirma la extrapolación; si no la confirma, se pasa al primer paso que quepa:

| Paso | Qué se publica | Coste respecto al cubo completo | Efecto en la web |
| --- | --- | --- | --- |
| B-0 | Niveles 1 a 4 con ley `fast` | 50 % | Ninguno visible |
| B-1 | Niveles 1, 2 y 3 (85°–90° S y regiones) | ~60 % | El mapa muestra `Not computed` fuera |
| B-2 | Niveles 1 y 2 (regiones y 88°–90° S) | ~14 % | Ídem, zona menor |
| B-3 | Malla de 1 km: solo celdas con i y j pares; las capas repiten el valor en el bloque de 2 × 2 | 25 % | `layers.json` añade `"effective_cell_m": 1000` y la leyenda lo dice |
| B-4 | Solo nivel 1 más las capas de la NASA remuestreadas a la malla (`source = "nasa_avgvisib"`) | ~5 % | Fondo rotulado `NASA average illumination (Mazarico et al. 2011) — not our computation`; sin capa «ambos»; sin meses; el clic solo funciona en las regiones |

En cualquier paso F32 sigue funcionando sobre las regiones (nivel 1). La demo no depende del cubo (plan).

## 10. Sitio óptimo (F32)

### 10.1 Modo «periodo»: qué punto tiene más tiempo de Sol y Tierra a la vez

Sale de las capas, en el hilo principal.

```
function best_by_period(layer, grid, filter, top_n = 10):
    cand = celdas con both != 255 que pasan el filtro
           (filtro: todas | dentro de la caja de una región | lista de regiones | pendiente ≤ límite si existe F23)
    ordenar por: both desc, sun desc, earth desc, j asc, i asc
    out = []
    for c in cand:
        if c está a 1.000 m o menos de alguno de out: continue                # distancia euclídea entre centros en el plano del mapa
                                                                              # = 500·sqrt(Δi² + Δj²) ≤ 1000; evita diez celdas contiguas
        out.append(c);  if len(out) == top_n: break
    return out con { i, j, lat, lon, both_pct, sun_pct, earth_pct, region }
```

Periodo: cualquiera de `layers.json` (un mes de 2026–2030 o `mean186`).

### 10.2 Modo «desde una fecha y hora»: qué punto mantiene Sol y Tierra más tiempo seguido

En un Web Worker, sobre las máscaras compactas (`09` §11); el resultado de los mejores se recalcula con la máscara completa.

Mensajes:

```ts
type OptimalRequest  = { type: 'run'; t0Unix: number; maxDays: number /* 90 */; regionIndex: number | null;
                         source: 'regions' | 'overview'; heavyBaseUrl: string; dataBaseUrl: string }
type OptimalProgress = { type: 'progress'; done: number; total: number }
type OptimalResult   = { type: 'result'; top: { i: number; j: number; latDeg: number; lonDeg: number;
                         regionIndex: number; hours: number; capped: boolean }[]; evaluated: number; elapsedMs: number }
type OptimalError    = { type: 'error'; message: string }
```

Algoritmo del trabajador:

```
cargar compact/<source>.bin.gz y ephemeris.bin (del caché HTTP)
if t0 fuera de los tramos de la tabla: enviar error `Date outside the supported range (1969–1972 and 2024–2044).`
K = min(maxDays·24, floor((seg.valid_to_unix − t0)/3600))     # seg = tramo que contiene t0; nunca se sale de la tabla
for k in 0..K: (S[k], T[k]) = body_vectors_at(t0 + 3600·k)
for cada punto q que pasa el filtro de región:
    frame = site_frame(lat, lon, height_m[q] + 2)                    # con las fórmulas del §1.2
    k = 0
    while k ≤ K:
        (az, el) del Sol con S[k] − frame.p
        if el ≤ 0.01·el_q[q][round(az/2) mod 180]: break
        (az, el) de la Tierra con T[k] − frame.p
        if el ≤ 0.01·el_q[q][round(az/2) mod 180]: break
        k += 1
    hours[q] = min(k, K);  capped[q] = (k > K)
    cada 256 puntos: enviar progress
top = los 10 mejores por hours desc (empates: j asc, i asc), con la misma supresión de vecinos de 1.000 m
enviar result
```

Después, en el hilo principal, para los 3 primeros: descargar su trozo del cubo, construir la máscara completa y calcular la ventana exacta de «ambos» que empieza en `t0` (`07` §6, rejilla de 10 min y bisección); se reordenan por la duración exacta y se muestran como `12 d 7 h`. El primero se marca en el mapa y puede añadirse como escenario.

- La máscara compacta es conservadora (máximo en ±1°): la duración del trabajador nunca supera la real en más que el efecto del paso de 1 h; por eso se recalcula.
- Si `hours` es 0 en todos los puntos: `No point in the selected area has both sunlight and Earth link at that time.`
- Si `capped`: se muestra `≥ {K/24} d` (`≥ 90 d` salvo que el final de la tabla recorte K).
- Coste máximo: 10.252 puntos × 2.161 pasos × 2 astros = 4,4·10⁷ evaluaciones; presupuesto < 10 s en un portátil y, en el caso típico, < 2 s, porque la mayoría de los puntos se descarta en el primer paso. Se puede cancelar terminando el trabajador.
- `source = 'overview'` (todo el mapa, un punto de cada 4) solo se ofrece si el fichero existe.

### 10.3 Pruebas de F32

| Prueba | Esperado |
| --- | --- |
| Capa sintética con un máximo conocido en la celda (100, 200) y un segundo máximo contiguo | `best_by_period` devuelve (100, 200) y no devuelve la celda contigua |
| Filtro de región | Todas las celdas devueltas están dentro de la caja |
| Fichero compacto sintético de 3 puntos: A con máscara de −90° (siempre visible), B de +90°, C de −90° salvo +90° en el acimut solar de la hora 5 | `hours`: A = K (y `capped`), B = 0, C = 5; orden A, C, B |
| Coherencia con el núcleo | Para 5 puntos reales, la duración con la máscara completa es mayor o igual que la del trabajador menos 1 h |
| Rendimiento | 10.252 puntos sintéticos «siempre visibles» durante 90 días en menos de 15 s (peor caso absoluto) |

## 11. Otras pruebas de este módulo

- Malla: ida y vuelta (i, j) → (lat, lon) → (i, j) para las 505.344 celdas; el centro de Shackleton (−89,67°, 129,78°; x = 7.690 m, y = −6.403 m) cae en la celda i = 415, j = 380, trozo fila 23, columna 25; cada centro de región cae en la celda que resulta de las coordenadas de la tabla del §1.1.
- A6 (cualitativo, lo firma A1): entre las celdas a menos de 15 km del centro de Shackleton, la de mayor `sun` en `mean186` tiene, en 2026–2030, una racha de luz continua (criterio del centro, 2 m) del mismo orden que los 240 días de Mazarico et al. (2011) y una noche más larga del orden de 1,5 días. «Mismo orden» = dentro de un factor 3. La prueba calcula y anota las dos cifras; el veredicto es manual.
