<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Constantes

Cada constante del código, con su valor, unidad, fuente y fichero donde se usa. Ninguna constante sin
fuente (CLAUDE.md §2).

| Constante | Valor | Unidad | Fuente | Dónde |
| --- | --- | --- | --- | --- |
| Tamaño de `naif0012.tls` | 5.257 | B | `03_datos_y_fuentes.md` §10.1, fila 1 | `pipeline/tests/conftest.py`, `ci.yml` |
| Tamaño de `de440.bsp` | 119.799.808 | B | `03_datos_y_fuentes.md` §10.1, fila 2 | Ídem |
| Tamaño de `moon_pa_de440_200625.bpc` | 12.863.488 | B | `03_datos_y_fuentes.md` §10.1, fila 3 | Ídem |
| Tamaño de `moon_de440_250416.tf` | 19.478 | B | `03_datos_y_fuentes.md` §10.1, fila 4 | Ídem |
| Límite por fichero versionado | 10 MB | B | `02_arquitectura.md` §5 | `pipeline/tests/test_repo_rules.py` |
| `R_MOON_KM`, `R_MOON_M` | 1737,4; 1.737.400 | km; m | `A_AXIS_RADIUS` de las etiquetas LOLA y SLDEM2015 (`00_indice.md` §3) | `pipeline/common/constants.py` |
| `VALID_HEIGHT_ABS_MAX_M` (filtro de valor inválido) | 20.000 | m | `03_datos_y_fuentes.md` §3.3 | `pipeline/dem/grids.py` |
| Tesela SLDEM2015: 512 ppd, 30° × 45°, 15.360 × 23.040 píxeles, 92.160 B por fila, 1.415.577.600 B | — | — | Etiquetas SLDEM2015 (`03` §5.1) | `pipeline/dem/crop.py` |
| `SLDEM_BASE_URL` | `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG` | — | `03` §10.1 (prefijo `SLDEM`) | `pipeline/dem/crop.py` |
| Ventana del recorte: `CROP_HALF_LAT_DEG`, `CROP_DELTA_DEG`, `CROP_LON_MARGIN_DEG` | 10,0; 9,893; 0,1 | ° | `03` §5.2 y §5.3 (δ = 300/1737,4 rad) | `pipeline/dem/crop.py` |
| Codificación del recorte: `CROP_UNITS_PER_KM`, `CROP_SCALING_M` | 2000; 0,5 | 1/km; m | `03` §5.3 | `pipeline/dem/crop.py` |
| `P1_HALF_SIDE_M`, `P2_HALF_SIDE_M` (medio lado N·S/2) | 304.000; 457.440 | m | `03` §3.1, tabla de cobertura | `pipeline/dem/stack.py` |
| `MAX_DIST_M` (alcance de los rayos, para decidir si entra P3) | 300.000 | m | `06_horizonte.md` §2 | `pipeline/dem/stack.py` (reexportada en `pipeline/horizon/law.py`) |
| `N_AZ`, `AZ_STEP_DEG` (acimuts de la máscara) | 720; 0,5 | —; ° | `06_horizonte.md` §2 (plan: máscara cada 0,5°) | `pipeline/horizon/law.py` |
| Ley `full`: `d0_m`, `n_lin`, `g`, `n_samples` | 20; 1000; 1,001; 3709 | m; —; —; — | `06_horizonte.md` §2 y §3 (D-07) | `pipeline/horizon/law.py` |
| Ley `fast`: `d0_m`, `n_lin`, `g`, `n_samples` | 40; 500; 1,002; 1855 | m; —; —; — | `06_horizonte.md` §2 y §3 (D-07) | `pipeline/horizon/law.py` |
| `DEFAULT_OBSERVER_HEIGHTS_M` | 2,0; 10,0 | m | `06_horizonte.md` §1 y §7 | `pipeline/horizon/engine_ref.py` |
| `PROFILE_OBSERVER_HEIGHT_M` (observador con el que se reduce el perfil) | 2,0 | m | `06_horizonte.md` §8 | `pipeline/horizon/engine_ref.py` |
| `AZ_BLOCK` (acimuts por bloque, acota la memoria) | 90 | — | `06_horizonte.md` §5 | `pipeline/horizon/engine_ref.py` |
| `NODATA_WARNING_FRACTION` (umbral de `stats.warning = "nodata"`) | 0,01 | — | `06_horizonte.md` §6 | `pipeline/horizon/engine_ref.py` |
| `PROFILE_BINS`; `PROFILE_NODATA`; `PROFILE_HEIGHT_MIN_M`, `PROFILE_HEIGHT_MAX_M` | 512; −32768; −32767, 32767 | —; m; m | `06_horizonte.md` §8; `09_contrato_datos.md` §6 | `pipeline/horizon/profile.py` |
| Tolerancias de las pruebas sintéticas: depresión 0,0005°; monte 0,005°; depresión circular 0,001°; invariantes 10⁻⁹° | — | ° | `06_horizonte.md` §10.1–§10.5 | `pipeline/tests/test_horizon_synthetic.py` |
| `CARTESIAN_TOL_DEG`; `CARTESIAN_TOL_NEAR_DEG`, `CARTESIAN_NEAR_M` (fórmula cerrada frente a la geometría 3D literal) | 10⁻⁹; 5·10⁻⁹ por debajo de 100 | °; °, m | `06_horizonte.md` §10.5 y decisión D-51 | `pipeline/tests/test_horizon_synthetic.py` |
| Shackleton, centro (pruebas) | −89,67; 129,78 | ° | Gazetteer of Planetary Nomenclature, ficha 5450 (`03` §4.4) | `pipeline/tests/test_dem_read.py`, `test_grids.py` |
| SLIM, sitio y cota publicada (prueba) | −13,3160; 25,2510; −912 | °; °; m | LROC, «JAXA SLIM Landing» (`03` §5.4) | `pipeline/tests/test_dem_read.py` |

## Valores medidos

Medidos al ejecutar cada tarjeta en el portátil de I1 (Windows 11, SSD) con los ficheros de `$LLSN_DATA_DIR`.

### T-07 · Lectura de los DEM (2026-11-13, `pytest -m data -s`)

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| P1 `LDEM_80S_40M`: mínimo y máximo | −14593 / 14054 DN (−7.296,5 / +7.027,0 m) | Iguales | Etiqueta (`03` §4.1) |
| P2 `LDEM_75S_120M`: mínimo y máximo | −15526 / 14050 DN (−7.763,0 / +7.025,0 m) | Iguales | Etiqueta |
| P3 `LDEM_60S_120M`: mínimo y máximo | −18255 / 14050 DN (−9.127,5 / +7.025,0 m) | Iguales | Etiqueta |
| \|P1 − P2\| en 1.000 puntos al azar (\|x\|, \|y\| < 150 km, semilla 20261114) | Mediana 0,84 m; percentil 95: 3,11 m; máximo 13,4 m | Mediana < 5 m | `03` §4.3 |
| Shackleton: cota interpolada en el centro (P1) | −2.788,9 m | — | — |
| Shackleton: cota máxima a menos de 12 km del centro (borde) | +1.737,0 m | — | — |
| Shackleton: profundidad (borde máximo − centro) | 4.525,9 m | Entre 3.500 y 4.700 m | `03` §4.4; Zuber et al. (2012) dan 4,1 ± 0,05 km de media |
| Shackleton: punto espejo (−89,67°, −129,78°) | +672,2 m, 3.461 m por encima del centro | ≥ 2.000 m por encima | `03` §4.4 (orientación: el eje x no está invertido) |
| SLIM: cota interpolada en el recorte SLDEM2015 | −912,5 m | −912 m ± 50 m | LROC (`03` §5.4) |
| Blue Ghost 1: cota interpolada en el recorte | −3.652,4 m | — | La comprueba A2 en QGIS (`04` §7) |
| Blue Ghost 1: recorte | 10.241 × 10.796 píxeles, 221.123.672 B; mínimo −5.564,0 m, máximo +2.569,0 m | Dentro de −5.567 … +3.360 m | Etiqueta de la tesela (`03` §5.2) |
| Chandrayaan-3: cota interpolada en P3 | +528,4 m | — | — |
| Costura entre teselas SLDEM2015 (media del salto en valor absoluto) | 5,20 m en 45° E (`00N_30N_000_045` con `045_090`); 4,61 m en el ecuador (`00N_30N` con `30S_00S`, columna `000_045`) | < 20 m | `03` §5.4 |
| Construir un recorte desde la tesela local | 3,3–3,5 s | 10–20 s | `03` §12 |
| Abrir P1 + P2 con `memmap` | < 0,01 s | < 0,1 s | `03` §12 |
| Cargar P1 + P2 enteros en RAM | 0,2 s (con los ficheros ya en la caché del sistema) | 2–5 s | `03` §12 |
| Muestreo bilineal en NumPy (`bench-sampler`, 2·10⁶ muestras, un núcleo) | 9,0·10⁶ muestras/s solo la interpolación en memoria; 6,4·10⁶ muestras/s con la proyección y la pila P1 + P2 (rayos desde el polo) | ~2·10⁷ muestras/s | `03` §12 (estimación de diseño) |

El muestreo medido es un tercio de la estimación de diseño. Una máscara de sitio son 2,67·10⁶ muestras,
unos 0,4–0,5 s de muestreo: dentro de los 1–5 s previstos en `06_horizonte.md` §11.

### T-08 · Motor de horizonte de referencia (2026-11-14)

Medido en el portátil de I1 con relieve en memoria, sin ficheros de `$LLSN_DATA_DIR` (mejor de 5
ejecuciones, un núcleo, alturas de observador 2 m y 10 m en la misma pasada).

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| Una máscara, ley `full` (2.670.480 muestras), relieve analítico (`SyntheticGrid` plano): solo el motor, sin lectura de DEM | 0,29 s = 9,1·10⁶ muestras/s | — | — |
| Ídem, ley `fast` (1.335.600 muestras) | 0,15 s = 8,9·10⁶ muestras/s | — | — |
| Una máscara, ley `full`, con interpolación bilineal en una rejilla polar de 40 m en memoria (16.384² píxeles `int16` al azar, sitio en el polo) | 0,84 s = 3,2·10⁶ muestras/s | 1–5 s | `06_horizonte.md` §11 |
| Ídem, ley `fast` | 0,50 s = 2,7·10⁶ muestras/s | — | — |
| Memoria máxima pedida por el motor durante una máscara `full` (bloques de 90 acimuts), sin contar el DEM | 75 MB | < 500 MB | `06_horizonte.md` §11 |
| Lote de 43 sitios (extrapolado: 43 × 0,84 s) | ~36 s más la lectura de los recortes | < 5 min | `06_horizonte.md` §11 |
| `elevation_cartesian` frente a la fórmula cerrada, ley `full`, 20 terrenos × 720 acimuts (53,4·10⁶ muestras) | Máximo 1,61·10⁻⁹° en la muestra i = 0 (20 m; 274 muestras ≥ 10⁻⁹°); 7,6·10⁻¹⁰° en i = 1 (40 m); 3,4·10⁻¹⁰° a partir de 100 m; 3,1·10⁻¹¹° a partir de 1 km | < 10⁻⁹° | `06_horizonte.md` §10.5 (ver D-51) |
| Monte de 3 km a 50 km (`06` §10.2): elevación en el acimut 90° | 2,6038° con observador a 0 m y 2,6016° a 2 m; `dist_m` = 50.012,6 m | 2,606° y 2,604° ± 0,005° | `06_horizonte.md` §10.2 |
| Depresión circular (`06` §10.3) | 2,68567° en los 720 acimuts; `dist_m` = 10.000 m | 2,6857° ± 0,001° | `06_horizonte.md` §10.3 |
| Esfera lisa (`06` §10.1): elevación y distancia con observador a 2, 100 y 1.000 m | −0,08694°, 2.640 m; −0,61472°, 18.640 m; −1,94350°, 58.921 m | −0,0869°, 2.636 m; −0,6147°, 18.640 m; −1,9435°, 58.933 m | `06_horizonte.md` §10.1 |

El motor de referencia cumple con margen el coste previsto. La cifra con los DEM reales (P1 + P2 mapeados
en memoria) la mide T-09 con `time python -m pipeline.cli site-mask --site <id>`, que es la orden que fija
`06_horizonte.md` §11; con la velocidad de muestreo de T-07 (6,4·10⁶ muestras/s) se esperan 0,7–0,9 s.
