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
| Malla del mapa: `CELL_M`, `NX`, `NY`, `X_MIN_M`, `Y_MAX_M` | 500; 752; 672; −200.000; 184.000 | m; —; —; m; m | `08_mapa_polar.md` §1.2 (D-13); `09_contrato_datos.md` §8.1 | `pipeline/horizon/cube.py` |
| Trozos: `CHUNK`, `N_CHUNK_COLS`, `N_CHUNK_ROWS` (1.974 trozos de 256 puntos) | 16; 47; 42 | — | `08` §2; `09` §8.1 | `pipeline/horizon/cube.py` |
| Fichero de trozo: `CUBE_MAGIC`, versión, `LAW_IDS`, `CHUNK_BYTES`, `HEIGHT_NODATA` | `LLSNCUB1`; 1.0; `full` = 1, `fast` = 2; 553.504 B; −32768 | — | `09` §10.2 | `pipeline/horizon/cube.py` |
| Codificación del cubo: `EL_SCALE_DEG`, `EL_Q_MAX`; `DIST_CODE_BASE_M`, `DIST_CODE_RATIO` | 0,01; 32767; 20; 1,04 | °; —; m; — | `09` §10.1 y §10.2 | `pipeline/horizon/cube.py` |
| `GZIP_LEVEL` (compresión de los trozos; el contrato solo pide gzip estándar de un miembro) | 6 | — | Valor por defecto de zlib; `09` (convenios) | `pipeline/horizon/cube.py` |
| Plan del cubo: `REGION_MARGIN_M`, `LEVEL2_LAT_DEG`, `LEVEL3_LAT_DEG` | 2.000; −88; −85 | m; °; ° | `08` §2 | `pipeline/horizon/cube.py` |
| `REGIONS`: centro y lado de las 9 regiones candidatas (copia temporal, D-52) | Tabla | °; km | `04_catalogo_sitios.md` §3 (PENDIENTE DE VERIFICAR, A2) | `pipeline/horizon/cube.py` |
| `BENCH_CHUNKS` (trozos de la medida de coste, fila y columna) | (23, 25), (4, 36), (14, 2), (41, 0) | — | `08` §4 | `pipeline/horizon/cube.py` |
| `BENCH_SWEEP_RINGS`, `BENCH_SWEEP_POINTS` (comparación de tamaños de bloque en la medida) | 128, 64, 32, 16; 64 | — | D-53 | `pipeline/horizon/cube.py` |
| Motor del cubo: `DEFAULT_PTS_BATCH`, `DEFAULT_RING`, `DEFAULT_OBSERVER_HEIGHT_M` | 64; 32; 2,0 | —; —; m | `08` §3.2 (`ring`: D-53, medido) | `pipeline/horizon/engine_torch.py` |
| `EL_TOL_DEG` (motor del cubo frente al de referencia) | 0,002 | ° | `08` §3.3 y §3.5 | `pipeline/tests/test_cube_engine.py` |
| Luna lisa a 2 m (pruebas): elevación y distancia de tangencia | −0,0869; 2.636 | °; m | `06_horizonte.md` §9; `08` §3.5 | `pipeline/tests/test_cube_engine.py` |
| Shackleton, centro (pruebas) | −89,67; 129,78 | ° | Gazetteer of Planetary Nomenclature, ficha 5450 (`03` §4.4) | `pipeline/tests/test_dem_read.py`, `test_grids.py` |
| SLIM, sitio y cota publicada (prueba) | −13,3160; 25,2510; −912 | °; °; m | LROC, «JAXA SLIM Landing» (`03` §5.4) | `pipeline/tests/test_dem_read.py` |
| Tamaño de `ephemeris.bin` y tramos `main` / `apollo` (`t0_unix`, `n`, `byte_offset`) | 5.260.176; 1.704.063.600 / −31.539.600; 184.107 / 35.067; 0 / 4.418.568 | B; s; —; B | `05_efemerides.md` §4.2 | `contract/examples/make_examples.py`, `pipeline/cli/contract_check.py` |
| Efemérides sintéticas: distancia y periodo del Sol, amplitud y periodo de su latitud | 1,496·10⁸; 29,53; 1,54; 346,6 | km; d; °; d | `09_contrato_datos.md` §13 | `contract/examples/make_examples.py` |
| Efemérides sintéticas: distancia de la Tierra, amplitud y periodo de su longitud y de su latitud | 384.400; 7,9 y 27,55; 6,7 y 27,21 | km; ° y d | `09` §13 | Ídem |
| Máscaras de ejemplo: `demo-a` 0,4 + 0,6·sin(3·az); `demo-b` 12 + 3·sin(2·az) | — | ° | `09` §13 | Ídem |
| Comprobaciones de las efemérides: \|sol\| 1,45–1,53·10⁸ km, \|tierra\| 3,5–4,1·10⁵ km, Tierra a menos de 12° de +X | — | km, ° | `05` §8.7 | `pipeline/cli/contract_check.py` |
| `PROFILE_BYTES` (perfil sin comprimir) y cabecera de 32 B `LLSNPRF1` | 737.312 | B | `09` §6 | `pipeline/horizon/profile.py` |
| Capa sin comprimir (3 bandas) / validación y DEM de 500 m (2 bandas o `int16`) | 1.516.032 / 1.010.688 | B | `09` §8.3, §9.2 | `pipeline/cli/contract_check.py` |
| Capas: máximo de un valor válido y valor sin dato | 250; 255 | — | `09` §9.2 | Ídem |
| `map/hillshade_250m.png` | 1.504 × 1.344, gris de 8 bits | px | `09` §8.3 | Ídem, `make_examples.py` |
| Máscaras compactas: cabecera `LLSNCMP1` de 32 B, 180 acimuts cada 200 centésimas de grado, 368 B por punto | — | — | `09` §11 | Ídem |
| Versión mayor del contrato que lee la web | 1 | — | `contract/VERSION`, `09_contrato_datos.md` | `web/src/core/constants.ts` (`CONTRACT_MAJOR`) |
| Acimuts por máscara y paso | 720 y 0,5 | — y ° | `09_contrato_datos.md` §5 | `web/src/core/constants.ts` (`N_AZ`, `AZ_STEP_DEG`) |
| Tamaño de `ephemeris.bin` (comprobación en la web) | 5.260.176 | B | `09_contrato_datos.md` §3.2 | `web/src/core/constants.ts` (`EPHEMERIS_BYTES`) |
| Tamaño de un perfil descomprimido | 737.312 | B | `09_contrato_datos.md` §6 | `web/src/core/constants.ts` (`PROFILE_BYTES`) |
| Espera antes del reintento automático | 2.000 | ms | `10_interfaz.md` §9 | `web/src/core/constants.ts` (`NETWORK_RETRY_DELAY_MS`) |
| Máximo de escenarios | 4 (A–D) | — | `10_interfaz.md` §5 | `web/src/core/constants.ts` (`MAX_SCENARIOS`) |
| Velocidades de reproducción | 3.600, 21.600, 86.400 | s simulados por s | `10_interfaz.md` §4 (`1 h/s`, `6 h/s`, `1 d/s`) | `web/src/core/constants.ts` (`PLAY_SPEEDS`) |
| Requisitos por defecto | Sol y Tierra al aterrizar; noche ≤ 24 h; 1,0° y 1,0 para `marginal` | h, °, — | `07_visibilidad.md` §8.1 | `web/src/state/store.ts` (`DEFAULT_REQUIREMENTS`) |
| Radios de la Luna, el Sol y la Tierra (web) | 1.737,4; 695.700; 6.378,137 | km | `00_indice.md` §3; `ephemeris.meta.json` `constants` (`09` §3.2) | `web/src/core/constants.ts` (`R_MOON_KM`, `R_SUN_KM`, `R_EARTH_KM`) |
| Registro y paso de la tabla de efemérides | 24 B (6 `float32`) y 3.600 s | B, s | `05_efemerides.md` §4.3 | `web/src/core/ephemeris.ts` |
| Umbral del convenio del cénit | 10⁻¹² (fracción de la longitud del vector) | — | D-62 | `web/src/core/frames.ts` (`ZENITH_REL`) |
| Franjas del disco y cota inferior de cos(el) | 32 y 0,05 | — | `07_visibilidad.md` §4.1 | `web/src/core/visibility.ts` (`DISC_STRIPS`, `MIN_COS_EL`) |
| Paso de búsqueda de cruces | 600 | s | `07_visibilidad.md` §6.1 | `web/src/core/events.ts` (`SCAN_STEP_S`) |
| Horizonte de la cuenta atrás | 60 | días | `07_visibilidad.md` §7 | `web/src/core/metrics.ts` (`NEXT_EVENT_HORIZON_S`) |
| Ley de muestreo `full` / `fast` (web) | 20 m × 1.000 + 1,001ⁿ (3.709) / 40 m × 500 + 1,002ⁿ (1.855) | m | `06_horizonte.md` §3 | `web/src/core/law.ts` (`LAWS`) |

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

### T-24 · Motor del cubo (2026-11-14)

Medido en el portátil de I1 (RTX 4060 Laptop de 8 GB, PyTorch 2.15.0+cu132, 10 hilos de CPU) con
**relieve sintético en memoria**, sin ficheros de `$LLSN_DATA_DIR`. La velocidad con los DEM reales es
la de `make cube-bench` (`$LLSN_DATA_DIR/out/cube/bench.json`), que lanzó I3 el 2026-11-14: está en la
tabla «Con los DEM reales», al final de este apartado (D-59).

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| `engine_torch` (CPU) frente a `engine_ref`: 16 puntos, ley `full`, 72 acimuts por punto, terreno de la prueba (rejillas de 40 m y 120 m) | max \|Δ elevación\| = 7,2·10⁻⁶°; muestra `i*` distinta en el 0,17 % de los rayos, siempre empates | < 0,002° | `08_mapa_polar.md` §3.5 |
| Ídem en la GPU | 7,9·10⁻⁶°; 0,17 % | < 0,002° | `08` §3.5 |
| Ídem con la ley `fast` (CPU; GPU) | 7,0·10⁻⁶°; 7,2·10⁻⁶° | < 0,002° | `08` §3.5 |
| Transcripción literal en `float32` del pseudocódigo de `08` §3.2 (posiciones y cotas absolutas), mismo terreno | 0,0039° (`full`); 0,0023° (`fast`): no cumple | < 0,002° | `08` §3.3 (ver D-54) |
| Esfera lisa, observador a 2 m | −0,0869° en los 720 acimuts; código −9; distancia 2.640 m | −0,0869°; −9; 2.636 m ± 40 m | `08` §3.5; `06` §9 |
| Velocidad en la GPU, trozo completo (256 puntos), `pts_batch` 64: `ring` 128; 64; 32; 16 | 2,7·10⁸; 3,8·10⁸; 5,6·10⁸; 6,0·10⁸ muestras/s | 2·10⁸–5·10⁸ (supuesto) | `08` §4 |
| Velocidad en CPU (10 hilos), 64 puntos, `pts_batch` 64: `ring` 128; 32; 8 | 3,8·10⁷; 6,0·10⁷; 7,1·10⁷ muestras/s | 5·10⁷ (supuesto, «muchos núcleos») | `08` §4 |
| Memoria máxima de la GPU sin contar los DEM: 64 × 128; 64 × 32; 256 × 128 | 642; 220; 2.312 MB | < 400 MB | `08` §3.2 |
| Plan: trozos de los niveles 1, 2, 3 y 4 | 113; 200; 931; 730 (28.928; 51.200; 238.336; 186.880 puntos) | ~90; ~180; ~900; ~800 | `08` §2 |

La rejilla sintética de la medida de velocidad (40 m, 6.000 px; 120 m, 2.200 px) ocupa 80 MB; P1 y P2
ocupan 578 MB, así que con los DEM reales la lectura de vecinos tendrá más fallos de caché y la cifra
puede ser menor. Extrapolación **provisional** con 5,6·10⁸ muestras/s: cubo completo con la ley `full`
en unos 40 min; no sustituye a la medida.

**Con los DEM reales** (`make cube-bench`, `bench.json` generado el 2026-11-14T10:01:42Z): P1
`LDEM_80S_40M` + P2 `LDEM_75S_120M` en la GPU (RTX 4060 Laptop, PyTorch 2.15.0+cu132), los 4 trozos de
`08_mapa_polar.md` §4 (1.024 puntos por ley), `ring` 32, `pts_batch` 64, observador a 2 m.

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| Velocidad con la ley `full` (2,73·10⁹ muestras en 5,51 s): con la codificación; solo el cálculo | 4,96·10⁸; 5,17·10⁸ muestras/s (5,38 ms por punto) | 2·10⁸–5·10⁸ (supuesto) | `08` §4 |
| Velocidad con la ley `fast` (1,37·10⁹ muestras en 2,96 s): con la codificación; solo el cálculo | 4,62·10⁸; 4,97·10⁸ muestras/s (2,89 ms por punto) | 2·10⁸–5·10⁸ (supuesto) | `08` §4 |
| Barrido de `ring`: 128; 64; 32; 16 | 2,87·10⁸; 3,98·10⁸; 5,26·10⁸; 2,65·10⁸ muestras/s | — | D-53 |
| Extrapolación con `full`: niveles 1; 2; 3; 4; cubo completo | 156 s; 275 s; 1.282 s; 1.005 s; **2.718 s = 45 min 18 s** | 45 min (optimista) a 1 h 53 min (prudente); límite de la regla, 6 h | `08` §4 |
| Extrapolación con `fast`: niveles 1; 2; 3; 4; cubo completo | 84 s; 148 s; 688 s; 540 s; 1.460 s = 24 min 20 s | 23 min a 56 min | `08` §4 |
| Pico de memoria de la GPU durante la medida | 1.087 MB | Cabe en 8 GB | `08` §3.1 |
| Tamaño medio del trozo comprimido: `full`; `fast` | 146.594 B; 142.608 B (unos 289 MB los 1.974 trozos con `full`) | 0,3–0,6 GB el cubo | `08` §4 |
| Lectura de P1 y P2 y copia a la GPU | 1,2 s | — | — |

Regla de decisión de `08` §4 aplicada en D-59: ley `full`, niveles 1 a 4.
