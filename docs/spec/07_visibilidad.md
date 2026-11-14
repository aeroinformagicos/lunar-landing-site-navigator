# 07 · Visibilidad

A partir de la tabla de efemérides (`05`) y de la máscara de horizonte de un sitio (`06`), este módulo responde: ¿hay Sol?, ¿hay enlace con la Tierra?, ¿cuánto disco se ve?, ¿cuándo empieza y acaba cada ventana?, ¿cuánto falta para la puesta?, ¿hay eclipse?, ¿sigue valiendo el escenario? y ¿qué candidato es mejor?

Existe dos veces con el mismo algoritmo: la **referencia** en Python (`pipeline/vis/`, I1), que genera los valores esperados, y el **núcleo** en TypeScript (`web/src/core/`, I2), que es lo que ejecuta la web. Todo en `float64`. §12 define cómo se demuestra que son equivalentes.

## 1. Tipos

```ts
export interface Mask {                  // una altura de observador de horizon/<site>.json
  observerHeightM: number
  elDeg: Float64Array                    // 720
  distM: Float64Array; blkLatDeg: Float64Array; blkLonDeg: Float64Array; blkHeightM: Float64Array
  minElDeg: number; maxElDeg: number     // calculados al cargar
}
export interface Scenario {
  siteId: string                         // o 'custom:<lat>,<lon>' o 'grid:<i>,<j>'
  landingUnix: number                    // UTC
  missionDays: number                    // por defecto 14; rango 0,5–60
  observerHeightM: 2 | 10
}
export interface BodyState extends BodySky {       // BodySky: 05_efemerides.md §4.6
  horizonDeg: number; marginDeg: number; visible: boolean
}
export interface SkyState {
  tUnix: number
  sun: BodyState & { discFraction: number; litFraction: number }
  earth: BodyState
  both: boolean
  eclipse: { kind: 'none' | 'partial' | 'total'; covered: number }
}
export type EventKind = 'sunrise' | 'sunset' | 'earthrise' | 'earthset'
                      | 'eclipse_start' | 'eclipse_end' | 'totality_start' | 'totality_end'
export interface SkyEvent { tUnix: number; kind: EventKind }
export interface Window { startUnix: number; endUnix: number; openStart: boolean; openEnd: boolean }
```

En Python, los mismos nombres en `snake_case` y `dataclass`.

## 2. Horizonte en un acimut cualquiera

Interpolación lineal periódica entre las dos muestras vecinas de la máscara:

```
function horizon_at(el[720], az_deg):
    x = ((az_deg mod 360) + 360) mod 360 / 0.5
    j = floor(x);  f = x − j
    return (1 − f)·el[j mod 720] + f·el[(j + 1) mod 720]

function blocker_at(mask, az_deg):               # sin interpolar: la muestra más próxima
    j = round(((az_deg mod 360) + 360) mod 360 / 0.5) mod 720
    return { az_deg: 0.5·j, el_deg: mask.el[j], dist_m: mask.dist[j], lat_deg, lon_deg, height_m }
```

## 3. Criterios

| Pregunta | Condición | Constante |
| --- | --- | --- |
| ¿Hay Sol? | `sun.margin = sun.el − horizon_at(sun.az) > 0` (centro del disco) | Plan |
| ¿Hay enlace? | `earth.margin = earth.el − horizon_at(earth.az) > 0` (centro del disco) | Plan |
| ¿Ambos? | Las dos a la vez | — |
| Criterio «cualquier fracción» (solo para comparar con la NASA y con el rótulo de Horizons) | `disc_any(...)` del §4.2 | D-21 |

Margen exactamente 0 = no visible. El margen de la Tierra se muestra siempre en grados (plan); el del Sol se acompaña del % de disco.

## 4. Fracción de disco visible

### 4.1 Definición y algoritmo

El disco (radio angular ρ, centro en acimut `az_c` y elevación `el_c`) se corta en K = 32 franjas verticales de igual anchura. En cada franja el horizonte se toma de la máscara en el acimut del centro de la franja.

```
function disc_fraction(mask, az_c, el_c, rho, K = 32):
    if el_c − rho ≥ mask.max_el: return 1.0            # todo el disco por encima de cualquier horizonte
    if el_c + rho ≤ mask.min_el: return 0.0
    cos_el = max(cos(radians(el_c)), 0.05)
    vis = 0; tot = 0
    for k in 0..K−1:
        x = rho · (−1 + (2k + 1)/K)                     # desplazamiento horizontal, grados de arco
        c = sqrt(rho² − x²)                             # semicuerda vertical
        H = horizon_at(mask.el, az_c + x / cos_el)
        vis += clamp(el_c + c − max(el_c − c, H), 0, 2c)
        tot += 2c
    return vis / tot
```

Propiedades: resultado en [0, 1]; con horizonte plano que pasa por el centro da exactamente 0,5; con horizonte por debajo del borde inferior, 1; por encima del borde superior, 0. El factor `1/cos_el` convierte arco horizontal en diferencia de acimut. La aproximación plana es válida porque el atajo de las dos primeras líneas se lleva todos los casos con el astro alto.

### 4.2 Criterio «cualquier fracción» (rápido, para capas)

```
function disc_any(el_hor_fn, az_c, el_c, rho):         # cinco columnas
    for q in [−0.8, −0.4, 0, 0.4, 0.8]:
        if el_c + rho·sqrt(1 − q²) > el_hor_fn(az_c + q·rho / max(cos(radians(el_c)), 0.05)): return true
    return false
```

### 4.3 Fracción iluminada

`lit_fraction = disc_fraction · (1 − eclipse.covered)`. Es exacta cuando una de las dos ocultaciones es 0 o total, y una aproximación cuando se solapan horizonte y eclipse (caso raro). Hasta que F13 esté implementada, `eclipse.covered = 0`.

## 5. Estado del cielo en un instante

```
function evaluate(table, frame, mask, t):
    sky = sky_at(table, frame, t)                                   # 05 §4.6
    for body in [sun, earth]:
        body.horizon = horizon_at(mask.el, body.az)
        body.margin  = body.el − body.horizon
        body.visible = body.margin > 0
    sun.disc_fraction = disc_fraction(mask, sun.az, sun.el, sun.radius)
    eclipse = eclipse_state(sky)                                     # §9
    sun.lit_fraction = sun.disc_fraction · (1 − eclipse.covered)
    return SkyState
```

`frame = site_frame(lat, lon, mask.site_height_m + observer_height_m)`.

## 6. Sucesos y ventanas

### 6.1 Búsqueda de cruces

```
function find_crossings(f, t_a, t_b, step = 600):       # f(t) → margen (positivo = se cumple)
    out = []
    t0 = t_a; m0 = f(t0)
    while t0 < t_b:
        t1 = min(t0 + step, t_b); m1 = f(t1)
        if (m0 > 0) != (m1 > 0):
            lo = t0; hi = t1; up = (m1 > 0)             # up: pasa a cumplirse
            while hi − lo > 1:                          # bisección hasta 1 s
                mid = (lo + hi)/2
                if (f(mid) > 0) == up: hi = mid else: lo = mid
            out.append({ t: round((lo + hi)/2), rising: up })
        t0 = t1; m0 = m1
    return out, initial_state = (f(t_a) > 0)
```

- Paso de 600 s. Dentro de un paso el Sol se mueve como mucho 0,09° en acimut (menos que el paso de la máscara), así que el margen es casi lineal y no se pierden cruces salvo ventanas de menos de 10 min, que se ignoran a propósito.
- Los instantes se redondean al segundo.

### 6.2 Sucesos de un escenario

| Suceso | Función `f(t)` |
| --- | --- |
| `sunrise` / `sunset` | `sun.margin` |
| `earthrise` / `earthset` | `earth.margin` |
| `eclipse_start` / `eclipse_end` | `(sun.radius + earth.radius) − sep` |
| `totality_start` / `totality_end` | `(earth.radius − sun.radius) − sep` |

`find_events(table, frame, mask, t_a, t_b)` devuelve la lista ordenada por tiempo.

### 6.3 Ventanas

```
function windows_from(crossings, initial_state, t_a, t_b):
    ws = []; open = initial_state ? t_a : null; open_start = initial_state
    for c in crossings:
        if c.rising and open == null: open = c.t; open_start = false
        if not c.rising and open != null:
            ws.append({ start: open, end: c.t, open_start, open_end: false }); open = null
    if open != null: ws.append({ start: open, end: t_b, open_start, open_end: true })
    return ws
```

`open_start`/`open_end` indican que la ventana sigue más allá del intervalo analizado (se dibuja con el extremo sin rematar). Ventanas de «ambos»: intersección de las de Sol y Tierra. Noches: complemento de las ventanas de Sol dentro de [t_a, t_b].

## 7. Métricas de un escenario (F5, F6, F7)

Intervalo de misión: `t_a = landingUnix`, `t_b = landingUnix + missionDays·86400`. Si `t_b` supera el final del tramo de la tabla, se recorta y se añade el aviso `Mission extends beyond available ephemeris; results truncated.`

| Métrica | Definición | Unidad |
| --- | --- | --- |
| `sun_el_deg`, `sun_margin_deg`, `sun_disc_pct`, `sun_lit_pct` | Estado en el instante del cursor | °, °, %, % |
| `earth_el_deg`, `earth_margin_deg` | Estado en el instante del cursor | ° |
| `sun_hours`, `earth_hours`, `both_hours` | Suma de la duración de las ventanas dentro de la misión | h |
| `sun_pct`, `earth_pct`, `both_pct` | Horas ÷ duración de la misión × 100 | % |
| `longest_night_h` | Noche más larga dentro de la misión (recortada a la misión) | h |
| `longest_link_gap_h` | Intervalo más largo sin enlace dentro de la misión | h |
| `sun_el_max_deg`, `sun_el_min_deg` | Extremos de la elevación solar en la rejilla de 10 min | ° |
| `next_sun_event` | Primer `sunset` (si hay Sol) o `sunrise` (si no) posterior al cursor | suceso |
| `next_earth_event` | Primer `earthset` (si hay enlace) o `earthrise` (si no) posterior al cursor | suceso |

**Cuenta atrás (F6):** `next_*_event` se busca desde el cursor hasta 60 días después, aunque la misión acabe antes. Si no hay suceso en 60 días: texto `No sunset in the next 60 days` (o `No sunrise…`, `No Earthset…`, `No Earthrise…`). El contador se muestra como `Dd HHh MMm` y, por debajo de una hora, `MMm SSs`.

**Curvas (F5):** elevación del Sol y de la Tierra y horizonte en su acimut, en la rejilla de 10 min del intervalo mostrado (por defecto, la misión con un 10 % de margen a cada lado).

**Luna lisa frente a real (F4):** las mismas métricas con `smooth_mask(observer_height)` y el mismo `frame`. Cifras que se muestran: `Δ sun_hours`, `Δ earth_hours` y la diferencia en el primer suceso solar (`real − lisa`, con signo, en horas y minutos).

## 8. Requisitos de replanificación (F10)

### 8.1 Requisitos y valores por defecto

```ts
export interface Requirements {
  needSunAtLanding: boolean          // true
  needEarthAtLanding: boolean        // true
  maxNightHours: number              // 24      (editable: 0–400)
  marginalEarthMarginDeg: number     // 1.0     (no editable en la interfaz)
  marginalSunFraction: number        // 1.0     (no editable en la interfaz)
}
```

La duración de la misión es la del escenario (14 días por defecto, editable). Son los tres requisitos del plan: Sol al aterrizar, Tierra al aterrizar y ninguna noche de más de 24 h en la misión.

### 8.2 Evaluación

```
function assess(scenario, req):
    s0 = evaluate(..., scenario.landing)
    m  = metrics(scenario)
    checks = {
        sun_at_landing:   (not req.need_sun_at_landing)   or s0.sun.visible,
        earth_at_landing: (not req.need_earth_at_landing) or s0.earth.visible,
        night_ok:         m.longest_night_h ≤ req.max_night_hours
    }
    if not (checks.sun_at_landing and checks.earth_at_landing and checks.night_ok):
        status = 'no_go'
    else if (req.need_sun_at_landing and s0.sun.disc_fraction < req.marginal_sun_fraction − 1e-9)
         or (req.need_earth_at_landing and s0.earth.margin < req.marginal_earth_margin_deg)
         or (m.longest_night_h > 0.75 · req.max_night_hours):
        status = 'marginal'
    else:
        status = 'go'
    return { status, checks, longest_night_h: m.longest_night_h, both_pct: m.both_pct, reasons }
```

`reasons` es una lista de códigos para el texto llano (`10_interfaz.md` §8): `no_sun_at_landing`, `no_earth_at_landing`, `night_too_long`, `sun_partly_hidden`, `earth_low`, `night_near_limit`.

| Estado | Color e icono | Significado | Texto |
| --- | --- | --- | --- |
| `go` | Verde, ✓ | Cumple los tres requisitos con margen | `Works` |
| `marginal` | Ámbar, ! | Cumple los tres, pero con poco margen | `Tight` |
| `no_go` | Rojo, ✕ | Falla al menos uno | `Doesn't work` |

«Sigue valiendo» = estado distinto de `no_go`.

### 8.3 Matriz sitio × fecha

Filas: los sitios de las tarjetas de escenario y, si se pide, las 9 regiones candidatas. Columnas: 31 fechas de aterrizaje `t0 + k·Δ`, k = 0…30, con `t0` = fecha del escenario base y Δ ∈ {6 h, 12 h, 1 d (por defecto), 2 d}. Cada celda es `assess` de ese sitio y esa fecha con la duración del escenario base.

Cálculo eficiente por fila (una sola pasada):

```
function replan_row(site, t0, Δ, D, req):
    T = [t0 + i·600 for i in 0 .. (30·Δ + D)/600]            # rejilla de 10 min
    sunVis[i], earthVis[i] = criterios del §3 en T[i]
    nights = rachas de sunVis == false: lista de (i_ini, i_fin)
    for k in 0..30:
        i0 = k·Δ/600;  i1 = i0 + D/600
        longest = mayor racha recortada a [i0, i1], en horas
        cell[k] = estado según §8.2 usando sunVis[i0], earthVis[i0], longest
                  (los márgenes de `marginal` se evalúan con evaluate() solo en T[i0])
    return cell
```

En la matriz se usa la rejilla sin bisección (resolución de 10 min); el detalle exacto se calcula al seleccionar una celda.

### 8.4 Siguiente ventana válida

```
function next_valid_landing(site, t0, D, req, horizon_days = 90):
    misma rejilla de 10 min sobre [t0, t0 + horizon_days + D]
    for i0 en pasos de 1 h desde t0:
        if estado(i0) != 'no_go': t_first = T[i0]; break
    else: return null
    avanzar en pasos de 1 h mientras estado != 'no_go' → t_last
    return { start: t_first, end: t_last, status_at_start }
```

Texto: `Next valid landing window: <start> – <end> UTC (<duración>)`; si no hay: `No valid landing window in the next 90 days.`

### 8.5 Ranking de candidatos

Para una fecha de aterrizaje y una duración, sobre los sitios con `replan_candidate = true` en `sites.json` (por defecto, los 9 puntos de las regiones candidatas):

```
function rank_candidates(sites, landing, D, req):
    rows = [ { site, ...assess(...), sun_pct, earth_pct } for site in sites ]
    ordenar por: orden(status) asc  (go = 0, marginal = 1, no_go = 2),
                 both_pct desc, longest_night_h asc, sun_pct desc, site_id asc
    return rows
```

`both_pct` se compara redondeado a 0,1 puntos y `longest_night_h` a 0,1 h, para que el orden sea el mismo en Python y TypeScript. La «alternativa» que propone la interfaz es la primera fila distinta del sitio actual con estado `go` (o `marginal` si no hay ninguna `go`).

## 9. Eclipses (F13)

Desde el sitio, la Tierra tapa el Sol cuando la separación angular entre los centros es menor que la suma de los radios.

```
function angular_sep(az1, el1, az2, el2):               # grados; fórmula del semiverseno
    Δaz = radians(az2 − az1); a1 = radians(el1); a2 = radians(el2)
    h = sin²((a2 − a1)/2) + cos(a1)·cos(a2)·sin²(Δaz/2)
    return degrees(2·asin(min(1, sqrt(h))))

function eclipse_state(sky):
    s = angular_sep(sun.az, sun.el, earth.az, earth.el)
    a = sun.radius; b = earth.radius                    # siempre b > a
    if s ≥ a + b: return { kind: 'none', covered: 0, sep_deg: s }
    if s ≤ b − a: return { kind: 'total', covered: 1, sep_deg: s }
    A = a²·acos((s² + a² − b²)/(2·s·a)) + b²·acos((s² + b² − a²)/(2·s·b))
        − 0.5·sqrt((−s + a + b)·(s + a − b)·(s − a + b)·(s + a + b))
    return { kind: 'partial', covered: A/(π·a²), sep_deg: s }
```

- No depende del relieve. Se calcula con la Tierra sin atmósfera (disco de 6.378,137 km), igual que en las cifras de comprobación del plan.
- Los sucesos de eclipse se buscan con `find_crossings` (§6.2) en el intervalo mostrado. En la interfaz se avisa aunque el Sol esté bajo el horizonte, indicando ese hecho.
- El eclipse no cuenta como noche para el requisito `maxNightHours` (la noche es de horizonte). La interfaz lo avisa aparte.

## 10. Casos límite

| Caso | Tratamiento |
| --- | --- |
| Sol rasante durante días (polo) | El margen cruza 0 varias veces: cada cruce es un suceso real; las ventanas de menos de 10 min no se detectan (§6.1) |
| Disco parcialmente tapado | `visible` sigue el criterio del centro; `discFraction` da el porcentaje; puede haber «hay Sol» con 55 % de disco y «no hay Sol» con 40 % |
| El Sol no se pone o no sale en la misión | Sin sucesos: `sun_hours = D` o 0; ventana con `open_start` y `open_end`; `longest_night_h` = 0 o D·24 |
| Noche que empieza antes del aterrizaje o acaba después del final | Se recorta al intervalo de la misión |
| Misión que cruza el final de la tabla | Recorte y aviso (§7) |
| Fecha fuera de la tabla | `OutOfRange` (05 §4.5): la tarjeta muestra el error y no se calcula nada |
| Máscara de Luna lisa | Mismo código; horizonte constante |
| Astro cerca del cénit | Atajos de `disc_fraction`; `horizon_at` con el acimut que salga |
| Acimut en 0°/360° | `horizon_at` es periódica |
| Año bisiesto, cambio de año | El tiempo es Unix; el formato de fecha lo hace `Date` en UTC |
| Eclipse con el Sol bajo el horizonte | Se informa con la nota `Sun below horizon` |
| `missionDays` no entero | Permitido (paso 0,5) |

## 11. Rendimiento esperado (núcleo en TypeScript)

| Operación | Evaluaciones | Presupuesto | Cómo se mide |
| --- | --- | --- | --- |
| `evaluate` | 1 | < 3 µs | `vitest bench` |
| Métricas de una misión de 14 días | 2.017 + bisecciones | < 10 ms | Ídem |
| Fila de la matriz (30 días + 14) | 6.337 | < 20 ms | Ídem |
| Matriz de 13 filas | 82.381 | < 300 ms | Ídem |
| `next_valid_landing` (90 días) | ~15.000 | < 50 ms | Ídem |
| Calendario anual (F25) | 52.561 | < 200 ms | Ídem |

Memoria: despreciable (vectores de pocos miles de elementos). Todo corre en el hilo principal salvo F32 (`08_mapa_polar.md` §7).

## 12. Equivalencia exacta entre Python y TypeScript

1. **Mismo algoritmo, mismo orden de operaciones.** Este fichero y `05` son la norma; ninguna de las dos implementaciones «mejora» nada por su cuenta. Si hay que cambiar algo, se cambia aquí, en las dos y en los vectores.
2. **Mismos datos de entrada.** Las dos leen `ephemeris.bin` (`float32` promovido a `float64`) y `horizon/<site>.json` con los redondeos del contrato. La referencia de Python **no** usa SPICE para la visibilidad: usa la tabla.
3. **Vectores compartidos.** `python -m pipeline.cli core-vectors` escribe `tests/golden/core_vectors.json` con casos generados por la referencia:

| Bloque | N.º de casos | Entrada | Salida esperada |
| --- | --- | --- | --- |
| `sky` | 200 | sitio (lat, lon, altura), `t_unix` | acimut, elevación, distancia y radio de Sol y Tierra |
| `horizon_at` | 50 | id de máscara, acimut | elevación |
| `disc_fraction` | 100 | id de máscara, `az_c`, `el_c`, `rho` | fracción |
| `evaluate` | 100 | sitio real, `t_unix`, altura de observador | `SkyState` completo |
| `events` | 20 | sitio, `t_a`, `t_b` | lista de sucesos |
| `metrics` | 20 | escenario | todas las métricas del §7 |
| `assess` | 30 | escenario, requisitos | estado, comprobaciones y motivos |
| `replan_row` | 6 | sitio, `t0`, Δ, D | 31 estados |
| `rank` | 4 | fecha, D | orden de `site_id` |
| `eclipse` | 30 | sitio, `t_unix` | `kind`, `covered`, `sep_deg` |

   Máscaras de los vectores: las de los sitios reales publicados y cuatro sintéticas definidas por fórmula (`flat:0`, `flat:0.5`, `tilt:0.3` = 0,3°·(az − 180)/180, `sine:1,3` = 1°·sin(3·az)), que cada lenguaje genera por su cuenta a partir del identificador.
4. **Tolerancias de la prueba de equivalencia** (`web/src/core/__tests__/vectors.test.ts`): ángulos 10⁻⁶ grados; fracciones 10⁻⁶; distancias 10⁻³ km; instantes ±1 s; horas ±0,001; estados y órdenes, idénticos.
5. **Caso B1** (interfaz frente a referencia): 0,01° y 1 min, sobre lo que se ve en pantalla.
6. **Reglas de presentación** (iguales en la interfaz y en `validation_report.json`): elevaciones y márgenes con 2 decimales; porcentajes de disco y de tiempo enteros, con `<1 %` si 0 < valor < 0,5 y `>99 %` si 99,5 ≤ valor < 100; horas con 1 decimal por debajo de 100 h y enteras por encima; instantes en UTC al minuto (`2025-03-16 18:15 UTC`).
7. **Funciones matemáticas.** Solo `sin`, `cos`, `atan2`, `asin`, `acos`, `sqrt`, `floor`, `round` (mitad hacia arriba: `floor(x + 0.5)`), `min`, `max`. Nada de bibliotecas de fechas dentro del núcleo: el núcleo trabaja en segundos Unix.

## 13. Pruebas con valores esperados

Además de los vectores compartidos, estas pruebas tienen valor esperado independiente del código. Python: `pipeline/tests/test_vis_*.py`; TypeScript: `web/src/core/__tests__/`.

### 13.1 `horizon_at`

Máscara `el[j] = j` (0…719): `horizon_at(0.25) = 0.5`; `horizon_at(359.75) = 359.5` (media entre `el[719] = 719` y `el[0] = 0`); `horizon_at(360) = horizon_at(0) = 0`; `horizon_at(−0.5) = 719`.

### 13.2 Fracción de disco (fórmula exacta del segmento circular)

Con horizonte plano H y δ = (H − el_c)/ρ, la fracción exacta es f = (acos δ − δ·√(1 − δ²))/π.

| Máscara | el_c | ρ | δ | Esperado | Tolerancia |
| --- | --- | --- | --- | --- | --- |
| `flat:0` | 0 | 0,265 | 0 | 0,5 | 10⁻¹² |
| `flat:0` | +0,265 | 0,265 | −1 | 1 | 10⁻¹² |
| `flat:0` | −0,265 | 0,265 | +1 | 0 | 10⁻¹² |
| `flat:0` | −0,1325 | 0,265 | +0,5 | (1,047198 − 0,433013)/π = 0,195501 | 0,003 |
| `flat:0` | +0,1325 | 0,265 | −0,5 | 0,804499 | 0,003 |
| `tilt:0.3`, az_c = 180 | 0 | 0,95 | — | 0,5 (simetría) | 10⁻⁹ |

### 13.3 Sucesos con Luna lisa (valores de Horizons, `05` §8.3)

Observador a 0 m, altura de sitio 0, máscara `flat:0`:

| Sitio | Suceso | Esperado | Tolerancia |
| --- | --- | --- | --- |
| Blue Ghost 1 (18,56° N, 61,81° E) | `sunset` el 2025-03-16 | 20:10:39 UTC | ± 10 s |
| Sitio previsto de IM-2 (84,78° S, 29,13° E) | `sunrise` el 2025-03-04 | 09:14:10 UTC | ± 20 s |

Con el observador a 2 m (horizonte liso a −0,0869°) la puesta de Blue Ghost se retrasa 0,0869°/(0,007997°/min) = 10,9 min: 20:21:31 UTC ± 15 s.

### 13.4 Eclipse del 14/03/2025 en Blue Ghost 1 (caso B3)

Sitio 18,562° N, 61,810° E, altura 0. Esperado según las cifras de comprobación del plan (SPICE): `eclipse_start` 05:01 UTC, `totality_start` 06:17:30 UTC, `totality_end` 08:34:00 UTC, `eclipse_end` 09:51 UTC. Tolerancia de regresión: ± 60 s. Frente a Firefly (05:00, 06:18, 08:34, 09:52 UTC): ± 5 min. `covered` = 1 a las 07:30 UTC.

### 13.5 Geometría del solape

`a = 0,265`, `b = 0,95`: `s = 1,3` → `none`; `s = 0,5` → `total`; `s = 1,215` (= a + b) → `covered = 0`; `s = 0,685` (= b − a) → `covered = 1`; `s = 0,95` → 0 < `covered` < 0,5; `covered` es decreciente en `s`.

### 13.6 Cordura (caso A8), con Luna lisa y observador a 0 m, rejilla de 1 h en todo el tramo `main`

- Chang'e 4 (−45,4561°, 177,5885°): `earth.el < 0` siempre.
- (0°, 0°): `earth.el > 75°` siempre.
- (−90°, 0°): |`sun.el`| < 1,6° y |`earth.el`| < 7,5° siempre.

### 13.7 Replanificación en Blue Ghost 1 (caso B2)

Escenario base: aterrizaje 2025-03-02T08:34:00Z, 14 días, observador a 2 m, requisitos por defecto. Con máscara lisa y con la de SLDEM2015:

| Retraso | Aterrizaje | Esperado | Motivo |
| --- | --- | --- | --- |
| 0 | 2025-03-02T08:34Z | `go` | La misión real: 14 días de luz |
| +14 d | 2025-03-16T08:34Z | `no_go`, con `night_too_long` | El Sol se pone ese mismo día (hacia las 18:00–20:20 UTC) y la noche dura unos 14,8 días |
| +29,5 d | 2025-03-31T20:34Z | `go` | Un mes sinódico después la geometría se repite |

Nota: el plan describe el caso de +14 días como «noche en el aterrizaje». Con la definición de requisitos del propio plan, lo que falla es la noche que empieza unas horas después de aterrizar; el resultado («no válido») es el mismo (`90_dudas_y_riesgos.md`).

### 13.8 Invariantes (caso A9)

Para 1.000 evaluaciones al azar: `0 ≤ disc_fraction ≤ 1`; `0 ≤ covered ≤ 1`; `visible == (margin > 0)`; las ventanas de un intervalo no se solapan y están ordenadas; `sun_hours + horas de noche = D·24` con error < 0,001 h; con la máscara de 10 m, `sun_hours` y `earth_hours` son mayores o iguales que con la de 2 m (menos 0,02 h de holgura por la bisección) en los sitios reales publicados.
