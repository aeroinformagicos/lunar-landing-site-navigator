# 05 · Efemérides

Dos piezas: (a) la **función de referencia** en Python con SPICE, que da el acimut y la elevación del Sol y la Tierra para cualquier sitio e instante con el método `spkcpo` del plan, y (b) la **tabla** `ephemeris.bin`, que permite a la web obtener lo mismo interpolando, sin SPICE. La tabla también la usa la referencia de visibilidad en Python (`07_visibilidad.md`), para que Python y TypeScript calculen exactamente lo mismo.

Módulos: `pipeline/ephem/` (I1) y `web/src/core/ephemeris.ts`, `web/src/core/frames.ts` (I2).

## 1. Constantes (van a `pipeline/common/constants.py`, `web/src/core/constants.ts` y `docs/constants.md`)

| Nombre | Valor | Unidad | Fuente |
| --- | --- | --- | --- |
| `R_MOON_KM` | 1737.4 | km | Etiquetas LOLA (`A_AXIS_RADIUS`); cabecera de Horizons |
| `R_SUN_KM` | 695700.0 | km | Plan; cabecera de Horizons (`Target radii`) |
| `R_EARTH_KM` | 6378.137 | km | Plan; cabecera de Horizons (`R_eq`) |
| `FRAME` | `"MOON_ME"` | — | `moon_de440_250416.tf` |
| `ABCORR` | `"LT+S"` | — | Plan |
| `STEP_S` | 3600 | s | Plan (tabla horaria) |
| `OBSERVER_HEIGHT_M` | 2.0 | m | Plan |

## 2. Carga de núcleos y tiempo

```
function load_kernels(dir = 'data/kernels'):
    for f in ['naif0012.tls', 'de440.bsp', 'moon_pa_de440_200625.bpc', 'moon_de440_250416.tf']:
        if not exists(dir/f): raise KernelMissing("Missing SPICE kernel: <f>. Run `make data-fetch`.")
        spiceypy.furnsh(dir/f)
    assert spiceypy.ktotal('ALL') == 4          # nada más cargado

function utc_iso_to_et(iso):        # iso = 'YYYY-MM-DDTHH:MM:SS[.sss]Z'
    return spiceypy.str2et(iso sin la 'Z')        # SPICE interpreta la cadena como UTC

function unix_to_iso(t):            # t en segundos Unix (float)
    return datetime.fromtimestamp(t, tz=UTC).strftime('%Y-%m-%dT%H:%M:%S.%f')

function unix_to_et(t):  return utc_iso_to_et(unix_to_iso(t))
```

Reglas de tiempo:

- El tiempo Unix no tiene segundos intercalares: cada día mide 86.400 s. `naif0012.tls` contiene los segundos intercalares hasta el de 2017-01-01 (ΔAT = 37 s). Para fechas posteriores SPICE mantiene 37 s, y Horizons hace lo mismo («the last known leap-second is used as a constant over future intervals»).
- Años bisiestos: toda la aritmética de fechas se hace con `datetime` (Python) y `Date` (JavaScript) en UTC, nunca con cuentas de días a mano. Prueba: el 2028-02-29T12:00:00Z existe y tiene valor de referencia (§8).
- Una hora con segundo 60 no es representable en tiempo Unix. La interfaz no admite `:60`; no hay ninguno dentro de 2024–2044 en el núcleo.
- Tramo `apollo` (1969–1972): la etiqueta UTC de cada muestra se convierte con SPICE tal cual. Antes de 1972 el UTC histórico no avanzaba por segundos enteros; la diferencia con Horizons puede llegar a ~1 s, que mueve el Sol 0,00014°. Dentro de ese tramo hay dos segundos intercalares (1972-07-01 y 1973-01-01): la interpolación a través de ellos comete un error de 1 s como mucho. Ambos efectos son 100 veces menores que la tolerancia y se documentan, no se corrigen.

## 3. Función de referencia (método `spkcpo`)

Es la que se compara con Horizons. Entradas: latitud y longitud en grados, altura total del observador sobre la esfera en metros (cota del terreno + altura del observador) y el instante.

```
function site_position_km(lat_deg, lon_deg, h_m):
    r = R_MOON_KM + h_m/1000
    φ = radians(lat_deg); λ = radians(lon_deg)
    return [r·cos φ·cos λ, r·cos φ·sin λ, r·sin φ]

function enu_basis(lat_deg, lon_deg):
    φ = radians(lat_deg); λ = radians(lon_deg)
    E = [−sin λ,        cos λ,        0    ]
    N = [−sin φ·cos λ, −sin φ·sin λ,  cos φ]
    U = [ cos φ·cos λ,  cos φ·sin λ,  sin φ]
    return E, N, U

function azel_from_vector(v, E, N, U):          # v = vector sitio → astro, km
    e = v·E; n = v·N; u = v·U
    az = degrees(atan2(e, n)) mod 360           # [0, 360)
    el = degrees(atan2(u, sqrt(e² + n²)))       # [−90, 90]
    return az, el, norm(v)

function azel_spice(target, et, lat_deg, lon_deg, h_m):     # target ∈ {'SUN', 'EARTH'}
    pos = site_position_km(lat_deg, lon_deg, h_m)
    state, lt = spiceypy.spkcpo(target, et, 'MOON_ME', 'OBSERVER', 'LT+S', pos, 'MOON', 'MOON_ME')
    E, N, U = enu_basis(lat_deg, lon_deg)
    return azel_from_vector(state[0:3], E, N, U)
```

Notas:

- `spkcpo` devuelve el vector observador → astro ya corregido de tiempo de luz y aberración estelar para un observador fijo en la Luna en `pos`. Con `refloc = 'OBSERVER'` el marco `MOON_ME` se evalúa en el instante `et`.
- La paralaje de la Tierra entre el centro de la Luna y la superficie (~0,26°) queda incluida porque el observador está en `pos`.
- En el polo exacto (lat = ±90°) la base ENU queda definida por la longitud dada: con lat = −90°, lon = 0°, N = (1, 0, 0) (hacia el meridiano cero) y E = (0, 1, 0). No hay singularidad en el código.
- Si el astro está en el cénit o el nadir (e = n = 0), `atan2(0, 0)` devuelve 0: az = 0° por convenio.
- Prohibido: `IAU_MOON`, `MOON_PA`, `spkezr` con `'J2000'` seguido de una rotación propia, y cualquier otro núcleo.

## 4. Tabla de efemérides

### 4.1 Qué contiene

Para cada instante de una rejilla horaria en UTC, los vectores **centro de la Luna → Sol** y **centro de la Luna → Tierra** en `MOON_ME`, en km, con corrección `LT+S`:

```
sun,   _ = spiceypy.spkpos('SUN',   et, 'MOON_ME', 'LT+S', 'MOON')
earth, _ = spiceypy.spkpos('EARTH', et, 'MOON_ME', 'LT+S', 'MOON')
```

La web obtiene el vector sitio → astro restando la posición del sitio: `v = V − p`. Diferencia con `spkcpo`: el tiempo de luz y la aberración se calculan para el centro de la Luna y no para el sitio. El sitio está a 1.737 km del centro (0,006 s de luz) y se mueve respecto a él a menos de 4,7 m/s. Hay tres términos (D-75):

- **Aberración trasladada al sitio (dominante).** `LT+S` desplaza el vector del centro `V` en |V|·β perpendicular a la línea de mira, con β = v/c ≈ 1,0·10⁻⁴ (velocidad de la Luna respecto al baricentro, ~30 km/s). Al restar `p` ese desplazamiento no se recalcula para la línea de mira del sitio, y queda un error de posición de hasta |p|·β ≈ 1.739 km × 1,0·10⁻⁴ ≈ 0,175 km. Para la Tierra (≥ 356.000 km) son hasta 4,9·10⁻⁷ rad ≈ **0,000028°**; para el Sol (≥ 1,47·10⁸ km), 7·10⁻¹⁰ rad, despreciable. Medido (T-06): 0,175 km y 0,000026°; con `LT` en lugar de `LT+S` el error cae a 10⁻⁸°.
- Aberración por la velocidad del sitio respecto al centro: 4,7 m/s ÷ 299.792.458 m/s = 1,6·10⁻⁸ rad = 0,0000009°.
- Tiempo de luz: 0,006 s × 1 km/s ÷ 384.000 km = 1,6·10⁻⁸ rad de posición de la Tierra.

Total: < 0,00003° para la Tierra y < 0,000002° para el Sol. En tiempo, la Tierra se mueve en el cielo lunar a 0,062°/h (mediana de 2024–2044) y como mucho 0,113°/h, de modo que 0,000028° mueven una salida o puesta de la Tierra del orden de 1–2 s (más cerca de los extremos de la libración, cuando la Tierra apenas se mueve). Para el Sol (0,51°/h) el efecto es menor de 0,01 s.

### 4.2 Tramos

| `id` | Válido desde | Válido hasta | `t0_utc` (primera muestra) | `t0_unix` | `n` | Bytes | `byte_offset` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `main` | 2024-01-01T00:00:00Z | 2045-01-01T00:00:00Z | 2023-12-31T23:00:00Z | 1704063600 | 184.107 | 4.418.568 | 0 |
| `apollo` | 1969-01-01T00:00:00Z | 1973-01-01T00:00:00Z | 1968-12-31T23:00:00Z | −31539600 | 35.067 | 841.608 | 4.418.568 |

Cuentas: de 2024-01-01 a 2045-01-01 hay 21 años con 6 bisiestos (2024, 2028, 2032, 2036, 2040, 2044) = 7.671 días = 184.104 horas = 184.105 nodos, más una muestra de guarda antes y otra después = 184.107. De 1969-01-01 a 1973-01-01 hay 1.461 días = 35.064 horas = 35.065 nodos, más dos de guarda = 35.067. Tamaño total del fichero: (184.107 + 35.067) × 24 = **5.260.176 bytes**.

La muestra `k` de un tramo corresponde a `t_k = t0_unix + k · 3600`.

### 4.3 Formato binario de `ephemeris.bin` (byte a byte)

- Sin cabecera. Todo `float32` IEEE 754 little-endian.
- Los tramos van concatenados en el orden de la tabla; cada tramo empieza en su `byte_offset`.
- Registro de 24 bytes por muestra:

| Bytes (dentro del registro) | Campo | Unidad |
| --- | --- | --- |
| 0–3 | `sun_x` | km |
| 4–7 | `sun_y` | km |
| 8–11 | `sun_z` | km |
| 12–15 | `earth_x` | km |
| 16–19 | `earth_y` | km |
| 20–23 | `earth_z` | km |

- La muestra `k` del tramo ocupa los bytes `byte_offset + 24·k` a `byte_offset + 24·k + 23`.
- Los metadatos van en `ephemeris.meta.json` (esquema en `09_contrato_datos.md` §3).

Precisión de `float32`: el vector al Sol mide ~1,5·10⁸ km y el espaciado entre números representables a esa magnitud es de 16 km, que son 0,000006° de dirección. El vector a la Tierra mide ~4·10⁵ km, con espaciado de 0,03 km (0,000004°).

### 4.4 Generación (`python -m pipeline.cli ephem`)

```
function build_table(out_dir):
    load_kernels()
    buf = float32[(184107 + 35067), 6]
    row = 0
    for seg in [main, apollo]:
        for k in 0 .. seg.n − 1:
            et = unix_to_et(seg.t0_unix + 3600·k)
            buf[row, 0:3] = spkpos('SUN',   et, 'MOON_ME', 'LT+S', 'MOON')
            buf[row, 3:6] = spkpos('EARTH', et, 'MOON_ME', 'LT+S', 'MOON')
            row += 1
    escribir buf en out_dir/ephemeris.bin (little-endian)
    escribir out_dir/ephemeris.meta.json
    assert tamaño del fichero == 5260176
```

Rendimiento esperado: 219.174 muestras × 2 llamadas; menos de 1 min en un portátil. Memoria: 5 MB. Se mide con `time make ephem`.

### 4.5 Interpolación (idéntica en Python y TypeScript)

Lagrange de 4 puntos, componente a componente, en `float64`:

```
function body_vectors_at(table, t):                 # t en segundos Unix
    seg = el tramo con valid_from_unix ≤ t ≤ valid_to_unix
    if no hay: raise OutOfRange
    x = (t − seg.t0_unix) / 3600
    k = floor(x)
    if k < 1: k = 1
    if k > seg.n − 3: k = seg.n − 3                 # solo ocurre en t = valid_to
    u = x − k                                        # 0 ≤ u ≤ 1
    w0 = −u·(u−1)·(u−2)/6                            # peso de la muestra k−1
    w1 =  (u+1)·(u−1)·(u−2)/2                        # muestra k
    w2 = −(u+1)·u·(u−2)/2                            # muestra k+1
    w3 =  (u+1)·u·(u−1)/6                            # muestra k+2
    for c in 0..5:
        out[c] = w0·S[k−1][c] + w1·S[k][c] + w2·S[k+1][c] + w3·S[k+2][c]
    return sun = out[0:3], earth = out[3:6]
```

`valid_from_unix = t0_unix + 3600` y `valid_to_unix = t0_unix + 3600·(n − 2)`. Los pesos suman 1; en u = 0 valen (0, 1, 0, 0).

Error de interpolación (estimación de diseño): para una cúbica de Lagrange en el intervalo central el error máximo es (9/384)·h⁴·|f⁗|. El vector al Sol gira en el sistema lunar a ω = 2π/(29,53 × 24 h) = 0,00887 rad/h, de modo que |f⁗| ≈ 1,5·10⁸ km × ω⁴ = 0,93 km/h⁴ y el error es de 0,02 km, es decir, 10⁻⁸ grados. Para la Tierra es aún menor. El término dominante es el redondeo de `float32` (§4.3).

Casos límite:

- `t` fuera de todos los tramos → error `OutOfRange`. Mensaje de interfaz: `Date outside the supported range (1969–1972 and 2024–2044).`
- `t` exactamente en `valid_to` → se usa el último intervalo con u = 1.
- `t` no finito → `OutOfRange`.

### 4.6 Acimut y elevación desde la tabla (Python `pipeline/ephem/interp.py` y TypeScript `core/frames.ts`)

```
function site_frame(lat_deg, lon_deg, h_m):          # se calcula una vez por sitio
    return { p: site_position_km(lat_deg, lon_deg, h_m), E, N, U: enu_basis(lat_deg, lon_deg) }

function sky_at(table, frame, t):
    sun, earth = body_vectors_at(table, t)
    az_s, el_s, d_s = azel_from_vector(sun − frame.p,   frame.E, frame.N, frame.U)
    az_e, el_e, d_e = azel_from_vector(earth − frame.p, frame.E, frame.N, frame.U)
    return {
        sun:   { az_deg: az_s, el_deg: el_s, range_km: d_s, radius_deg: degrees(asin(R_SUN_KM / d_s)) },
        earth: { az_deg: az_e, el_deg: el_e, range_km: d_e, radius_deg: degrees(asin(R_EARTH_KM / d_e)) }
    }
```

`h_m` = cota del terreno en el sitio (campo `site_height_m` de la máscara; 0 con Luna lisa) + altura del observador.

Firmas en TypeScript:

```ts
export interface Segment { id: string; t0Unix: number; n: number; byteOffset: number; validFromUnix: number; validToUnix: number }
export interface EphemerisTable { stepS: number; segments: Segment[]; data: Float32Array }
export interface SiteFrame { p: Vec3; e: Vec3; n: Vec3; u: Vec3 }
export interface BodySky { azDeg: number; elDeg: number; rangeKm: number; radiusDeg: number }
export function loadEphemeris(baseUrl: string): Promise<EphemerisTable>
export function bodyVectorsAt(table: EphemerisTable, tUnix: number): { sun: Vec3; earth: Vec3 }   // throws RangeError
export function siteFrame(latDeg: number, lonDeg: number, heightM: number): SiteFrame
export function skyAt(table: EphemerisTable, frame: SiteFrame, tUnix: number): { sun: BodySky; earth: BodySky }
```

`loadEphemeris` descarga `ephemeris.meta.json` y `ephemeris.bin`, comprueba que `byteLength == 5260176` y que `contract_version` empieza por `1.`, y construye `new Float32Array(buffer)` (todas las plataformas admitidas son little-endian; si `new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1` se lanza un error `Unsupported platform (big-endian).`).

## 5. Tamaño aparente de los discos

Radio angular = asin(R_astro / distancia). Con los límites de distancia de la prueba del §8.7 (Sol entre 1,45·10⁸ y 1,53·10⁸ km; Tierra entre 3,5·10⁵ y 4,1·10⁵ km) el radio del Sol queda entre 0,26° y 0,28° y el de la Tierra entre 0,89° y 1,05°. Comprobación con Horizons: Sol a 1,4911789075·10⁸ km → diámetro 2·asin(695700/1,4911789075·10⁸) = 0,5346217° = 1924,64″ (Horizons: 1924,638″). Tierra a 400.571,6086 km → 2·asin(6378,137/400571,6086) = 1,824671° = 6568,82″ (Horizons: 6568,817″).

## 6. Errores y mensajes

| Situación | Dónde | Mensaje |
| --- | --- | --- |
| Falta un núcleo | Pipeline | `Missing SPICE kernel: <name>. Run \`make data-fetch\`.` |
| Fecha fuera de cobertura de los núcleos | Pipeline | Se propaga el error de SPICE con el prefijo `SPICE error:` |
| Uso de `IAU_MOON` | Pipeline | Error de SPICE (no hay datos de orientación cargados); una prueba lo exige |
| `ephemeris.bin` con tamaño distinto | Web | `Ephemeris file is corrupt or incomplete. Reload the page.` |
| Fecha fuera de los tramos | Web | `Date outside the supported range (1969–1972 and 2024–2044).` |
| Fallo de red al cargar la tabla | Web | `Could not load ephemeris data. Check your connection and retry.` con botón `Retry` |

## 7. Rendimiento

| Operación | Esperado | Cómo se mide |
| --- | --- | --- |
| Generar la tabla | < 60 s, 5 MB | `time make ephem` |
| Descarga en la web | 5,26 MB una sola vez (cacheable) | Pestaña de red del navegador |
| `skyAt` en TypeScript | < 1 µs por llamada | Prueba `bench` de Vitest: 10⁶ llamadas en menos de 1 s |
| Línea temporal de 14 días a 10 min (2.017 instantes) | < 5 ms | Ídem |

## 8. Pruebas con valores esperados

Todas en `pipeline/tests/test_ephem_*.py`; las de la tabla también en `web/src/core/__tests__/ephemeris.test.ts` con los mismos números.

### 8.1 Núcleos bien cargados

Prueba del propio `.tf` (`03_datos_y_fuentes.md` §2): posición de la Tierra respecto a la Luna en ET = 717768000,0, sin corrección, en `MOON_ME`: (374008,654; −23435,970; 10141,334) km ± 0,001 km.

### 8.2 Base ENU, calculada a mano

| Sitio (lat, lon, h) | Vector Luna → astro `V` (km) | Esperado |
| --- | --- | --- |
| (0°, 0°, 0) | (2737,4; 1000; 0) | v = (1000; 1000; 0); E = (0, 1, 0), N = (0, 0, 1), U = (1, 0, 0) → az = 90°, el = 45°, distancia = 1414,2136 km |
| (0°, 0°, 0) | (1737,4; 0; 1000) | az = 0°, el = 0° |
| (−90°, 0°, 0) | (5000; 0; −1737,4) | U = (0, 0, −1), N = (1, 0, 0), E = (0, 1, 0) → az = 0°, el = 0° |
| (−90°, 0°, 0) | (0; 5000; −1737,4) | az = 90°, el = 0° |
| (−90°, 0°, 0) | (0; 0; −2737,4) | el = 90°, az = 0° (convenio del cénit) |
| (45°, 90°, 0) | p + 100·U, con U = (0; 0,70711; 0,70711) | el = 90° |

Tolerancia: 10⁻⁹ grados y 10⁻⁶ km.

### 8.3 Función de referencia frente a Horizons

Valores de `referencias/horizons/` (observador en la superficie lunar, sin atmósfera). Tolerancia de la referencia `azel_spice`: 0,0005° en acimut y elevación (la cifra de comprobación del plan es menos de 0,000001°; la tolerancia oficial del caso A1 es 0,02°). Tolerancia de la tabla (`sky_at`): 0,001°.

Sol desde 89,9° S, 0° E, altura 2,1 km:

| UTC | Acimut (°) | Elevación (°) | Diámetro (″) | Distancia (km) |
| --- | --- | --- | --- | --- |
| 2025-03-14T00:00:00Z | 6,339542919 | 0,193947532 | 1924,638 | 149117890,75 |
| 2025-03-14T01:00:00Z | 5,833234568 | 0,192796604 | 1924,612 | 149119841,17 |
| 2025-03-14T02:00:00Z | 5,326925599 | 0,191638933 | 1924,588 | 149121765,24 |
| 2025-03-14T03:00:00Z | 4,820615885 | 0,190474541 | 1924,563 | 149123662,97 |
| 2025-03-14T04:00:00Z | 4,314305346 | 0,189303438 | 1924,539 | 149125534,37 |

Tierra desde Blue Ghost 1 (18,56° N, 61,81° E, altura 0):

| UTC | Acimut (°) | Elevación (°) | Diámetro (″) | Distancia (km) |
| --- | --- | --- | --- | --- |
| 2025-03-14T06:00:00Z | 258,649029284 | 28,916719453 | 6568,817 | 400571,6086 |
| 2025-03-16T18:15:00Z | 263,611890974 | 27,158986435 | 6503,297 | 404606,9641 |
| 2028-02-29T12:00:00Z | 255,872011902 | 18,563622326 | 6603,297 | 398480,1087 |

Sol desde Blue Ghost 1 (18,56° N, 61,81° E, altura 0):

| UTC | Acimut (°) | Elevación (°) |
| --- | --- | --- |
| 2025-03-16T18:15:00Z | 269,672560245 | 0,924849952 |
| 2025-03-16T20:10:00Z | 269,983676648 | 0,005209174 |
| 2025-03-16T20:11:00Z | 269,986381754 | −0,002787844 |

Sol desde el sitio previsto de IM-2 (84,78° S, 29,13° E, altura 0):

| UTC | Acimut (°) | Elevación (°) |
| --- | --- | --- |
| 2025-03-04T09:10:00Z | 94,236681669 | −0,003117974 |
| 2025-03-04T09:15:00Z | 94,194517626 | 0,000621366 |
| 2025-03-06T17:30:00Z | 65,736416909 | 2,464349919 |

Tierra desde el sitio de Chang'e 6 (41,6385° S, 153,9852° O, altura 0), en la cara oculta. La consulta se hizo con la longitud este negativa (`SITE_COORD='-153.9852,-41.6385,0'`) y Horizons la devuelve como 206,0148° E:

| UTC | Acimut (°) | Elevación (°) | Diámetro (″) | Distancia (km) |
| --- | --- | --- | --- | --- |
| 2025-03-14T06:00:00Z | 147,526384883 | −43,178481295 | 6535,692 | 402601,6500 |

Estas 15 filas van a `tests/golden/horizons_smoke.csv` (formato en `11_validacion.md` §3) y permiten pasar M1 antes de que A1 entregue el conjunto completo de A1 y A2. Confirman además dos cifras del plan: a las 18:15 UTC el Sol estaba a 0,92° en acimut ~270°, y con Luna lisa el centro se pone a las 20:10:39 UTC (interpolación lineal entre 20:10 y 20:11: 0,005209/(0,005209 + 0,002788) × 60 s = 39 s).

### 8.4 La tabla frente a SPICE (invariante de A9)

Para 2.000 pares (sitio, instante) al azar con semilla fija (latitud uniforme en el seno, longitud uniforme, instantes uniformes en `main` y `apollo`): |az_tabla − az_spkcpo|·cos(el) < 0,001° y |el_tabla − el_spkcpo| < 0,001° para Sol y Tierra. Valor esperado real: del orden de 0,00001°. Además, 200 instantes que caen justo en una hora de la rejilla dan diferencia menor de 0,00003° (D-75; antes 0,00002°, por debajo del término de aberración del §4.1).

### 8.5 `MOON_ME` frente a `MOON_PA` (prueba que justifica la prohibición)

Para cada hora de 2025, elevación del Sol y de la Tierra con la función de referencia en `MOON_ME` y, solo dentro de esta prueba, repitiendo el cálculo con `'MOON_PA'` como marco del sitio y de salida (mismas latitud y longitud numéricas):

| Sitio | Máximo esperado de \|Δ elevación\| (Sol o Tierra) | Tolerancia |
| --- | --- | --- |
| Sitio previsto de IM-2 (84,78° S, 29,13° E) | 0,0227° | ± 0,002° |
| Blue Ghost 1 (18,56° N, 61,81° E) | 0,0156° | ± 0,002° |

Son las cifras medidas del plan. La prueba además exige que el máximo sea mayor de 0,010° en ambos sitios: si alguien «unifica» los marcos, falla.

### 8.6 `IAU_MOON` falla

```
with pytest.raises(spiceypy.utils.exceptions.SpiceyError):
    spiceypy.pxform('IAU_MOON', 'J2000', 0.0)
with pytest.raises(spiceypy.utils.exceptions.SpiceyError):
    spiceypy.spkpos('SUN', 0.0, 'IAU_MOON', 'LT+S', 'MOON')
```

Y una prueba estática: `grep -R "IAU_MOON\|MOON_PA" pipeline/ web/src/` solo encuentra coincidencias en `pipeline/tests/`.

### 8.7 Formato de la tabla

- Tamaño exacto 5.260.176 B; `meta.segments[1].byte_offset == 4418568`.
- La muestra `k = 1` de `main` (2024-01-01T00:00:00Z) coincide con `spkpos` en ese instante con error relativo < 10⁻⁷ por componente.
- Módulos: |sun| entre 1,45·10⁸ y 1,53·10⁸ km; |earth| entre 3,5·10⁵ y 4,1·10⁵ km en todas las muestras.
- La Tierra, vista desde el centro de la Luna, nunca se aleja más de 12° del eje +X de `MOON_ME` (libraciones): para toda muestra, acos(earth_x/|earth|) < 12°.
