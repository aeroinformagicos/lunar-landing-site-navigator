# 03 · Datos y fuentes

Cada conjunto de datos que entra en el proyecto: qué es, de dónde se baja, cuánto ocupa, cómo se lee byte a byte, cómo se pasa de píxel a coordenadas y cómo se comprueba que se ha leído bien. Todos los nombres, tamaños y campos salen de las etiquetas y listados guardados en `referencias/` (se indica el fichero en cada caso).

## 1. Resumen

| Id | Conjunto | Uso | Fichero(s) | Tamaño | Dueño |
| --- | --- | --- | --- | --- | --- |
| K1 | SPK planetario DE440 | Posiciones del Sol, la Tierra y la Luna | `de440.bsp` | 119.799.808 B | I1 |
| K2 | PCK binario lunar DE440 | Orientación de la Luna | `moon_pa_de440_200625.bpc` | 12.863.488 B | I1 |
| K3 | Fichero de marcos lunares | Define `MOON_ME` y `MOON_PA` | `moon_de440_250416.tf` | 19.478 B | I1 |
| K4 | Segundos intercalares | UTC ↔ ET | `naif0012.tls` | 5.257 B | I1 |
| P1 | LOLA polar sur 40 m | Relieve cercano del polo (80°–90° S) | `LDEM_80S_40M.IMG` + `.LBL` | 462.080.000 B | I1 |
| P2 | LOLA polar sur 120 m | Relieve lejano del polo (75°–90° S) | `LDEM_75S_120M.IMG` + `.LBL` | 116.250.752 B | I1 |
| P3 | LOLA polar sur 120 m ampliado | Sitios entre 60° y 75° S y sitios polares que se salen de P2 | `LDEM_60S_120M.IMG` + `.LBL` | 481.740.800 B | I1 |
| S1 | SLDEM2015 512 ppd | Relieve entre 60° S y 60° N, por recortes | 15 teselas `SLDEM2015_512_*_FLOAT.IMG` | 1.415.577.600 B cada una | I1 |
| N1 | Iluminación media NASA 60 m | Validación del mapa (Sol) | `AVGVISIB_85S_060M_201608.IMG` | 51.166.728 B | I1, A1 |
| N2 | Visibilidad media de la Tierra NASA 60 m | Validación del mapa (Tierra) | `AVGVISIB_85S_060M_201608_EARTH.IMG` | 51.166.728 B | I1, A1 |
| N3 | Iluminación media NASA 120 m | Validación fuera de 85° S | `AVGVISIB_75S_120M_201608.IMG` | 116.250.752 B | I1 |
| N4 | Visibilidad de la Tierra NASA 120 m | Validación fuera de 85° S | `AVGVISIB_75S_120M_201608_EARTH.IMG` | 116.250.752 B | I1 |
| N5 | Sombra permanente NASA 60 m | F22 (P2) | `LPSR_85S_060M_201608.IMG` | 51.166.728 B | I1 |
| H1 | JPL Horizons | Solo validación (valores de referencia) | Respuestas de la API en `tests/golden/` | < 1 MB | A1 |
| C1 | Coordenadas de alunizajes | Catálogo | Tabla del NSSDCA | — | A2 |
| C2 | Regiones candidatas | Catálogo y filtro de F32 | Registro del USGS (vía nasanow.org) | — | A2 |
| E1 | Catálogo de eclipses de Luna | Validación B4 | Tabla «Lunar Eclipses: 2021–2030» | — | A1 |

Los tamaños de K1–K4 salen de las cabeceras HTTP `Content-Length` del servidor de NAIF; los de P, S y N, de los listados de directorio guardados en `referencias/listados/`.

## 2. Núcleos SPICE (K1–K4)

| Fichero | URL | Contenido |
| --- | --- | --- |
| `de440.bsp` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp` | Efemérides DE440 (binario DAF/SPK) |
| `moon_pa_de440_200625.bpc` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc` | Orientación lunar en ejes principales (binario DAF/PCK) |
| `moon_de440_250416.tf` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf` | Marcos `MOON_PA` (31000), `MOON_ME` (31001), `MOON_PA_DE440` (31008), `MOON_ME_DE440_ME421` (31009) |
| `naif0012.tls` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls` | Último segundo intercalar: 37 s desde 2017-01-01 |

Reglas:

- Se cargan **solo** estos cuatro, en este orden: `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, desde `data/kernels/`.
- **No se carga ningún PCK de texto** (`pck00011.tpc` existe en el mismo servidor pero no se usa): así `IAU_MOON` no se puede evaluar y cualquier uso accidental da error (prueba en `11_validacion.md` §5).
- Datos que el `.tf` fija y el código no debe reescribir: `MOON_ME` es alias de `MOON_ME_DE440_ME421`, definido respecto a `MOON_PA_DE440` con `TKFRAME_31009_ANGLES = (67.8526, 78.6944, 0.2785)` segundos de arco y `TKFRAME_31009_AXES = (3, 2, 1)`.
- Cobertura: 1550–2650 (comprobada por el equipo según el plan). La especificación usa 1968-12-31 a 2045-01-01.
- Comprobación de lectura: tamaño exacto de cada fichero (tabla del §1) y la prueba numérica del propio `.tf`: en `2022 SEP 30 TDB` (ET = 717768000,0), el estado geométrico de la Tierra respecto a la Luna en `MOON_ME` es posición (374008,654; −23435,970; 10141,334) km, y en `MOON_PA` (373997,028; −23558,987; 10284,057) km. Llamada: `spkezr('EARTH', 717768000.0, 'MOON_ME', 'NONE', 'MOON')`. Tolerancia 0,001 km. Es la primera prueba de T-04.
- Cita: Park, R. S., et al. (2021), «The JPL Planetary and Lunar Ephemerides DE440 and DE441», *The Astronomical Journal* 161:105 (referencia [1] del propio `.tf`). Núcleos genéricos de NAIF/JPL, de uso público.

## 3. Convenio de píxeles común a todos los ráster

- Los ficheros `.IMG` son matrices binarias **sin cabecera** (`RECORD_TYPE = FIXED_LENGTH`, `^IMAGE` apunta al propio fichero), en orden de filas: la primera fila del fichero es la superior de la imagen. Bytes por fila = `RECORD_BYTES`; número de filas = `FILE_RECORDS = LINES`.
- Índices en base 0: columna `s` ∈ [0, `LINE_SAMPLES`−1] y fila `l` ∈ [0, `LINES`−1]. El valor del fichero en la posición de byte `(l · LINE_SAMPLES + s) · (SAMPLE_BITS/8)` corresponde al **centro** de ese píxel.
- Con índices en base 0, los valores de las etiquetas cumplen `x = (s − SAMPLE_PROJECTION_OFFSET) · MAP_SCALE` e `y = (LINE_PROJECTION_OFFSET − l) · MAP_SCALE` en las polares, y `lon = CENTER_LONGITUDE + (s − SAMPLE_PROJECTION_OFFSET)/MAP_RESOLUTION`, `lat = (LINE_PROJECTION_OFFSET − l)/MAP_RESOLUTION` en las cilíndricas. Comprobado con las etiquetas: en `SLDEM2015_512_00N_30N_045_090` el píxel `s = 0` da 180 + (0 − 69119,5)/512 = 45,00098° = 45° + medio píxel, y `l = 0` da 15359,5/512 = 29,99902°.
- Tipos: `PC_REAL` de 32 bits = `float32` little-endian (`<f4`); `LSB_INTEGER` de 16 bits = `int16` little-endian (`<i2`).
- Valor físico: `valor = DN · SCALING_FACTOR + OFFSET_fisico`. En los DEM, la **altura** sobre la esfera es `DN · SCALING_FACTOR` (el `OFFSET` de la etiqueta es el radio de la esfera y solo se suma si se quiere el radio planetario).
- Interpolación: bilineal entre los cuatro centros de píxel vecinos (§3.3). Nunca vecino más próximo, salvo en las pruebas de «píxel conocido».

### 3.1 Estereográfica polar sur (P1, P2, P3, N1–N5)

Definición en `referencias/etiquetas/DSMAP_POLAR.CAT`: proyección esférica con R = 1.737.400 m, centrada en el polo sur, escala exacta en el polo, `MAP_SCALE` exacto en metros por píxel; «in the south, Longitude 0 extends straight up from the center, and Longitude 90 East extends to the right».

Sean N = `LINES` = `LINE_SAMPLES` (imágenes cuadradas), S = `MAP_SCALE` en metros, R = 1.737.400 m.

**De píxel a latitud y longitud** (fórmula del catálogo, pasada a base 0):

```
x = (s − N/2 + 0.5) · S            # metros, positivo hacia la derecha (90° E)
y = (N/2 − 0.5 − l) · S            # metros, positivo hacia arriba (0° E)
r = sqrt(x² + y²)
lat_deg = −90 + (180/π) · 2 · atan(r / (2R))
lon_deg = (180/π) · atan2(x, y)    # en (−180, 180]; en el polo exacto (r = 0), lon = 0
```

**De latitud y longitud a píxel** (inversa exacta de la anterior):

```
c   = (90 + lat_deg) · π/180                 # colatitud desde el polo sur, rad
r   = 2R · tan(c/2)
x   = r · sin(lon_deg · π/180)
y   = r · cos(lon_deg · π/180)
s   = x/S + N/2 − 0.5                         # columna fraccionaria
l   = N/2 − 0.5 − y/S                         # fila fraccionaria
```

**De vector unitario en MOON_ME a mapa** (sin trigonometría; es la forma que usa el motor de horizonte). Para û = (X, Y, Z) con |û| = 1:

```
x = 2R · Y / (1 − Z)
y = 2R · X / (1 − Z)
```

Deducción: X = cos φ cos λ, Y = cos φ sin λ, Z = sin φ; tan(c/2) = sin c/(1 + cos c) = cos φ/(1 − sin φ) = √(X²+Y²)/(1 − Z); x = r sin λ, y = r cos λ. Válida para Z < 1 (todo menos el polo norte).

Aviso sobre la fuente: el párrafo de la transformación inversa de `DSMAP_POLAR.CAT` introduce un factor `SIGN(LAT)` en R que, aplicado al sur, daría X negativo para longitud 90° E, en contradicción con la fórmula directa y con el texto del propio fichero. Aquí se usa la fórmula directa y su inversa exacta. La prueba de orientación del §4.4 lo confirma con datos (ver también `90_dudas_y_riesgos.md`).

Factor de escala local: k = 1/cos²(c/2). A 85° S, k = 1,0019; a 75° S, 1,0173; a 60° S, 1,0718. Un píxel de 40 m nominales mide 39,92 m en el terreno a 85° S. El motor no lo necesita porque trabaja con vectores unitarios.

Cobertura de un producto cuadrado de N píxeles y escala S: medio lado = N·S/2. En los ejes llega a la colatitud 2·atan(N·S/(4R)); en las esquinas, a 2·atan(√2·N·S/(4R)).

| Producto | N | S (m) | Medio lado (km) | Latitud en los ejes | Latitud en las esquinas |
| --- | --- | --- | --- | --- | --- |
| P1 `LDEM_80S_40M` | 15.200 | 40 | 304,00 | −80,00° | −75,89° |
| P2 `LDEM_75S_120M` | 7.624 | 120 | 457,44 | −75,00° | −68,9° |
| P3 `LDEM_60S_120M` | 15.520 | 120 | 931,20 | −60,00° | −48,49° |
| N1, N2, N5 (60 m) | 5.058 | 60 | 151,74 | −85,00° | −82,9° |
| N3, N4 (120 m) | 7.624 | 120 | 457,44 | −75,00° | −68,9° |

Las esquinas contienen datos válidos: el catálogo dice que el mapa de 60° «will extend to latitude 48.48755 degrees at the corners».

### 3.2 Cilíndrica simple (S1)

Sean `ppd` = `MAP_RESOLUTION` = 512, `LATMAX` = `MAXIMUM_LATITUDE` y `LONW` = `WESTERNMOST_LONGITUDE` de la tesela (en grados, 0–360).

```
lon360 = LONW + (s + 0.5)/ppd            # grados este, 0–360
lat    = LATMAX − (l + 0.5)/ppd          # grados
s      = (lon360 − LONW) · ppd − 0.5
l      = (LATMAX − lat) · ppd − 0.5
```

Antes de aplicar la inversa, `lon360 = wrap360(lon_deg)`. Un píxel mide 1/512° = 0,0019531250° (dato de la etiqueta) = 59,2253 m en el ecuador (`MAP_SCALE = 0.0592252938 km/pix`) y 59,2253·cos(lat) m en el sentido este–oeste.

### 3.3 Interpolación bilineal

```
function bilinear(A, s, l):            # A[l][s], s y l fraccionarios en base 0
    s0 = floor(s); l0 = floor(l)
    if s0 < 0 or l0 < 0 or s0 + 1 > ncols − 1 or l0 + 1 > nrows − 1: return NODATA
    fs = s − s0; fl = l − l0
    v = (1−fl)·((1−fs)·A[l0][s0] + fs·A[l0][s0+1]) + fl·((1−fs)·A[l0+1][s0] + fs·A[l0+1][s0+1])
    if alguno de los cuatro valores es inválido: return NODATA
    return v
```

Un valor es **inválido** si no es finito o si la altura queda fuera de [−20.000, +20.000] m (los extremos reales de las etiquetas son −9.129 m y +10.783 m). Ninguna de las etiquetas descargadas declara `MISSING_CONSTANT`; el filtro es una defensa. Tratamiento de `NODATA` en el motor: `06_horizonte.md` §6.

### 3.4 De latitud, longitud y altura a XYZ en MOON_ME, e inversa

```
r = R + h                       # km, con h en km
X = r · cos(lat) · cos(lon)
Y = r · cos(lat) · sin(lon)
Z = r · sin(lat)

r   = sqrt(X² + Y² + Z²)
lat = atan2(Z, sqrt(X² + Y²))
lon = atan2(Y, X)               # (−180°, 180°]
h   = r − R
```

Comprobación a mano: Blue Ghost 1 (18,56° N, 61,81° E, h = 0): X = 1737,4·cos 18,56°·cos 61,81° = 1737,4 · 0,947991 · 0,472397 = 778,06 km; Y = 1737,4 · 0,947991 · 0,881385 = 1451,68 km; Z = 1737,4 · 0,318298 = 553,01 km. Horizons da para ese sitio `Dxy = 1647,03931 km, Dz = 553,01019 km` (`referencias/horizons/respuesta_prueba_tierra_blueghost_tlist.txt`): √(778,06² + 1451,68²) = 1647,04 km ✓.

## 4. DEM polares de LOLA (P1, P2, P3)

Directorio: `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/`. Conjunto PDS `LRO-L-LOLA-4-GDR-V1.0`. Etiquetas en `referencias/etiquetas/`.

El relieve cercano del polo es `LDEM_80S_40M` (decisión D-04): con ±304 km cubre a 40 m toda la malla del mapa y las nueve regiones candidatas. `LDEM_85S_40M` (±151,68 km), que era la opción inicial del plan, dejaba tres regiones con relieve cercano de 120 m (`90_dudas_y_riesgos.md`, E-02).

### 4.1 Campos de las etiquetas

| Campo | P1 `LDEM_80S_40M.IMG` | P2 `LDEM_75S_120M.IMG` | P3 `LDEM_60S_120M.IMG` |
| --- | --- | --- | --- |
| URL | `…/POLAR/IMG/LDEM_80S_40M.IMG` | `…/POLAR/IMG/LDEM_75S_120M.IMG` | `…/POLAR/IMG/LDEM_60S_120M.IMG` |
| Tamaño (B) | 462.080.000 | 116.250.752 | 481.740.800 |
| `PRODUCT_VERSION_ID` | V2.0 | V2.0 | V2.0 |
| `LINES` = `LINE_SAMPLES` | 15.200 | 7.624 | 15.520 |
| `RECORD_BYTES` | 30.400 | 15.248 | 31.040 |
| `SAMPLE_TYPE`, `SAMPLE_BITS` | `LSB_INTEGER`, 16 | `LSB_INTEGER`, 16 | `LSB_INTEGER`, 16 |
| `UNIT` | `METER` | `METER` | `METER` |
| `SCALING_FACTOR` | 0,5 | 0,5 | 0,5 |
| `OFFSET` (radio de la esfera) | 1737400. (m) | 1737400. (m) | 1737400. (m) |
| `DERIVED_MINIMUM` / `MAXIMUM` | −14593 / 14054 DN (−7.296,5 / +7.027,0 m) | −15526 / 14050 DN (−7.763,0 / +7.025,0 m) | −18255 / 14050 DN (−9.127,5 / +7.025,0 m) |
| `MAP_SCALE` | 40 m/px | 120 m/px | 120 m/px |
| `MAP_RESOLUTION` | 758,084 px/° | 252,695 px/° | 252,695 px/° |
| `LINE_PROJECTION_OFFSET` = `SAMPLE_PROJECTION_OFFSET` | 7599,5 | 3811,5 | 7759,5 |
| `CENTER_LATITUDE`, `CENTER_LONGITUDE` | −90, 0 | −90, 0 | −90, 0 |
| `MINIMUM_LATITUDE` … `MAXIMUM_LATITUDE` | −90 … −80 | −90 … −75 | −90 … −60 |
| `COORDINATE_SYSTEM_NAME` | MEAN EARTH/POLAR AXIS OF DE421 | ídem | ídem |
| `STOP_TIME` de los datos | 2017-02-02 | 2017-02-02 | 2017-02-02 |

Comprobación de tamaño: 15.200² × 2 = 462.080.000 ✓; 7.624² × 2 = 116.250.752 ✓; 15.520² × 2 = 481.740.800 ✓.

### 4.2 Lectura

```
P1: A = memmap(file, dtype='<i2', shape=(15200, 15200)); height_m = A · 0.5
P2: A = memmap(file, dtype='<i2', shape=(7624, 7624));   height_m = A · 0.5
P3: A = memmap(file, dtype='<i2', shape=(15520, 15520)); height_m = A · 0.5
```

El lector genérico `read_pds_image(lbl_path)` saca de la etiqueta `LINES`, `LINE_SAMPLES`, `SAMPLE_TYPE`, `SAMPLE_BITS`, `UNIT`, `SCALING_FACTOR`, `MAP_SCALE`, `MAP_PROJECTION_TYPE`, `MAXIMUM_LATITUDE`, `WESTERNMOST_LONGITUDE`, `MAP_RESOLUTION` y el nombre del `.IMG`, y devuelve un objeto `Grid` (§7). Análisis de la etiqueta: líneas `CLAVE = VALOR`; se quitan comillas y la unidad entre `<…>`; solo se leen las claves citadas; las claves repetidas dentro de `OBJECT = IMAGE` y `OBJECT = IMAGE_MAP_PROJECTION` no chocan entre sí. Si `UNIT = KILOMETER` se multiplica por 1000; si `UNIT = METER`, por 1; después por `SCALING_FACTOR`.

Memoria: P1 y P2 se cargan enteros como `int16` (462 + 116 MB). En GPU se mantienen en `int16` y la conversión a metros en `float32` se hace después de leer los cuatro vecinos de cada muestra. P3 se abre con `memmap` y solo se lee la ventana del sitio.

### 4.3 Comprobaciones de lectura (prueba `test_dem_read`, lenta, marcada `data`)

1. Tamaño del fichero igual al de la tabla.
2. Mínimo y máximo de toda la matriz iguales a `DERIVED_MINIMUM` y `DERIVED_MAXIMUM` de la etiqueta (DN exactos en los tres productos).
3. Coherencia entre productos: en 1.000 puntos al azar con |x|, |y| < 150 km, |P1 − P2| tiene mediana < 5 m (son el mismo conjunto de datos LOLA a distinta resolución; el umbral es holgado a propósito). Si falla, la proyección de uno de los dos está mal leída.
4. Orientación (§4.4).

### 4.4 Prueba de orientación con un rasgo conocido

El cráter Shackleton tiene centro en −89,67°, 129,78° E y 20,92 km de diámetro (Gazetteer of Planetary Nomenclature, ficha 5450). Con las fórmulas del §3.1: c = 0,33°, r = 2·1737,4·tan(0,165°) = 10,007 km, x = r·sin 129,78° = +7,690 km, y = r·cos 129,78° = −6,403 km. En P1: s = 7690/40 + 7599,5 = 7791,75; l = 7599,5 + 6403/40 = 7759,58.

Dato publicado: Zuber et al. (2012, *Nature* 486, 378–381) dan para Shackleton un diámetro medio del borde de 21 km y una profundidad media del borde al fondo de 4,1 ± 0,05 km, con el interior en sombra permanente.

- Esperado 1 (profundidad): la cota máxima de P1 a menos de 12 km del centro (el borde) menos la cota interpolada en el centro está entre 3.500 y 4.700 m.
- Esperado 2 (orientación): la cota en el centro es al menos 2.000 m más baja que la del punto espejo (−89,67°, −129,78°), que cae fuera del cráter. Si el punto profundo aparece en el espejo, el eje x está invertido.
- Los valores leídos se anotan en `docs/constants.md` al ejecutar T-07.

### 4.5 Licencia y cita

Datos del PDS (NASA), conjunto `LRO-L-LOLA-4-GDR-V1.0`, productor «LRO LOLA TEAM», Goddard Space Flight Center; servidos por el nodo de datos de LOLA en el MIT (`imbrium.mit.edu`). Datos públicos de la NASA. Texto exacto de la cita recomendada: PENDIENTE DE VERIFICAR (A2). En `SOURCES.md` se citan el identificador del conjunto, el nombre de cada producto y su versión.

## 5. SLDEM2015 (S1)

Directorio: `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/`. Modelo de LOLA corregistrado con la cámara de terreno de Kaguya; latitudes entre 60° S y 60° N; 512 ppd; 32 teselas de 30° × 45°. Etiquetas en `referencias/etiquetas/sldem2015/`.

### 5.1 Campos comunes de las etiquetas

| Campo | Valor |
| --- | --- |
| Nombre | `SLDEM2015_512_<lat1>_<lat2>_<lon1>_<lon2>_FLOAT.IMG`; bandas de latitud `60S_30S`, `30S_00S`, `00N_30N`, `30N_60N`; columnas de longitud `000_045`, `045_090`, …, `315_360` |
| Tamaño | 1.415.577.600 B (15.360 × 23.040 × 4) |
| `LINES`, `LINE_SAMPLES` | 15.360, 23.040 |
| `RECORD_BYTES` | 92.160 |
| `SAMPLE_TYPE`, `SAMPLE_BITS`, `UNIT` | `PC_REAL`, 32, `KILOMETER` |
| `SCALING_FACTOR`, `OFFSET` | 1; 1737,4 km |
| `MAP_PROJECTION_TYPE` | `SIMPLE CYLINDRICAL` |
| `MAP_RESOLUTION` | 512 px/° |
| `MAP_SCALE` | 0,0592252938 km/px |
| `CENTER_LATITUDE`, `CENTER_LONGITUDE` | 0, 180 |
| `COORDINATE_SYSTEM_NAME` | MEAN EARTH/POLAR AXIS OF DE421 |
| `PRODUCT_VERSION_ID` | V2.0 |

Lectura: `memmap(file, dtype='<f4', shape=(15360, 23040))`, altura en m = valor × 1000.

### 5.2 Teselas que necesita el catálogo

Para un sitio de latitud φ y longitud λ, la ventana de ±300 km es: latitudes φ ± 10,0°; longitudes λ ± Δλ con Δλ = asin(sin δ / cos φ) + 0,1°, δ = 300/1737,4 rad = 9,893°. Son 15 teselas distintas (21,2 GB si se bajaran enteras; con descarga por filas, menos de la mitad):

| Tesela (`SLDEM2015_512_…_FLOAT`) | `MINIMUM` / `MAXIMUM` (km) | Sitios que la usan |
| --- | --- | --- |
| `00N_30N_045_090` | −5,567 / 3,360 | Blue Ghost 1, Luna 16, Luna 20, Luna 24 |
| `30S_00S_045_090` | −5,887 / 3,300 | Luna 16, Luna 20 |
| `00N_30N_000_045` | −4,899 / 3,466 | Apollo 11, 15, 16, 17, Surveyor 5, Surveyor 6, Luna 21 |
| `30S_00S_000_045` | −4,944 / 4,832 | Apollo 11, Apollo 16, Surveyor 5, Surveyor 6, SLIM |
| `00N_30N_315_360` | −4,818 / 3,274 | Apollo 12, 14, 15, Surveyor 1, 3, 6, Luna 17 |
| `30S_00S_315_360` | −5,043 / 2,399 | Apollo 12, 14, Surveyor 1, 3, 6 |
| `30N_60N_000_045` | −6,599 / 3,626 | Apollo 15, Apollo 17, Luna 21 |
| `30N_60N_315_360` | −5,092 / 1,159 | Apollo 15, Luna 17, Chang'e 3, Chang'e 5 |
| `00N_30N_270_315` | −5,917 / 3,720 | Luna 9, Luna 13, Surveyor 1, Luna 17 |
| `30S_00S_270_315` | −4,168 / 4,797 | Luna 9, Surveyor 1 |
| `30N_60N_270_315` | −5,292 / 2,114 | Luna 17, Chang'e 5 |
| `60S_30S_315_360` | −6,111 / 2,426 | Surveyor 7 |
| `60S_30S_000_045` | −5,286 / 4,448 | Surveyor 7 |
| `60S_30S_135_180` | −7,910 / 5,679 | Chang'e 4 |
| `60S_30S_180_225` | −8,719 / 6,541 | Chang'e 4, Chang'e 6 |

El reparto por sitio, con sus coordenadas, está en `04_catalogo_sitios.md`.

### 5.3 Recorte por sitio

El motor trabaja con un recorte por sitio. El recorte se construye a partir de la tesela completa si está en `data/raw/sldem2015/` con su tamaño exacto; si no está, se descargan solo las filas necesarias. La tesela no hace falta para nada más: una vez hechos los recortes que la usan, se puede borrar.

```
function build_crop(site):
    lat_n = min(site.lat + 10.0, 60.0);  lat_s = max(site.lat − 10.0, −60.0)
    dlon  = degrees(asin(sin(9.893°) / cos(site.lat))) + 0.1
    # Alineación con la rejilla global de 512 ppd (bordes de píxel en múltiplos de 1/512°):
    lat_max = ceil(lat_n · 512) / 512;   lat_min = floor(lat_s · 512) / 512
    lon_w   = floor(wrap360(site.lon − dlon) · 512) / 512                  # en [0, 360)
    nrows = round((lat_max − lat_min) · 512);   ncols = ceil(2 · dlon · 512) + 1
    crop  = array int16 [nrows][ncols]
    # fila r del recorte = latitud lat_max − (r + 0.5)/512; columna c = longitud wrap360(lon_w + (c + 0.5)/512)
    for cada tesela T que corta la ventana (hasta 4: 2 bandas × 2 columnas):
        l0 = max(0, (LATMAX_T − lat_max)·512);  l1 = min(15359, (LATMAX_T − lat_min)·512 − 1)   # enteros exactos
        local = data/raw/sldem2015/<nombre de T>.IMG
        if existe local y su tamaño es 1.415.577.600 B:
            filas = memmap(local, '<f4', (15360, 23040))[l0 : l1 + 1]         # sin red
        else:
            filas = descargar bytes [l0·92160, (l1+1)·92160 − 1] de T con cabecera Range   # filas completas
        tomar las columnas de T dentro de la ventana (con paso por 0°/360° si hace falta)
        crop[...] = round(valor_km · 2000)                    # int16, 0,5 m por unidad
    escribir data/crops/<site_id>.i16  y  data/crops/<site_id>.json
```

Si la tesela local existe pero su tamaño no es el esperado, no se usa: se avisa con `Local tile <name> is incomplete (<m> of 1415577600 bytes); resume its download or delete it.` y se recurre a la descarga por filas.

`data/crops/<site_id>.json`: `{"site_id", "lat_max_deg", "lon_west_deg360", "ppd": 512, "nrows", "ncols", "scaling_m": 0.5, "source_tiles": [...], "sha256"}`, con `lat_max_deg = lat_max` y `lon_west_deg360 = lon_w` alineados (múltiplos exactos de 1/512°). El recorte se lee como una rejilla cilíndrica con `LATMAX = lat_max_deg`, `LONW = lon_west_deg360` y `s = wrap360(lon − LONW)·512 − 0.5`. Como los bordes del recorte coinciden con bordes de píxel de las teselas, cada valor del recorte es exactamente un valor de una tesela (sin remuestreo) y la fila `r` del recorte es la fila `l = (LATMAX_T − lat_max)·512 + r` de la tesela T que la contiene (entero exacto). Prueba en T-07: para Blue Ghost 1, `lat_max_deg · 512` y `lon_west_deg360 · 512` son enteros y el valor del recorte en (r, c) = (0, 0) es el de la tesela en la fila y columna calculadas así.

Tamaño de un recorte: unas 10.240 filas × 10.300–14.600 columnas × 2 B = 210–300 MB. Los 24 sitios con `relief = sldem2015` (`04_catalogo_sitios.md` §2), ~6 GB.

### 5.4 Comprobaciones de lectura

1. El número de bytes leídos de cada tesela (del fichero local o de la petición por rango) es (l1 − l0 + 1) × 92.160; el recorte hecho desde la tesela local y el hecho por rango son idénticos byte a byte.
2. Mínimo y máximo del recorte dentro de [`MINIMUM`, `MAXIMUM`] de las teselas de origen.
3. Continuidad en la costura entre teselas: la diferencia media entre la última fila (o columna) de una y la primera de la otra es menor de 20 m.
4. Cota conocida: la altura interpolada en el sitio de SLIM (−13,3160°, 25,2510°) frente a la cota que publica LROC para el aterrizador: «The SLIM lander on the lunar surface (13.3160°S, 25.2510°E, -912 m elevation)» (LROC, «JAXA SLIM Landing»). Tolerancia 50 m (el recorte tiene píxeles de 59 m y el sitio está en una ladera). Si la diferencia es mayor, se revisa la lectura antes de seguir.
5. Para A3, el recorte de Blue Ghost 1 se abre además en QGIS (A2) como comprobación visual.

### 5.5 Licencia y cita

Barker, M. K., Mazarico, E., Neumann, G. A., Zuber, M. T., Haruyama, J., Smith, D. E., «A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera», *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039 (cita de la página 54 del PGDA). Resolución horizontal efectiva de los datos de la cámara: «about 60 – 100 m».

## 6. Productos de iluminación de la NASA (N1–N5)

Directorio: `https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/`. Etiquetas en `referencias/etiquetas/illumination/`. Solo se usan para validar (A7, B7) y, N5, para F22.

| Campo | N1 `AVGVISIB_85S_060M_201608` | N2 `…_EARTH` | N3 `AVGVISIB_75S_120M_201608` | N4 `…_EARTH` | N5 `LPSR_85S_060M_201608` |
| --- | --- | --- | --- | --- | --- |
| Tamaño (B) | 51.166.728 | 51.166.728 | 116.250.752 | 116.250.752 | 51.166.728 |
| `LINES` = `LINE_SAMPLES` | 5.058 | 5.058 | 7.624 | 7.624 | 5.058 |
| Tipo | `LSB_INTEGER` 16 | ídem | ídem | ídem | ídem |
| `SCALING_FACTOR`, `OFFSET` | 0,00004; 0,0 | 0,00004; 0,0 | 0,00004; 0,0 | 0,00004; 0,0 | 0,000025; 0,5 |
| Valor físico | DN·0,00004 ∈ [0, 1] | ídem | ídem | ídem | DN·0,000025 + 0,5 ∈ {0, 1} |
| `DERIVED_MINIMUM` / `MAXIMUM` (DN) | 0 / 22111 | 0 / 25000 | 0 / 22397 | 0 / 25000 | −20000 / 20000 |
| `MAP_SCALE` | 60 m/px | 60 m/px | 120 m/px | 120 m/px | 60 m/px |
| `*_PROJECTION_OFFSET` | 2528,5 | 2528,5 | 3811,5 | 3811,5 | 2528,5 |
| DEM de origen (etiqueta) | `LDEM_85S_060M` | `LDEM_85S_060M` | `LDEM_75S_120M` | `LDEM_75S_120M` | LOLA |

Lo que dicen las etiquetas y la página del PGDA, y que condiciona la comparación (`08_mapa_polar.md` §8):

- El valor es la fracción de pasos de tiempo en que el píxel estuvo iluminado «by any fraction of the solar disc» (N1, N3) o «of the Earth disc» (N2, N4). **No** es el criterio del centro.
- Cálculo con pasos de una hora a lo largo de un ciclo de 18,6 años (PGDA, producto 69), método de Mazarico et al. (2011). La altura del observador no se indica: se toma como superficie (0 m).
- La etiqueta de N2 trae `MINIMUM_LATITUDE = 90`: es una errata de la etiqueta; la proyección es la misma que N1.
- El `README_ILLUMINATION_2016.TXT` avisa de artefactos lineales heredados de los DEM y de que son productos «EXTRAS», sin soporte del PDS.
- Proyección y lectura: §3.1 con N = 5.058, S = 60 (o N = 7.624, S = 120); `memmap('<i2')`; fracción = DN × 0,00004.

Comprobaciones de lectura: tamaño; mínimo y máximo de DN iguales a los de la etiqueta; en N5 solo aparecen los valores −20000 y +20000; el píxel del centro de Shackleton (§4.4, con N = 5.058 y S = 60: s = 7690/60 + 2528,5 = 2656,67; l = 2528,5 + 6403/60 = 2635,22) vale 0 en N1 (sombra permanente) y +20000 en N5.

Cita: Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), «Illumination conditions of the lunar polar regions using LOLA topography», *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030 (la página del PGDA pide citarlo).

## 7. Interfaz común de lectura: `Grid` y `DemStack`

```
class Grid:
    kind: 'polar_south' | 'cylindrical'
    name: str                         # p. ej. 'LDEM_80S_40M'
    res_m: float                      # 40, 120 o 59.2253
    data: array                       # memmap o tensor; unidades crudas
    to_m: float                       # factor a metros (1000, 0.5…)
    # polar: N, S;  cilíndrica: LATMAX, LONW, ppd, nrows, ncols
    pixel_of_unit(u[...,3]) -> (s, l)       # §3.1 o §3.2, vectorizado
    pixel_of_latlon(lat, lon) -> (s, l)
    height_m(u[...,3]) -> h, valid          # bilineal §3.3; valid = False fuera o inválido

class DemStack:
    grids: [Grid]                     # por orden de prioridad
    label: str                        # texto que verá el usuario
    height_m(u) -> h, valid, grid_index     # primer Grid que da valid = True
```

Pilas definidas (el código las elige por el campo `relief` del sitio en `sites.json`):

| `relief` | Pila (orden de prioridad) | `label` exacto | Se aplica a |
| --- | --- | --- | --- |
| `lola_polar` | P1, P2 y, solo si max(|x|, |y|) del sitio + 300 km > 457,44 km, también P3 | `LOLA polar 40 m + 120 m` si el sitio cae dentro de P1; si no, `LOLA polar 120 m` | Sitios con latitud ≤ −75° y toda la malla del mapa (la malla no carga P3) |
| `lola_60s` | P3 | `LOLA 120 m` | Sitios con −75° < latitud ≤ −60° |
| `sldem2015` | Recorte del sitio | `SLDEM2015 59 m` | Sitios con \|latitud\| < 60° y recorte disponible |
| `smooth` | Ninguna | `Smooth Moon (no terrain)` | Todo lo demás; la interfaz lo rotula en rojo |

Los textos de `label` son los únicos permitidos (plan: «Cada resultado lleva una etiqueta con el relieve usado»).

## 8. JPL Horizons (H1)

Solo validación. Sintaxis fijada con las respuestas de prueba de `referencias/horizons/`; consultas completas y formato de `tests/golden/` en `11_validacion.md` §2.

- Punto de acceso: `GET https://ssd.jpl.nasa.gov/api/horizons.api`.
- Observador en la superficie lunar: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<lon_este_grados>,<lat_grados>,<altura_km>'`. La cabecera de la respuesta lo confirma: `Center geodetic : 0.0, -89.9, 2.1 {E-lon(deg),Lat(deg),Alt(km)}`, `Center pole/equ : MEAN_ME (high precision)`, `Center radii : 1737.4, 1737.4, 1737.4 km`.
- Objetivos: Sol `COMMAND='10'`, Tierra `COMMAND='399'`.
- Magnitudes: `QUANTITIES='4,13,20'` = acimut y elevación aparentes sin atmósfera, diámetro angular y distancia.
- Acimut: «measured clockwise from north: North(0) -> East(90) -> South(180) -> West(270)». Elevación: respecto al plano perpendicular a la vertical local.
- Horizons usa DE441 (`{source: DE441}`), corrige tiempo de luz, aberración estelar y deflexión gravitatoria de la luz, y marca con `*` cuando el **borde superior** del Sol está sobre el horizonte liso («solar upper-limb on or above apparent horizon»): no es nuestro criterio del centro.
- Versión de la API observada en la respuesta: `API VERSION: 1.2`. El script comprueba ese campo y avisa si cambia.

## 9. Otros datos

- **C1, coordenadas de alunizajes:** «Table of Anthropogenic Impacts and Spacecraft on the Moon» del NSSDCA (`https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html`), con coordenadas en el sistema Mean Earth/Polar Axis de DE421 tomadas de imágenes de LROC (nota «d» de la tabla). Copia en `referencias/sitios/`.
- **C2, regiones candidatas:** lista oficial en la nota de la NASA del 28 de octubre de 2024 y en el resumen 1901 de la 57.ª LPSC (2026); centros y tamaños aproximados en `https://www.nasanow.org/artemis`, que cita el registro del USGS `https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8`. El registro no se pudo leer de forma automática: PENDIENTE DE VERIFICAR (A2).
- **E1, eclipses:** «Lunar Eclipses: 2021 – 2030», F. Espenak, `https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html`. Tabla transcrita en `11_validacion.md` (caso B4).

## 10. Lista de ficheros de datos

Todos los ficheros de entrada del proyecto, en orden de prioridad. La lista sirve igual para bajarlos a mano (navegador o `curl`) que con `ops/fetch_data.py` (§11), que lee esta misma lista de `ops/data_manifest.json`. Un fichero que está en su carpeta con el tamaño exacto se da por bueno, venga de donde venga; el script lo salta.

### 10.1 Ficheros, en orden de prioridad

URL = prefijo + ruta. Prefijos:

| Prefijo | URL base |
| --- | --- |
| `NAIF` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels` |
| `LOLA` | `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG` |
| `SLDEM` | `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG` |
| `ILLUM` | `https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG` |

Cada fichero `.IMG` va acompañado de su etiqueta `.LBL`, con la misma URL cambiando la extensión y en la misma carpeta; la columna «`.LBL` (B)» da su tamaño.

| N.º | Grupo | Fichero | URL | Bytes | `.LBL` (B) | Carpeta de destino | Lo necesita |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | G0 | `naif0012.tls` | `NAIF/lsk/naif0012.tls` | 5.257 | — | `data/kernels/` | Efemérides (M1) |
| 2 | G0 | `de440.bsp` | `NAIF/spk/planets/de440.bsp` | 119.799.808 | — | `data/kernels/` | Efemérides (M1) |
| 3 | G0 | `moon_pa_de440_200625.bpc` | `NAIF/pck/moon_pa_de440_200625.bpc` | 12.863.488 | — | `data/kernels/` | Efemérides (M1) |
| 4 | G0 | `moon_de440_250416.tf` | `NAIF/fk/satellites/moon_de440_250416.tf` | 19.478 | — | `data/kernels/` | Efemérides (M1) |
| 5 | G1 | `LDEM_80S_40M.IMG` | `LOLA/LDEM_80S_40M.IMG` | 462.080.000 | 4.991 | `data/raw/lola/` | Sitios polares, cubo (M2) |
| 6 | G1 | `LDEM_75S_120M.IMG` | `LOLA/LDEM_75S_120M.IMG` | 116.250.752 | 4.991 | `data/raw/lola/` | Sitios polares, cubo (M2) |
| 7 | G2 | `SLDEM2015_512_00N_30N_045_090_FLOAT.IMG` | `SLDEM/SLDEM2015_512_00N_30N_045_090_FLOAT.IMG` | 1.415.577.600 | 4.693 | `data/raw/sldem2015/` | Blue Ghost 1 (A3); Luna 16, 20, 24 |
| 8 | G3 | `AVGVISIB_85S_060M_201608.IMG` | `ILLUM/AVGVISIB_85S_060M_201608.IMG` | 51.166.728 | 4.094 | `data/raw/nasa_illum/` | A7, B7 |
| 9 | G3 | `AVGVISIB_85S_060M_201608_EARTH.IMG` | `ILLUM/AVGVISIB_85S_060M_201608_EARTH.IMG` | 51.166.728 | 4.111 | `data/raw/nasa_illum/` | A7, B7 |
| 10 | G4 | `SLDEM2015_512_00N_30N_000_045_FLOAT.IMG` | `SLDEM/SLDEM2015_512_00N_30N_000_045_FLOAT.IMG` | 1.415.577.600 | 4.692 | `data/raw/sldem2015/` | Apollo 11, 15, 16, 17; Surveyor 5, 6; Luna 21 |
| 11 | G4 | `SLDEM2015_512_30S_00S_000_045_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30S_00S_000_045_FLOAT.IMG` | 1.415.577.600 | 4.690 | `data/raw/sldem2015/` | Apollo 11, 16; Surveyor 5, 6; SLIM |
| 12 | G4 | `SLDEM2015_512_30N_60N_000_045_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30N_60N_000_045_FLOAT.IMG` | 1.415.577.600 | 4.693 | `data/raw/sldem2015/` | Apollo 15, 17; Luna 21 |
| 13 | G4 | `SLDEM2015_512_60S_30S_135_180_FLOAT.IMG` | `SLDEM/SLDEM2015_512_60S_30S_135_180_FLOAT.IMG` | 1.415.577.600 | 4.699 | `data/raw/sldem2015/` | Chang'e 4 |
| 14 | G4 | `SLDEM2015_512_60S_30S_180_225_FLOAT.IMG` | `SLDEM/SLDEM2015_512_60S_30S_180_225_FLOAT.IMG` | 1.415.577.600 | 4.696 | `data/raw/sldem2015/` | Chang'e 4, Chang'e 6 |
| 15 | G4 | `SLDEM2015_512_00N_30N_270_315_FLOAT.IMG` | `SLDEM/SLDEM2015_512_00N_30N_270_315_FLOAT.IMG` | 1.415.577.600 | 4.696 | `data/raw/sldem2015/` | Luna 9, 13, 17; Surveyor 1 |
| 16 | G4 | `SLDEM2015_512_30S_00S_270_315_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30S_00S_270_315_FLOAT.IMG` | 1.415.577.600 | 4.694 | `data/raw/sldem2015/` | Luna 9; Surveyor 1 |
| 17 | G4 | `SLDEM2015_512_00N_30N_315_360_FLOAT.IMG` | `SLDEM/SLDEM2015_512_00N_30N_315_360_FLOAT.IMG` | 1.415.577.600 | 4.696 | `data/raw/sldem2015/` | Apollo 12, 14, 15; Surveyor 1, 3, 6; Luna 17 |
| 18 | G4 | `SLDEM2015_512_30S_00S_315_360_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30S_00S_315_360_FLOAT.IMG` | 1.415.577.600 | 4.694 | `data/raw/sldem2015/` | Apollo 12, 14; Surveyor 1, 3, 6 |
| 19 | G4 | `SLDEM2015_512_60S_30S_315_360_FLOAT.IMG` | `SLDEM/SLDEM2015_512_60S_30S_315_360_FLOAT.IMG` | 1.415.577.600 | 4.700 | `data/raw/sldem2015/` | Surveyor 7 |
| 20 | G4 | `SLDEM2015_512_60S_30S_000_045_FLOAT.IMG` | `SLDEM/SLDEM2015_512_60S_30S_000_045_FLOAT.IMG` | 1.415.577.600 | 4.696 | `data/raw/sldem2015/` | Surveyor 7 |
| 21 | G4 | `SLDEM2015_512_30N_60N_315_360_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30N_60N_315_360_FLOAT.IMG` | 1.415.577.600 | 4.697 | `data/raw/sldem2015/` | Apollo 15; Luna 17; Chang'e 3, 5 |
| 22 | G4 | `SLDEM2015_512_30N_60N_270_315_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30N_60N_270_315_FLOAT.IMG` | 1.415.577.600 | 4.697 | `data/raw/sldem2015/` | Luna 17; Chang'e 5 |
| 23 | G4 | `SLDEM2015_512_30S_00S_045_090_FLOAT.IMG` | `SLDEM/SLDEM2015_512_30S_00S_045_090_FLOAT.IMG` | 1.415.577.600 | 4.691 | `data/raw/sldem2015/` | Luna 16, 20 |
| 24 | G5 | `LDEM_60S_120M.IMG` | `LOLA/LDEM_60S_120M.IMG` | 481.740.800 | 4.996 | `data/raw/lola/` | Chandrayaan-3, IM-1 |
| 25 | G6 | `AVGVISIB_75S_120M_201608.IMG` | `ILLUM/AVGVISIB_75S_120M_201608.IMG` | 116.250.752 | 4.092 | `data/raw/nasa_illum/` | B7 fuera de 85° S |
| 26 | G6 | `AVGVISIB_75S_120M_201608_EARTH.IMG` | `ILLUM/AVGVISIB_75S_120M_201608_EARTH.IMG` | 116.250.752 | 4.112 | `data/raw/nasa_illum/` | B7 fuera de 85° S |
| 27 | G6 | `LPSR_85S_060M_201608.IMG` | `ILLUM/LPSR_85S_060M_201608.IMG` | 51.166.728 | 3.914 | `data/raw/nasa_illum/` | F22 (P2) |

Totales sin contar etiquetas: G0 132.688.031 B; G1 578.330.752 B; G2 1.415.577.600 B; G3 102.333.456 B; G4 19.818.086.400 B (14 teselas); G5 481.740.800 B; G6 283.668.232 B. Suma: 22.812.425.271 B (22,8 GB). Con los grupos G0 a G3 (2,23 GB) ya se pueden pasar todas las pruebas del punto A.

Los tamaños salen de los listados de directorio y de las cabeceras `Content-Length` de los servidores (`referencias/listados/`).

### 10.2 Cómo comprobar el tamaño

El tamaño en bytes debe coincidir exactamente con la tabla. No hay sumas de comprobación publicadas.

| Entorno | Orden |
| --- | --- |
| Git Bash, Linux, macOS | `wc -c < data/raw/lola/LDEM_80S_40M.IMG` |
| PowerShell | `(Get-Item data\raw\lola\LDEM_80S_40M.IMG).Length` |
| Todos los ficheros a la vez | `python ops/fetch_data.py --check` (compara cada fichero presente con la lista e imprime `OK`, `PARTIAL <bytes>/<total>` o `MISSING`) |

Un fichero con menos bytes está cortado; uno con más bytes o con el tamaño exacto pero que no pasa las comprobaciones de lectura (§4.3, §5.4, §6) se borra y se baja de nuevo.

### 10.3 Cómo reanudar una descarga cortada

Los dos servidores aceptan peticiones por rango (`Accept-Ranges: bytes`), así que una descarga cortada continúa donde se quedó:

```
curl -L -C - -o data/raw/sldem2015/SLDEM2015_512_00N_30N_045_090_FLOAT.IMG \
     https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/SLDEM2015_512_00N_30N_045_090_FLOAT.IMG
```

`-C -` mira el tamaño del fichero de destino y pide solo los bytes que faltan. Se repite la misma orden hasta que el tamaño sea el de la tabla. `ops/fetch_data.py` hace lo mismo con la cabecera `Range: bytes=<tamaño_actual>-`. Un navegador que deje un fichero parcial con otro nombre (por ejemplo `.crdownload` o `.part`) no sirve para reanudar con `curl`: se renombra al nombre final y se lanza la orden anterior.

### 10.4 Teselas SLDEM2015: completa o por filas

Para cada tesela hay dos caminos equivalentes y `build_crop` (§5.3) elige solo:

- **Tesela completa** en `data/raw/sldem2015/` (1.415.577.600 B): `build_crop` la usa y no toca la red.
- **Por filas**: si la tesela no está, `build_crop` pide al servidor solo las filas que necesita cada sitio. Para Blue Ghost 1 son las filas de 8,56° N a 28,56° N de la tesela n.º 7: 10.240 filas = 943.718.400 B. Para el conjunto del catálogo, unos 9 GB en lugar de los 21,2 GB de las 15 teselas.

En los dos casos lo que queda guardado para el motor es el recorte de `data/crops/` (unos 6 GB para los 24 sitios).

## 11. Script de descarga `ops/fetch_data.py`

Una sola orden, reanudable e idempotente: `python ops/fetch_data.py --group <g>` (o `make data-fetch` para los grupos G0–G3 y `make data-fetch-all` para G4–G6). Solo usa la biblioteca estándar de Python.

Tabla interna del script (`ops/data_manifest.json`, que forma parte de la tarea T-03): una entrada por fila del §10.1 (y otra por cada `.LBL`), con `url`, `dest`, `bytes` y `group`. Los valores son los de este documento.

Opciones: `--group G0,G1,…` (qué grupos); `--check` (solo comprobar, §10.2); `--full-tiles` (bajar las teselas SLDEM2015 completas a `data/raw/sldem2015/` en lugar de por filas); `--crops` (construir los recortes de los sitios cuyas teselas o filas estén disponibles).

Pasos del script para cada fichero:

1. Si `dest` existe y su tamaño es el esperado, saltar.
2. Si existe con menos bytes, reanudar con `Range: bytes=<tamaño_actual>-`.
3. Descargar a `dest.part` en bloques de 8 MiB; mostrar una línea de progreso por cada 5 %.
4. Al terminar, comprobar tamaño exacto; si no coincide, borrar `dest.part` y reintentar hasta 3 veces con espera de 5, 20 y 60 s.
5. Renombrar a `dest` y añadir una línea a `data/fetch_log.jsonl` con `url`, `bytes` y `sha256`.
6. Para los recortes: aplicar `build_crop` (§5.3), que usa la tesela local si está completa y, si no, descarga por rango de filas.
7. Al final imprime un resumen de una línea por fichero (`OK`, `SKIP`, `FAIL`) y sale con código distinto de 0 si hay algún `FAIL`.

Errores y mensajes: sin red → `Network error fetching <url>: <motivo>. Re-run to resume.`; tamaño distinto → `Size mismatch for <file>: expected <n>, got <m>.`; el servidor no admite rangos (falta `Accept-Ranges: bytes`) → `Server does not support range requests; downloading full tile <name> (1.4 GB).` y se baja la tesela entera.

Comprobado: tanto `naif.jpl.nasa.gov` como `imbrium.mit.edu` responden con `Accept-Ranges: bytes`.

Plan B de datos (riesgo «datos difíciles de descargar en la sede»): si G4 no termina, los sitios sin recorte se publican con `relief = smooth` y su rótulo rojo; A3 solo depende de G2.

## 12. Rendimiento esperado de la lectura

| Operación | Tiempo esperado | Memoria | Cómo se mide |
| --- | --- | --- | --- |
| Abrir P1 + P2 con `memmap` | < 0,1 s | ~0 (bajo demanda) | `pytest --durations` |
| Cargar P1 + P2 enteros en RAM | 2–5 s desde SSD | 580 MB | Ídem |
| Muestreo bilineal en NumPy | ~2·10⁷ muestras/s por núcleo | 8 B por muestra y matriz intermedia | `python -m pipeline.cli bench-sampler` |
| Construir un recorte SLDEM2015 | Con la tesela local, 10–20 s; por filas, lo que tarde la red (0,5–1 GB) + 10 s | < 1 GB | Registro de `fetch_data` |

Las cifras de velocidad son estimaciones de diseño; la tarea T-07 las mide y las anota en `docs/constants.md`.
