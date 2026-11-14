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
| `DEFAULT_LAW` (ley del cubo cuando no se indica `LAW`) | `full` | — | D-59 | `pipeline/horizon/cube.py` |
| `CF_MAX_FILES`, `CF_MAX_FILE_BYTES` (límites de Cloudflare Pages, plan gratuito; `deploy-heavy` se niega a publicar si se superan) | 20.000; 25 MiB (26.214.400) | ficheros; B | `02_arquitectura.md` §6.2 (documentación oficial de Cloudflare Pages, «Limits», en `SOURCES.md`) | `ops/tasks.mjs` |
| `HEAVY_HEADERS` (fichero `_headers` del origen pesado) | `/*` → `Access-Control-Allow-Origin: *` | — | `02` §6.2; formato: documentación de Cloudflare Pages, «Headers» (`SOURCES.md`) | `ops/tasks.mjs` |
| `heavy_base_url` por defecto de `deploy-heavy` | `https://aeroinformagicos-llsn-data.pages.dev` | — | D-45 (proyecto) y `<proyecto>.pages.dev` (documentación de Cloudflare Pages); `HEAVY_BASE_URL` lo cambia | `ops/tasks.mjs` |
| Franjas del disco y cota inferior de cos(el) | 32 y 0,05 | — | `07_visibilidad.md` §4.1 | `web/src/core/visibility.ts` (`DISC_STRIPS`, `MIN_COS_EL`) |
| Paso de búsqueda de cruces | 600 | s | `07_visibilidad.md` §6.1 | `web/src/core/events.ts` (`SCAN_STEP_S`) |
| Horizonte de la cuenta atrás | 60 | días | `07_visibilidad.md` §7 | `web/src/core/metrics.ts` (`NEXT_EVENT_HORIZON_S`) |
| Ley de muestreo `full` / `fast` (web) | 20 m × 1.000 + 1,001ⁿ (3.709) / 40 m × 500 + 1,002ⁿ (1.855) | m | `06_horizonte.md` §3 | `web/src/core/law.ts` (`LAWS`) |
| `R_SUN_KM`, `R_EARTH_KM` | 695.700; 6.378,137 | km | `05_efemerides.md` §1 (plan; cabecera de Horizons: `Target radii` y `R_eq`) | `pipeline/common/constants.py` |
| `FRAME`, `ABCORR` | `MOON_ME`; `LT+S` | — | `05` §1 (`moon_de440_250416.tf`; plan) | `pipeline/common/constants.py` |
| `STEP_S`, `OBSERVER_HEIGHT_M` | 3.600; 2,0 | s; m | `05` §1 (plan) | `pipeline/common/constants.py` |
| `ZENITH_REL` (umbral del convenio del cénit, Python) | 10⁻¹² (fracción de la longitud del vector) | — | D-62 (mismo valor que `web/src/core/frames.ts`) | `pipeline/common/constants.py`, `pipeline/common/geo.py` (`azel_from_vector`) |
| `KERNEL_FILES` (los cuatro núcleos, en orden de carga) | `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | — | `03_datos_y_fuentes.md` §2 | `pipeline/ephem/kernels.py` |
| Prueba del propio `.tf`: Tierra respecto a la Luna en ET = 717768000,0, sin corrección, en `MOON_ME` y en `MOON_PA`; tolerancia | (374008,654; −23435,970; 10141,334) y (373997,028; −23558,987; 10284,057); 0,001 | km | `03` §2; `05` §8.1 | `pipeline/tests/test_ephem_frames.py` |
| `HORIZONS_TOL_DEG` (referencia `azel_spice` frente a Horizons, acimut y elevación) | 0,0005 | ° | `05` §8.3 | `pipeline/tests/test_ephem_frames.py` |
| `MOON_ME` frente a `MOON_PA`, máximo de \|Δ elevación\| en 2025: IM-2 previsto; Blue Ghost 1; tolerancia; mínimo exigido | 0,0227; 0,0156; ± 0,002; > 0,010 | ° | `05` §8.5 (cifras medidas del plan) | `pipeline/tests/test_ephem_frames.py` |
| TDB − UTC desde 2017: 32,184 s + 37 s; término periódico (tolerancia) | 69,184; 0,002 | s | `naif0012.tls` (`DELTET/DELTA_T_A`, `DELTET/DELTA_AT`, `DELTET/K` = 1,657 ms); `05` §2 (ΔAT = 37 s) | `pipeline/tests/test_ephem_frames.py` |
| Puesta del centro del Sol en Blue Ghost 1 con Luna lisa: 2025-03-16T20:10:39Z (± 1 s, redondeo al segundo) | 39 | s tras las 20:10 | `05` §8.3 | `pipeline/tests/test_ephem_frames.py` |
| Tabla ENU a mano: tolerancias | 10⁻⁹; 10⁻⁶ | °; km | `05` §8.2 | `pipeline/tests/test_enu.py` |
| Blue Ghost 1 en `MOON_ME`: (778,06; 1451,68; 553,01) km a mano y `Dxy` = 1647,03931 km, `Dz` = 553,01019 km de Horizons (tolerancia: media unidad de la última cifra impresa) | — | km | `03` §3.4 | `pipeline/tests/test_enu.py` |
| Rangos de fecha de aterrizaje admitidos | 1969-01-01 – 1973-01-01 y 2024-01-01 – 2045-01-01 (UTC) | — | Validez de los tramos de `ephemeris.meta.json` (`09` §3.2, `05` §4.5) | `web/src/state/selectors.ts` (`SUPPORTED_RANGES`) |
| Duración de la misión | 0,5 – 60, paso 0,5 | días | `10_interfaz.md` §4, `01_alcance.md` F2 | `web/src/state/selectors.ts` |
| Paso del deslizador del cursor | 600 (flechas); 86.400 (PageUp/PageDown); 3.600 (botones y `[` `]`) | s | `10_interfaz.md` §4, §12 | `web/src/state/selectors.ts`, `ui/controls/TimeControls.tsx` |
| Panorama: vista, umbral de recentrado, zoom y rejillas | 40° × 20°; 8°; 4° × 2°; 5° y 0,5° | ° | `10_interfaz.md` §6.1 | `web/src/ui/panorama/geometry.ts` |
| Tira de 360°: rango de elevación | −15 a +15 | ° | D-74 | `web/src/ui/panorama/geometry.ts` (`STRIP_MIN_EL`, `STRIP_MAX_EL`) |
| Enlace compartible: versión, prefijo del fragmento e intervalo mínimo entre escrituras | 1; `#s=`; 500 | —; —; ms | `10_interfaz.md` §10 («como mucho dos veces por segundo») | `web/src/state/url.ts` (`URL_VERSION`, `HASH_PREFIX`, `URL_WRITE_INTERVAL_MS`) |
| Rango admitido de `maxNightHours` en un enlace | 0 – 400 | h | `07_visibilidad.md` §8.1 («editable: 0–400») | `web/src/state/url.ts` (`MAX_NIGHT_HOURS_RANGE`) |
| Móvil: objetivo táctil mínimo; alto de la vista principal; columnas del panel de cifras | 44 × 44; 55 % del alto de pantalla; 3 | px; —; — | `10_interfaz.md` §12 («Táctil»), §3.2 | `web/src/styles/app.css` (bloque T-20) |
| Móvil: hueco reservado bajo la página para la barra de tiempo fija (`--timebar-h`) | 144 | px | Medido (T-20): la barra mide 136 px a 390 × 844 con controles de 44 px (tres filas); 8 px de margen | `web/src/styles/app.css` |

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

### T-09 · Máscaras de sitio en disco (2026-11-14)

Constantes nuevas (todas en `pipeline/horizon/site_mask.py` salvo indicación):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `EL_DECIMALS`, `LATLON_DECIMALS`, `HEIGHT_DECIMALS`; `dist_m` entero | 4, 5, 1 | `06_horizonte.md` §5, `09_contrato_datos.md` §5 |
| `USAGE_DECIMALS` (`stats.grid_usage`) | 6 | Elegido (D-84 g) |
| `EPHEMERIS_BYTES` | 5.260.176 | `09_contrato_datos.md` §3.1 |
| `DEFAULT_LAW` | `full` | `06_horizonte.md` §1 |
| Orden del lote (`pipeline/common/catalog.py`) | Grupos 1–3 | `04_catalogo_sitios.md` §6 |
| `SLDEM_LAT_MAX_DEG` (prueba) | 50,1° | `04_catalogo_sitios.md` §7 |
| x, y de las regiones (prueba, ± 10 m) | Tabla | `04_catalogo_sitios.md` §3 |

Medido con los DEM reales (`python -m pipeline.cli site-mask --site <id>`, ley `full`, 2 m y 10 m,
P1 y P2 mapeados en memoria, primera ejecución tras abrir los ficheros):

| Sitio | Relieve | Cota del sitio | Horizonte (2 m) | Tiempo | `horizon/*.json` | `profile/*.bin.gz` |
| --- | --- | --- | --- | --- | --- | --- |
| `shackleton-floor` | `LOLA polar 40 m + 120 m` (P1 0,9998; P2 0,0002) | −2.788,9 m | 19,7727° … 23,5789° | 2,32 s (incluye abrir P1 y P2) | 58.107 B | 597.893 B |
| `im-2` | Ídem (P1 0,9532; P2 0,0468) | 5.321,7 m | −1,4687° … 4,0642° | 0,91 s | 55.956 B | 608.400 B |
| `region-malapert-massif` | Ídem (P1 0,9728; P2 0,0272) | 4.769,5 m | −4,6207° … 6,9658° | 0,91 s | 55.600 B | 623.891 B |
| `blue-ghost-1` | `SLDEM2015 59 m` (recorte) | −3.652,4 m | 0,1300° … 3,0476° | 1,88 s | 54.531 B | 409.461 B |

Esperado: 1–5 s por máscara (`06` §11) y 0,7–0,9 s según T-08; `shackleton-floor` con `min_el_deg` > 10°
(borde a unos 21°, tarjeta T-09). Ningún acimut truncado ni vacío, sin muestras sin dato. Dos ejecuciones
dan los mismos bytes. `profile-csv` en `region-malapert-massif`, acimuts 0°, 120° y 240° (los de A5):
5,2163° a 40 m, −0,5394° a 4.380 m y −3,3872° a 180 m, iguales a `el_deg` de la máscara.

Tamaños frente a lo previsto: el JSON ocupa ~28 kB por altura (previsto ~35 kB, `09` §5); el perfil
comprimido ocupa 0,41–0,62 MB (previsto 0,2–0,4 MB, `09` §6). Con 37 sitios con máscara el origen ligero
pasaría de los 25 MB de `09` §1 (≈ 5,3 MB de efemérides + ≈ 24 MB de máscaras y perfiles): aviso para I3
en el traspaso.

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

### T-04 · Referencia SPICE y marcos (2026-11-14)

Medido en el portátil de I1 con los cuatro núcleos de `$LLSN_DATA_DIR/kernels` (`pytest -s
pipeline/tests/test_ephem_frames.py`).

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| Prueba del `.tf`: Tierra respecto a la Luna en ET = 717768000,0, `MOON_ME`, sin corrección | (374008,6544; −23435,9701; 10141,3339) km | (374008,654; −23435,970; 10141,334) ± 0,001 km | `03_datos_y_fuentes.md` §2 |
| `azel_spice` frente a Horizons, 15 filas de `horizons_smoke.csv`: máximo de \|Δ acimut\| y de \|Δ elevación\| | 3,6·10⁻⁷° y 4,6·10⁻⁷° | < 0,0005° (cifra del plan: < 0,000001°) | `05_efemerides.md` §8.3 |
| Ídem, distancia (9 filas que la llevan): máximo de \|Δ distancia\| | 0,004 km | — (se informa; no hay tolerancia en la especificación) | — |
| `MOON_ME` frente a `MOON_PA`, máximo de \|Δ elevación\| (Sol o Tierra) en las 8.760 horas de 2025: IM-2 previsto (84,78° S, 29,13° E) | 0,02274° | 0,0227° ± 0,002° | `05` §8.5 |
| Ídem, Blue Ghost 1 (18,56° N, 61,81° E) | 0,01558° | 0,0156° ± 0,002° | `05` §8.5 |
| Puesta del centro del Sol en Blue Ghost 1, Luna lisa (interpolación lineal entre 20:10 y 20:11 UTC del 2025-03-16) | 20:10:39,08 UTC (elevaciones 0,005209176° y −0,002787842°) | 20:10:39 UTC | `05` §8.3 |
| `utc_iso_to_et('2022-09-30T00:00:00Z')` − 717768000 | 69,18235 s | 69,184 s ± 0,002 s | `naif0012.tls` |
| `test_enu.py` + `test_ephem_frames.py` (37 pruebas; unas 70.000 llamadas a `spkcpo` en la prueba de marcos), ejecutadas solas | 2,9 s | — | — |

### T-06 · Tabla de efemérides (2026-11-14)

Constantes nuevas (`pipeline/ephem/table.py`, `pipeline/tests/test_ephem_table.py`):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `SEGMENTS` (`main`, `apollo`: `t0_unix`, `n`, `byte_offset`, validez) | Tabla de `05` §4.2 | `05_efemerides.md` §4.2 |
| `EPHEMERIS_BYTES` | 5.260.176 B | `05` §4.2 y §8.7 |
| `RECORD_BYTES`, `RECORD_FIELDS` | 24 B; `sun_x … earth_z` | `05` §4.3, `09` §3.2 |
| `FRAME_SPICE` | `MOON_ME_DE440_ME421` | `09` §3.2 (`moon_de440_250416.tf`) |
| `TABLE_TOL_DEG` | 0,001° | `05` §8.3 y §8.4 |
| `GRID_TOL_DEG` | 0,00003° | `05` §8.4 con la decisión D-75 (antes 0,00002°) |
| `SUN_KM`, `EARTH_KM`, `LIBRATION_MAX_DEG`, `SAMPLE_REL_TOL` | (1,45–1,53)·10⁸ km; (3,5–4,1)·10⁵ km; 12°; 10⁻⁷ | `05` §8.7 |
| `SUN_RADIUS_DEG`, `EARTH_RADIUS_DEG` | 0,26–0,28°; 0,89–1,05° | `05` §5 |
| `DIAM_TOL_ARCSEC` | 0,05″ | Misma cifra que la prueba web de T-12 (D-76 e) |
| `SAMPLE_COUNT`, `SAMPLE_SEED` | 50; 6 | `11_validacion.md` §3 (50 muestras); semilla elegida (D-76 b) |
| c (solo en la cota de `05` §4.1) | 299.792.458 m/s | Definición del SI |

Medido con los cuatro núcleos de `$LLSN_DATA_DIR/kernels` y la tabla publicada:

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| `make ephem` (219.174 muestras, más las 50 de `ephem_sample.json`) | 13,1 s; 5.260.176 B | < 60 s; 5.260.176 B | `05` §4.4, §7 |
| Módulos en todas las muestras | \|sun\| 1,4670·10⁸–1,5249·10⁸ km; \|earth\| 356.444,8–406.703,6 km | Dentro de los límites del §8.7 | `05` §8.7 |
| Máximo de acos(earth_x/\|earth\|) | 10,47° | < 12° | `05` §8.7 |
| Muestra k = 1 de `main` frente a `spkpos`: error relativo máximo por componente | 2,2·10⁻⁸ | < 10⁻⁷ | `05` §8.7 |
| Tabla frente a `spkcpo`, 2.000 pares al azar: máximo de \|Δaz\|·cos(el) y \|Δel\| | 0,0000268° | < 0,001° | `05` §8.4 |
| Ídem, 200 instantes en la rejilla | 0,0000263° | < 0,00003° (D-75) | `05` §8.4 |
| Término de aberración trasladada (`V − p` con `LT+S`), sitio a 1.739,4 km del centro | 0,175 km; 0,000026° para la Tierra | Cota \|p\|·β ≈ 0,000028° | `05` §4.1 (D-75) |
| Tierra con `float64` (sin redondeo a `float32`) en la rejilla | 0,0000263° (igual) | — | — |
| Velocidad angular en el cielo lunar, 2024–2044 (rejilla horaria) | Sol 0,505–0,511°/h; Tierra 0,062°/h de mediana y 0,113°/h como mucho | — | — |
| `sky_at` frente a las 15 filas de Horizons: máximo de \|Δaz\| y \|Δel\| | 0,0000181° | < 0,001° | `05` §8.3 |
| Ídem, diámetro aparente (9 filas) | 0,0033″ | < 0,05″ | D-76 e |
| `test_ephem_table.py` (24 pruebas) ejecutada sola | 0,8 s | — | — |

## T-05 · Valores de referencia de Horizons (A1, A2)

| Constante | Valor | Fuente |
| --- | --- | --- |
| Tolerancias de `tests/golden/tolerances.json` | Las 16 cifras del §1 | `11_validacion.md` §1 (copiadas sin cambios) |
| `API_VERSION`, líneas obligatorias de la cabecera | `1.2`; `MEAN_ME`, radios 1737,4 km, `NO (AIRLESS)` | `11` §2.2 |
| `MIN_INTERVAL_S`, `RETRY_WAIT_S` | 1 s entre consultas; 10 s tras un error HTTP | `11` §2.2 |
| `MAX_ATTEMPTS` | 4 | Elegido (D-80 e); no afecta a ningún valor |
| Sitios, instantes y consultas de A1 y A2 | 8 sitios × 8 instantes; 3 sitios, marzo de 2025, 1 h y 1 min, ±60 min | `11` §2.3 y §2.4 |
| `A1_EXPECTED_MAX_DEG` | 0,001° (se informa, no es el criterio) | `11` §4, A1 |
| `BG1_SUNSET`, `BG1_SUNSET_TOL_S` | 2025-03-16T20:10:39Z; 1 s (la cifra tiene resolución de 1 s) | `05` §8.3, `11` §2.4 |
| `FINE_ROWS` | 121 | `11` §2.4 (de −60 a +60 min con paso de 1 min) |
| `STEP_S` de A2 | 600 s | `07` §6.2 (paso por defecto de `find_crossings`) |
| `A2_EXPECTED_MAX_S` | 15 s (se informa) | `11` §4, A2 |

Medido (`make golden`, 2026-11-14, 27 s con 26 consultas):

| Qué | Valor medido | Esperado |
| --- | --- | --- |
| A1, `azel_spice` frente a Horizons, 128 filas: máximo de \|Δaz\|·cos(el); de \|Δel\| | 5,7·10⁻⁷°; 5,5·10⁻⁷° | < 0,02° (tolerancia); < 0,001° (esperado) |
| A1, tabla (`sky_at`) frente a Horizons: ídem | 1,2·10⁻⁶°; 2,5·10⁻⁵° | < 0,02° |
| A2, puesta lisa de Blue Ghost 1 (interpolación lineal de Horizons) | 2025-03-16T20:10:39,07Z | 20:10:39 |
| A2 con una `find_crossings` provisional (pseudocódigo de `07` §6.2, solo en la sesión, no integrada) | 0,5 s de diferencia máxima | < 5 min; < 15 s esperado |

