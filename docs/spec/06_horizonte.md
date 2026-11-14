# 06 · Máscara de horizonte

Para un sitio y una altura de observador, la máscara da, en cada acimut, la elevación del horizonte real y el punto del terreno que lo fija. No depende de la fecha: se calcula una vez por sitio, fuera de línea. Este fichero define el algoritmo, que es el mismo para los sitios del catálogo (motor de referencia, NumPy `float64`) y para la malla del mapa (motor del cubo, PyTorch `float32`, `08_mapa_polar.md`).

Módulos: `pipeline/horizon/law.py`, `engine_ref.py`, `engine_torch.py`, `site_mask.py`, `profile.py` (I1).

## 1. Entradas y salidas

**Entradas**

| Nombre | Tipo | Unidad | Rango | Notas |
| --- | --- | --- | --- | --- |
| `lat_deg`, `lon_deg` | float64 | grados | [−90, 90], (−180, 180] | Sitio, en MOON_ME |
| `stack` | `DemStack` | — | — | `03_datos_y_fuentes.md` §7; `None` = Luna lisa |
| `observer_heights_m` | lista de float | m | ≥ 0 | Por defecto `[2.0, 10.0]` |
| `law` | `'full'` \| `'fast'` | — | — | Por defecto `'full'` |

**Salidas** (por cada altura de observador), con 720 elementos, uno por acimut `az_j = 0,5°·j`, j = 0…719:

| Campo | Tipo | Unidad | Significado |
| --- | --- | --- | --- |
| `el_deg[j]` | float64 | grados | Elevación del horizonte en ese acimut (puede ser negativa) |
| `dist_m[j]` | float64 | m | Distancia sobre la esfera de referencia del sitio al punto que bloquea |
| `blk_lat_deg[j]`, `blk_lon_deg[j]` | float64 | grados | Coordenadas del punto que bloquea |
| `blk_height_m[j]` | float64 | m | Cota del punto que bloquea |

Y además: `site_height_m` (cota del terreno en el sitio), `relief_label`, `stats` (§6) y el perfil para el corte (§8).

## 2. Constantes

| Nombre | Valor | Fuente o motivo |
| --- | --- | --- |
| `R_M` | 1.737.400,0 m | Esfera de referencia |
| `N_AZ` | 720 | Plan: máscara cada 0,5° |
| `AZ_STEP_DEG` | 0,5 | Plan |
| `MAX_DIST_M` | 300.000 | Plan: hasta ~300 km |
| Ley `full` | `d0 = 20 m`, `n_lin = 1000`, `g = 1,001`, `N_S = 3709` | D-07 |
| Ley `fast` | `d0 = 40 m`, `n_lin = 500`, `g = 1,002`, `N_S = 1855` | D-07 |

Por qué 300 km: desde un observador a cota h_o, un relieve de cota h_t puede asomar hasta la distancia √(2R·h_o) + √(2R·h_t). Con las cotas máximas de los DEM polares (7,03 km, etiqueta de P1) en ambos extremos sale 2·√(2 · 1737,4 · 7,03) = 312,6 km; con un observador a +2 km, 83 + 156 = 239 km.

## 3. Ley de muestreo radial

Distancias medidas sobre la esfera de referencia, las mismas para todos los sitios y acimuts. Forma cerrada (así Python y TypeScript obtienen los mismos valores):

```
function law_distance(law, i):            # i = 0 … N_S − 1, resultado en metros
    if law == 'full':
        if i < 1000: return 20.0 · (i + 1)
        else:        return 20000.0 · pow(1.001, i − 999)
    if law == 'fast':
        if i < 500:  return 40.0 · (i + 1)
        else:        return 20000.0 · pow(1.002, i − 499)
```

| Ley | Tramo lineal | Tramo geométrico | N_S | Última distancia |
| --- | --- | --- | --- | --- |
| `full` | 20, 40, …, 20.000 m (1.000 muestras) | 20.000·1,001ⁿ, n = 1…2709 | 3.709 | ≈ 299.878 m |
| `fast` | 40, 80, …, 20.000 m (500 muestras) | 20.000·1,002ⁿ, n = 1…1355 | 1.855 | ≈ 299.772 m |

Cuentas: ln 15 / ln 1,001 = 2,70805 / 0,00099950 = 2709,4 → 2709 pasos; ln 15 / ln 1,002 = 2,70805 / 0,00199800 = 1355,4 → 1355 pasos.

Justificación del paso:

- Cerca (hasta 20 km) el paso de 20 m es la mitad del píxel de 40 m: no se salta ningún píxel en ninguna dirección.
- Lejos, el paso es el 0,1 % de la distancia (100 m a 100 km, 300 m a 300 km). Si una cresta queda entre dos muestras, el error en altura es como mucho medio paso por la pendiente, y el error en ángulo es (0,0005·d·p)/d = 0,0005·p radianes, independiente de la distancia: con pendiente p = 0,3 (17°), 0,0086°. Con la ley `fast`, el doble (0,017°).
- La separación lateral entre rayos vecinos (0,5°) es de 87 m a 10 km y de 2,6 km a 300 km. Un pico más estrecho que esa separación puede caer entre dos rayos: es una limitación de la máscara de 0,5° decidida en el plan (`90_dudas_y_riesgos.md`).

## 4. Geometría

### 4.1 Rayo

```
u0 = (cos φ cos λ, cos φ sin λ, sin φ)                 # dirección del sitio
E, N, U = enu_basis(lat, lon)                            # 05_efemerides.md §3
t(a) = cos(a)·N + sin(a)·E                               # tangente hacia el acimut a
θ_i = law_distance(law, i) / R_M                         # ángulo central
P(a, i) = cos(θ_i)·u0 + sin(θ_i)·t(a)                    # vector unitario del punto muestreado
```

`P` recorre el círculo máximo que sale del sitio con acimut inicial `a`. Al ser vectores unitarios en MOON_ME no hay casos especiales en longitud ±180° ni en el polo.

### 4.2 Cota del terreno en la muestra

`h, valid, grid_index = stack.height_m(P)`: interpolación bilineal en el primer DEM de la pila que cubre el punto (`03_datos_y_fuentes.md` §3 y §7). La cota del sitio es `h_site = stack.height_m(u0)`.

Qué relieve se usa según zona y distancia:

| Sitio | Muestras dentro del cuadrado de P1 (±304 km del polo) | Resto de muestras hasta P2 (±457,44 km) | Más allá |
| --- | --- | --- | --- |
| Polar (`lola_polar`) | P1, 40 m | P2, 120 m | P3 si está en la pila; si no, el rayo termina |
| 60°–75° S (`lola_60s`) | P3, 120 m en todo el rayo | | El rayo termina en el borde de P3 |
| 60° S–60° N (`sldem2015`) | Recorte SLDEM2015, 59 m en todo el rayo | | El rayo termina en el borde del recorte |
| Sin relieve (`smooth`) | No se muestrea: §9 | | |

El cambio de un DEM a otro es por muestra y sin mezcla: cada muestra sale entera de un único DEM. P1 y P2 proceden de los mismos datos de LOLA, así que el salto en la costura es de pocos metros (comprobación 3 de `03_datos_y_fuentes.md` §4.3).

### 4.3 Elevación de una muestra (con curvatura, en 3D)

Observador en el radio `r_o = R_M + h_site + h_obs`; punto del terreno en el radio `r_t = R_M + h`, separado por el ángulo central θ. En el plano vertical que contiene a ambos, con origen en el observador:

```
horizontal = r_t · sin θ
vertical   = r_t · cos θ − r_o  =  (h − h_site − h_obs) − 2 · r_t · sin²(θ/2)
el = atan2(vertical, horizontal)
```

La segunda forma de `vertical` es la que se programa: no resta dos números de ~1,7·10⁶ m y por eso conserva la precisión en `float32`. Es exactamente la geometría cartesiana en 3D de dos puntos situados sobre sus radios; el motor de referencia incluye además la versión literal para comprobarlo:

```
function elevation_cartesian(u0, U, P, r_o, r_t):        # solo para pruebas
    v = r_t·P − r_o·u0
    return atan2(v·U, sqrt(|v|² − (v·U)²))
```

Efecto de la curvatura: un monte de 3 km a 50 km se ve a 2,606°, no a atan(3/50) = 3,434° (cálculo a mano en §10.2).

### 4.4 Máximo y punto que bloquea

Para cada acimut: `i* = argmax_i el(i)` sobre las muestras válidas; en caso de empate, la más cercana. Entonces `el_deg = degrees(el(i*))`, `dist_m = law_distance(i*)`, `blk_height_m = h(i*)` y las coordenadas del punto salen de `P(a, i*)` con `lat = atan2(Z, √(X²+Y²))`, `lon = atan2(Y, X)`.

## 5. Pseudocódigo del motor de referencia

```
function horizon_mask(lat, lon, stack, observer_heights=[2.0, 10.0], law='full'):
    if stack is None: return smooth_mask(observer_heights)                    # §9
    u0 = unit(lat, lon);  E, N, U = enu_basis(lat, lon)
    h_site, ok, _ = stack.height_m(u0)
    if not ok: raise SiteOutsideRelief(lat, lon)
    d = [law_distance(law, i) for i in 0..N_S−1];  θ = d / R_M
    sinθ = sin(θ); cosθ = cos(θ); s2 = sin(θ/2)²
    for bloque de acimuts J (p. ej. 90 a la vez):                            # memoria acotada
        a = radians(0.5 · J)
        T = cos(a)[:,None]·N + sin(a)[:,None]·E                              # [|J|, 3]
        P = cosθ[None,:,None]·u0 + sinθ[None,:,None]·T[:,None,:]             # [|J|, N_S, 3]
        h, valid, gi = stack.height_m(P)                                     # [|J|, N_S]
        r_t = R_M + h
        for ho in observer_heights:
            vertical = (h − h_site − ho) − 2·r_t·s2
            el = atan2(vertical, r_t·sinθ);  el[~valid] = −inf
            i* = argmax(el, axis=1)                                          # primer máximo
            if el[j, i*] == −inf:                                            # ninguna muestra válida
                usar los valores de la Luna lisa para ese acimut y contar en stats.empty_az
            guardar el_deg, dist_m, blk_lat, blk_lon, blk_height para cada j
        acumular para el perfil (§8) con la altura de observador 2 m
        acumular stats
    return Mask(...)
```

Salida a disco: `python -m pipeline.cli site-mask --site <site_id>` escribe `horizon/<site_id>.json` y `profile/<site_id>.bin.gz` (`09_contrato_datos.md` §5 y §6). Redondeos al escribir: elevación a 0,0001°, distancia a 1 m, latitud y longitud a 0,00001°, cota a 0,1 m.

## 6. Casos límite

| Caso | Qué pasa | Qué se hace |
| --- | --- | --- |
| Acimut 0°/360° | El índice 720 no existe | La máscara es periódica: el vecino del índice 719 es el 0. Toda interpolación usa `j mod 720` |
| Longitud ±180° | Un rayo cruza el antimeridiano | Nada especial: se trabaja con vectores unitarios. En recortes SLDEM2015 la columna se calcula con `wrap360(lon − LONW)` |
| Sitio en el polo exacto | E y N quedan definidos por la longitud dada | Válido; con lon = 0, el acimut 0° apunta al meridiano cero y el 90° a 90° E |
| Rayo que pasa por el polo | La longitud salta 180° | Nada especial (vectores unitarios y fórmula racional del §3.1 de `03`) |
| El rayo sale de todos los DEM de la pila | Las muestras siguientes no son válidas | Se ignoran; el acimut cuenta en `stats.truncated_az` y se guarda la menor distancia de corte en `stats.min_truncation_dist_m` |
| Valores sin dato dentro del DEM | Muestra no válida | Se ignora y se cuenta en `stats.nodata_samples`. Si superan el 1 % de las muestras de la máscara, `stats.warning = "nodata"` |
| Cambio de DEM a mitad de rayo | Salto de pocos metros | Sin mezcla. `stats.grid_usage` guarda la fracción de muestras de cada DEM |
| Sitio fuera de todo relieve | No hay cota del sitio | Error `SiteOutsideRelief`; el lote lo registra y publica el sitio con `relief = smooth` |
| Sitio a menos de un píxel del borde | Puede no haber ninguna muestra válida en algunos acimuts | Esos acimuts toman el valor de Luna lisa y cuentan en `stats.empty_az` |
| Sol rasante | El resultado depende de centésimas de grado | La máscara guarda 0,0001°; el criterio y la fracción de disco se tratan en `07_visibilidad.md` |
| Observador a 0 m | El terreno inmediato puede dar elevaciones altas | Permitido; la primera muestra está a 20 m (o 40 m) |
| Altura de observador mayor | El horizonte baja o se queda igual en cada acimut | Invariante comprobado (§10.5) |

Efecto del corte a 300 km o en el borde del DEM: a 257 km (peor caso de la malla del mapa: puntos del borde oeste, x = −200 km, frente al borde de P2 en x = −457,44 km) la esfera ya ha caído 257²/(2·1737,4) = 19,0 km; solo un observador a varios kilómetros de cota podría ver relieve más lejano. Se informa en `stats`, no se corrige.

`stats`: `{ "truncated_az": int, "min_truncation_dist_m": float|null, "nodata_samples": int, "empty_az": int, "grid_usage": {"<grid>": fracción}, "min_el_deg": float, "max_el_deg": float, "warning": null|"nodata" }`.

## 7. Altura del observador

- Por defecto 2 m (`masks[0]`); 10 m como extra (`masks[1]`), calculada en la misma pasada porque reutiliza las cotas muestreadas.
- La cota del sitio es la del DEM interpolado; el observador está en la vertical local.
- Propiedad: para todo acimut, `el(10 m) ≤ el(2 m)`. Demostración: para cada muestra fija, `vertical` disminuye al aumentar `h_obs` y `horizontal` no cambia; el máximo de funciones que bajan también baja.

## 8. Perfil para el corte (F12)

Para dibujar el corte hace falta el terreno a lo largo de cada acimut. Se guarda reducido a 512 intervalos por acimut, conservando en cada intervalo la muestra de mayor elevación (vista desde el observador a 2 m): así la silueta del dibujo es la que fija el horizonte.

```
function reduce_profile(h[N_S], el[N_S], valid[N_S]):
    for b in 0..511:
        i_lo = ceil(b · N_S / 512);  i_hi = ceil((b + 1) · N_S / 512) − 1
        candidatos = [i en i_lo..i_hi con valid[i]]
        if vacío: out[b] = −32768
        else:     out[b] = clamp(round(h[argmax el sobre candidatos]), −32767, 32767)    # metros
    return out                                                                            # int16[512]

function profile_bin_distance(law, b):                 # distancia de dibujo del intervalo b
    i_lo = ceil(b · N_S / 512);  i_hi = ceil((b + 1) · N_S / 512) − 1
    return law_distance(law, floor((i_lo + i_hi) / 2))
```

Con la ley `full` cada intervalo agrupa 7 u 8 muestras: 140–160 m hasta 20 km y un 0,7–0,8 % de la distancia más allá. El punto que bloquea no se toma del perfil sino de la máscara (`dist_m`, `blk_height_m`), que es exacta.

Coordenadas del dibujo (las usa `web/src/ui/section/`): plano vertical local del observador, en el que las líneas de visión son rectas que salen del origen.

```
function local_xy(d_m, h_m, h_site_m, h_obs_m):
    θ = d_m / R_M
    x = (R_M + h_m) · sin θ                               # horizontal, m
    y = (h_m − h_site_m − h_obs_m) − 2·(R_M + h_m)·sin²(θ/2)   # vertical respecto al ojo, m
    return x, y
```

En esas coordenadas la esfera lisa se ve caer (curvatura), la línea al centro del astro es `y = x·tan(el_astro)` y la línea del horizonte es `y = x·tan(el_horizonte)`, que toca el terreno en el punto que bloquea.

Formato del fichero: `09_contrato_datos.md` §6. Para la validación manual A5: `python -m pipeline.cli profile-csv --site <id> --az <grados>` escribe un CSV con todas las muestras sin reducir (`i, dist_m, lat_deg, lon_deg, height_m, el_deg, grid`), que A1 reproduce en una hoja de cálculo a partir del perfil sacado en QGIS.

## 9. Máscara de Luna lisa

Sin relieve, el horizonte es el mismo en todos los acimuts:

```
function smooth_mask(observer_heights):
    for ho in observer_heights:
        dip = acos(R_M / (R_M + ho))                      # rad
        el_deg[j]  = −degrees(dip)                        # para todo j
        dist_m[j]  = R_M · dip
        blk_height_m[j] = 0
        blk_lat/lon[j] = punto a dist_m en el acimut j (misma fórmula del §4.1)
    site_height_m = 0;  relief_label = "Smooth Moon (no terrain)"
```

Para `ho = 0` (comparaciones con Horizons): el = 0° y `dist_m = 0`. Para 2 m: −0,0869° y 2.636 m. Esta función existe también en TypeScript (`core/horizon.ts: smoothMask(observerHeightM)`), porque la web la usa para F4 y para las coordenadas a medida fuera del relieve.

## 10. Pruebas con casos sintéticos

Se hacen con un `SyntheticGrid` cuya cota es una función analítica de la posición (no un fichero), de modo que el valor esperado sale de una fórmula a mano. Fichero: `pipeline/tests/test_horizon_synthetic.py`. Son rápidas (< 10 s en total) y forman parte de `make test`.

### 10.1 Esfera lisa: depresión del horizonte (caso A4)

Terreno h = 0 en todas partes, sitio (0°, 0°). Esperado en los 720 acimuts: `el = −acos(R/(R+h_obs))`.

| h_obs | Cuenta a mano | Elevación esperada | Distancia al punto de tangencia |
| --- | --- | --- | --- |
| 2 m | ε = 2/1.737.402 = 1,15114·10⁻⁶; √(2ε) = 1,51733·10⁻³ rad | −0,0869° | 2.636 m |
| 100 m | ε = 100/1.737.500 = 5,7554·10⁻⁵; √(2ε) = 0,0107288 rad | −0,6147° | 18.640 m |
| 1.000 m | ε = 1000/1.738.400 = 5,7524·10⁻⁴; √(2ε)·(1 + ε/12) = 0,0339204 rad | −1,9435° | 58.933 m |

Tolerancia: 0,0005° en elevación (la de A4 es 0,005°) y dos pasos de muestreo en distancia. El plan redondea a 0,087°, 0,615° y 1,943°.

### 10.2 Monte de 3 km a 50 km (caso A4)

Sitio (0°, 0°), terreno h = 3000·exp(−ρ²/(2·500²)) m, con ρ la distancia sobre la esfera al punto situado a 50.000 m al este del sitio. Esperado en el acimut 90° (j = 180):

- θ = 50.000/1.737.400 = 0,0287786 rad; r_t = 1.740.400 m.
- vertical = 3000 − h_obs − 2·1.740.400·sin²(θ/2) = 3000 − h_obs − 720,7 m.
- horizontal = 1.740.400·sin θ = 50.079,4 m.
- Con h_obs = 0: atan(2279,3/50.079,4) = **2,606°**. Con h_obs = 2 m: atan(2277,3/50.079,4) = 2,604°.
- Sin curvatura sería atan(3000/50.000) = 3,434°.

La muestra más próxima de la ley `full` está a 50.012,6 m (n = 917), donde el monte mide 2.999,0 m: el resultado baja menos de 0,001°. Tolerancia 0,005°. En el acimut 80° (j = 160) el resultado es la depresión de la esfera lisa. `dist_m[180]` = 50.012,6 m ± 51 m.

### 10.3 Sitio en el centro de una depresión circular

Terreno h = 0 a menos de 9.990 m del sitio y h = 500 m a 9.990 m o más. El borde se pone entre las muestras i = 498 (9.980 m) e i = 499 (10.000 m) a propósito: si estuviera en 10.000 m exactos, un redondeo en el cálculo de la distancia ρ podría dejar la muestra 499 a cota 0 y el máximo pasaría a la muestra 500 (10.020 m, 2,680°), fuera de la tolerancia. Esperado en los 720 acimuts, con h_obs = 2 m:

- θ = 10.000/1.737.400 = 0,005755727 rad; r_t = 1.737.900 m.
- vertical = 500 − 2 − 2·r_t·sin²(θ/2) = 498 − 28,787 = 469,213 m; horizontal = r_t·sin θ = 10.002,82 m.
- el = atan(0,0469081) = **2,6857°**; `dist_m` = 10.000 m (es la muestra i = 499 de la ley `full`); `blk_height_m` = 500.

Tolerancia 0,001°. Más allá del borde la meseta sigue a 500 m pero se ve cada vez más baja por la curvatura: el máximo está en el borde.

### 10.4 Convenio de acimut, polo y antimeridiano

Un único monte gaussiano (3.000 m, σ = 500 m) y se comprueba en qué índice aparece el máximo de la máscara:

| Sitio | Posición del monte | Índice esperado del máximo |
| --- | --- | --- |
| (10° N, 20° E) | 50 km al norte (misma longitud, latitud 10° + 1,64890°) | j = 0, y \|`el[719]` − `el[1]`\| < 10⁻⁹° (simetría a través de 0°/360°; no se compara con igualdad exacta de coma flotante) |
| (10° N, 20° E) | 50 km al este por el círculo máximo de acimut 90° | j = 180 |
| (10° N, 20° E) | 50 km al sur | j = 360 |
| (10° N, 20° E) | 50 km al oeste | j = 540 |
| (−90°, 0°) | (−88,35110°, 90° E) | j = 180 |
| (−90°, 0°) | (−88,35110°, 0°) | j = 0 |
| (0°, 179,9° E) | (0°, −179,9°), a 6.065 m al este | j = 180 |

(50 km = 50.000/1.737.400 rad = 1,64890°; 0,2° de arco = 6.064,7 m.)

### 10.5 Invariantes (caso A9)

Con 20 terrenos sintéticos al azar (suma de 30 gaussianas de altura entre −2.000 y +4.000 m y σ entre 0,5 y 20 km, semilla fija):

- `el(10 m)[j] ≤ el(2 m)[j] + 10⁻⁹` para todo j.
- `elevation_cartesian` y la fórmula cerrada difieren menos de 10⁻⁹ grados en las muestras a 100 m o más del sitio, y menos de 5·10⁻⁹ grados en las cuatro más cercanas (20, 40, 60 y 80 m de la ley `full`): el redondeo de `float64` del vector unitario de la muestra (~3·10⁻¹⁰ m) visto a 20 m ya son ~10⁻⁹° (decisión D-51; llevado aquí en T-81).
- La máscara no cambia si la longitud del sitio se da como λ o como λ ± 360°.

### 10.6 Bordes y huecos

- `SyntheticGrid` válido solo a menos de 100 km del sitio: no hay excepción, `stats.truncated_az == 720` y `stats.min_truncation_dist_m` está entre 99.900 y 100.100 m.
- `SyntheticGrid` con un 5 % de muestras sin dato al azar: no hay excepción y `stats.warning == "nodata"`.
- Sitio fuera del `SyntheticGrid`: se lanza `SiteOutsideRelief`.

### 10.7 Motor del cubo frente al de referencia

Mismo terreno sintético muestreado en una rejilla polar de 40 m y en otra de 120 m guardadas en memoria; 16 puntos; `engine_torch` en CPU frente a `engine_ref`: diferencia máxima de elevación < 0,002° y misma muestra `i*` salvo empates (`08_mapa_polar.md` §3.5).

### 10.8 Con datos reales (lentas, marcadas `data`)

- A5 (manual): tres acimuts de un sitio polar con `profile-csv`, comparados por A1 y A2 con el perfil de QGIS; tolerancia 0,1°.
- La máscara de cualquier sitio real cumple: `min_el_deg ≥ −6°`, `max_el_deg ≤ 45°`, sin `NaN`, 720 valores.
- Repetibilidad: dos ejecuciones dan el mismo fichero byte a byte.

## 11. Coste

| Qué | Muestras | Tiempo esperado | Memoria | Cómo se mide |
| --- | --- | --- | --- | --- |
| Una máscara, ley `full`, motor de referencia | 720 × 3.709 = 2.670.480 | 1–5 s en un núcleo | < 500 MB (bloques de 90 acimuts) | `time python -m pipeline.cli site-mask --site <id>` |
| Lote de 43 sitios | 1,15·10⁸ | < 5 min, más la lectura de los recortes | Ídem | `time make sites` |
| Cubo completo | 1,35·10¹² (`full`) | Horas; se mide antes de lanzarlo | `08_mapa_polar.md` §4 | `make cube-bench` |

Los tiempos son estimaciones de diseño (2·10⁷ muestras bilineales por segundo y núcleo en NumPy). La tarea T-08 anota el valor medido en `docs/constants.md`.

Optimización permitida que no cambia el resultado: terminar un rayo cuando ninguna cota posible puede superar el máximo ya encontrado, es decir, cuando para la distancia actual d se cumple `H_MAX − h_site − h_obs − 2·(R_M + H_MAX)·sin²(d/(2R_M)) < (R_M + H_MAX)·sin(d/R_M)·tan(el_max)`, con `H_MAX` = cota máxima del DEM según su etiqueta más 10 m. Solo se aplica en el motor del cubo.
