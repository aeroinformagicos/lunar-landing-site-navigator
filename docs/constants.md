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
| B1: tolerancia del % de disco en pantalla (más el medio paso del redondeo entero) | 10⁻⁴ (10⁻⁶ en fracción) | % | `07_visibilidad.md` §12.4 (fracciones 10⁻⁶); B1 solo da `B1_deg` y `B1_min` | `web/e2e/b1.spec.ts` |
| B1: tolerancia de un % de tiempo en pantalla (más el medio paso del redondeo entero) | `B1_min` / (D·24 h) × 100 | % | `tests/golden/tolerances.json` (`B1_min`) llevado al porcentaje de la misión (`07` §7: horas ÷ duración × 100) | `web/e2e/b1.spec.ts` |

| Vista 3D: función de fase lunar-Lambert de McEwen `L(α) = 1 + A1·α + A2·α² + A3·α³` (α en grados), recortada a [0, 1] | A1 = −0,019; A2 = 0,000242; A3 = −0,00000146 | 1/°, 1/°², 1/°³ | USGS ISIS, modelo fotométrico `LunarLambertMcEwen` (`LunarLambertMcEwen.cpp`, ISIS 8.1/9.0), a partir de McEwen (1991), *Icarus* 92, 298–311 (`16_vista_3d.md` §6.2) | `web/src/ui/stage3d/scene/shaders.ts` (`TERRAIN_FRAG`) |
| Vista 3D: muestras de la sombra proyectada (primera distancia, razón, alcance, altura del ojo) | 250; 1,04; 300.000; 2 | m; —; m; m | `16_vista_3d.md` §6.3 (medio píxel de 500 m; la razón del código de distancia del cubo, `09` §10.2; el alcance del perfil, `06` §8; observador de CLAUDE.md §2) | `web/src/ui/stage3d/shadow.ts` |
| Vista 3D: órbita (distancia mínima y máxima, inclinación, holgura, encuadre inicial) | 300 m – 800 km; 3°–89°; 50 m; 45 km a 22° | m; °; m | `16_vista_3d.md` §7.1, §7.6; encuadre de D-110 a | `web/src/ui/stage3d/camera.ts` (`ORBIT`) |
| Vista 3D: vuelo (holgura, altura máxima, velocidad = 0,8·AGL entre 20 m/s y 80 km/s, ×5 con Mayúsculas, paso máximo) y a ras de suelo (holgura, campo de visión 20°–90°, 60° al entrar) | 5 m; 2.000 km; 0,8 /s, 20 m/s, 80 km/s, 5; 0,1 s; 2 m; 20°–90°; 60° | m; m; 1/s, m/s; s; m; ° | `16_vista_3d.md` §7.2, §7.3, §7.6 | `web/src/ui/stage3d/navigation.ts` (`FLY`, `GROUND`) |
| Vista 3D: vuelos «Go to» (duración = clamp(0,8 + 0,4·log10(km + 1), 0,8, 3) s; altura máxima = max(d0, d1, 0,6 × separación)) y suavizado de la órbita (τ) | 0,8–3 s; 0,6; 65 ms | s; —; ms | `16_vista_3d.md` §7.4; τ de D-110 f | `web/src/ui/stage3d/navigation.ts`, `scene/engine.ts` |
| Vista 3D: señales (cúpula de las trayectorias, elevación de contornos y crestas, distancias de los rótulos, máximo de rótulos, refrescos) | 20 km; 15 m y 30 m; 250 km y 60 km; 14; 200 ms y 100 ms | m; m; m; —; ms | `16_vista_3d.md` §8; D-110 | `web/src/ui/stage3d/index.tsx`, `Labels.tsx`, `signals.ts` |
| Vista 3D: barra de escala | 1, 2 o 5 × 10ⁿ m entre 60 y 150 px | px | `16_vista_3d.md` §8.6; D-110 e | `web/src/ui/stage3d/signals.ts` (`scaleBar`) |
| Vista 3D: niveles de calidad (malla, sombra, frecuencia, píxeles) y umbral adaptativo | `16` §12.2; 45 fps durante 2 s, una bajada cada 10 s | — | `16_vista_3d.md` §12.2 | `web/src/ui/stage3d/quality.ts` |
| Vista 3D: parámetros visuales (intensidades, albedo, colores del Sol y la Tierra, estrellas) | `LOOK` | — | Solo visuales, sin significado físico ni efecto en ninguna cifra (D-97 h) | `web/src/ui/stage3d/look.ts` |
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

### T-10 · Referencia de visibilidad en Python (2026-11-14)

Constantes nuevas (`pipeline/vis/`, `pipeline/tests/test_vis_*.py`, `test_b3_eclipse.py`):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `DISC_STRIPS`, `MIN_COS_EL` (franjas del disco y cota inferior de cos(el)) | 32; 0,05 | `07_visibilidad.md` §4.1 (mismos valores que `web/src/core/visibility.ts`) |
| `ANY_COLUMNS` (columnas del criterio «cualquier fracción», en radios del disco) | −0,8; −0,4; 0; 0,4; 0,8 | `07` §4.2 |
| `SCAN_STEP_S` (paso de búsqueda de cruces) | 600 s | `07` §6.1 (mismo valor que `web/src/core/events.ts`) |
| `FORMULA_ARGS` (máscaras por fórmula: `flat`, `tilt`, `sine`) | 1; 1; 2 argumentos | `07` §12.3 |
| `DEG` | π/180 | Definición del grado; escrito como en `web/src/core/eclipse.ts` (D-89 b) |
| `RHO_SUN`, `RHO_EARTH` / `A`, `B` (radios aparentes de las pruebas) | 0,265°; 0,95° | `07` §13.2 y §13.5 |
| `SEGMENT_TOL` / `DISC_TOL` (32 franjas frente al segmento circular exacto) | 0,003 | `07` §13.2 |
| Tabla de `horizon_at` (máscara `el[j] = j`) | 0,25 → 0,5; 359,75 → 359,5; 360 → 0; −0,5 → 719 | `07` §13.1 |
| Luna lisa a 2 m: elevación y distancia de tangencia | −0,0869°; 2.636 m | `06_horizonte.md` §9 |
| Puesta lisa de Blue Ghost 1 (18,56° N, 61,81° E), 0 m; tolerancia | 2025-03-16T20:10:39Z; ± 10 s | `07` §13.3 (Horizons, `05` §8.3) |
| Salida lisa en el sitio previsto de IM-2 (84,78° S, 29,13° E), 0 m; tolerancia | 2025-03-04T09:14:10Z; ± 20 s | `07` §13.3 (Horizons, `05` §8.3) |
| Puesta lisa de Blue Ghost 1 con el observador a 2 m; tolerancia | 2025-03-16T20:21:31Z; ± 15 s | `07` §13.3 |
| Filas de Horizons del Sol y la Tierra en Blue Ghost 1 (18:15, 20:10 y 20:11 del 16/03/2025); `TABLE_TOL_DEG` | Tabla de `05` §8.3; 0,001° | `05_efemerides.md` §8.3 |
| B3: sitio, cifras de comprobación del plan y tolerancia de regresión | 18,562° N, 61,810° E, 0 m; 05:01, 06:17:30, 08:34:00 y 09:51 UTC del 14/03/2025; ± 60 s | `07` §13.4; `11_validacion.md` §4 (B3) |
| B3: horas de Firefly y tolerancia | `tests/golden/events_published.csv`; `B3_min` = 5 min de `tolerances.json` | `11` §1 y §3 |
| B3: instante con el Sol tapado del todo | 2025-03-14T07:30:00Z | `07` §13.4 |
| Lente de dos discos unidad a distancia 1 (prueba del solape) | 2π/3 − √3/2 | Geometría elemental (dos segmentos circulares de 120°) |
| Día lunar en Blue Ghost 1 (prueba de ventanas): medio mes sinódico; holgura | 14,77 d; ± 0,1 d | Mes sinódico de 29,53 d (`09` §13); `07` §13.7 («la noche dura unos 14,8 días») |
| (−89,9°, 0°): sitio donde la Tierra sale y se pone (prueba de `find_events`) | \|elevación de la Tierra\| < 7,5° | `07` §13.6 |

Medido con la tabla publicada (`web/public/data/ephemeris.bin`) y los cuatro núcleos:

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| Puesta lisa de Blue Ghost 1, 0 m | 2025-03-16T20:10:39Z (0 s) | 20:10:39 ± 10 s | `07` §13.3 |
| Salida lisa en el sitio previsto de IM-2, 0 m | 2025-03-04T09:14:10Z (0 s) | 09:14:10 ± 20 s | `07` §13.3 |
| Puesta lisa de Blue Ghost 1, observador a 2 m | 2025-03-16T20:21:31Z (0 s) | 20:21:31 ± 15 s | `07` §13.3 |
| A2 (7 cruces de marzo de 2025 en `apollo-11`, `blue-ghost-1` y `change-3`): máximo de \|Δt\| | 0,5 s | < 5 min; esperado < 15 s | `11` §4 (A2) |
| B3 sobre la tabla: inicio, totalidad y fin | 05:00:46; 06:17:27–08:34:27; 09:51:13 UTC | 05:01; 06:17:30–08:34:00; 09:51 (± 60 s) | `07` §13.4 |
| B3: máximo de \|Δt\| frente al plan / frente a Firefly | 27 s / 47 s | 60 s / 5 min | `07` §13.4; `tolerances.json` |
| B3 solo con SPICE (`spkcpo`, sin tabla) frente a la tabla | Los cuatro sucesos iguales al segundo | — | — |
| Python frente al núcleo de la web (comprobación de la sesión, no versionada): `horizon_at`, 460 casos | 3·10⁻¹⁷° | 10⁻⁶° | `07` §12.4 |
| Ídem, `disc_fraction`, 1.500 casos (6 máscaras reales y 4 por fórmula) | 0 (idénticos) | 10⁻⁶ | `07` §12.4 |
| Ídem, `evaluate`, 1.925 casos (6 sitios reales a 2 m y 10 m, y el eclipse de B3: 56 parciales y 47 totales) | Ángulos 7·10⁻¹³°; fracciones 8·10⁻¹⁴; distancias 0 km; estados idénticos | 10⁻⁶°; 10⁻⁶; 10⁻³ km | `07` §12.4 |
| Ídem, sucesos y ventanas, 13 intervalos de 45 a 61 días (138 sucesos) | Iguales al segundo | ± 1 s | `07` §12.4 |
| Coste en Python: `sky_at` / `evaluate` | 31 µs / 39 µs | — | — |
| Las 86 pruebas nuevas, ejecutadas solas | 1,5 s | — | — |

### T-22 · Pruebas con datos reales e informe de validación (2026-11-14)

Constantes nuevas (`pipeline/tests/test_a3_blueghost_sunset.py`, `test_a8_sanity.py`, `test_a10_im2.py`,
`pipeline/cli/report.py`):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| A3: sitio, máscara y observador | `blue-ghost-1`, 18,562° N, 61,810° E; SLDEM2015; 2 m | `11_validacion.md` §4 (A3) |
| A3: ventana de la puesta (`WINDOW_START`; fin = `sunset_latest`) | 2025-03-16, 18:00–18:15 UTC | `11` §4 (A3); `tests/golden/events_published.csv` |
| A3: tolerancia | `A3_min` = 30 min de `tolerances.json` (pasa entre 17:30 y 18:45 UTC) | `11` §1 y §4 |
| A3: horizonte que implica la ventana y acimut del Sol poniente (`EXPECTED_HORIZON_DEG`, `SUNSET_AZ_DEG`) | ~0,9°; 269,7° (se informan, no son criterio) | `11` §4 (A3) |
| A3: elevación del Sol a las 18:15 UTC (Horizons, 0 m) | 0,924849952° (se informa) | `05_efemerides.md` §8.3 |
| A3: puesta lisa a 0 m | 2025-03-16T20:10:39Z | `05` §8.3; `11` §4 |
| A8: Chang'e 4 | −45,4561°, 177,5885° | `contract/sites.catalog.json` |
| A8: puntos (0°, 0°) y (−90°, 0°); límites | Tierra > 75°; \|Sol\| < 1,6°; \|Tierra\| < 7,5° | `11` §4 (A8) |
| A8: rejilla | Cada hora de 2024-01-01T00:00Z a 2045-01-01T00:00Z (tramo `main`) | `11` §4 (A8); `05` §4.4 |
| A8 y A10: tabla frente a SPICE en los instantes comprobados (`TABLE_VS_SPICE_DEG`) | 0,001° | `05` §8.4 |
| A10: sitio | `im-2-planned`, 84,78° S, 29,13° E | `11` §4 (A10) |
| A10: salida lisa a 0 m y su tolerancia (`SUNRISE`, `SUNRISE_TOL_S`) | 2025-03-04T09:14Z; ± 2 min | `11` §4 (A10); tarjeta T-22 |
| A10: elevación del Sol a las 17:30 UTC del 06/03 y su tolerancia | 2,46°; ± 0,01° | `11` §4 (A10), Horizons `05` §8.3 (2,464349919°); tarjeta T-22 |
| A10 con relieve: observador | 2 m (máscara LOLA polar) | `07_visibilidad.md` §1 (alturas de las máscaras) |
| Informe: titulares y su orden; figuras de `A7B7` | B3, A3, A7B7; `validation/a7b7_scatter.png`, `validation/a7b7_diff_map.png` | `09_contrato_datos.md` §7 y §7.1 |
| Informe: casos manuales | A5, A11, B8, B9, B10, B11 | `11` §7.1 |
| Informe: hora de los titulares | Redondeada al minuto (medio minuto hacia arriba) | Elegido (D-92 d) |

Medido (tabla publicada, máscaras publicadas de T-21, cuatro núcleos):

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| **A3: puesta del centro del Sol, SLDEM2015, 2 m** | **2025-03-16T18:53:55Z (38,9 min después de las 18:15)** | **17:30–18:45 UTC** | `11` §4 (A3) |
| A3: mitad del disco puesta (fracción 0,5) | 18:53:55 UTC | — | — |
| A3: disco puesto del todo (fracción 0) | 19:28:03 UTC | — | — |
| A3: horizonte en el acimut 269,7° | 0,618° | ~0,9° | `11` §4 (A3) |
| A3: elevación del Sol a las 18:15 UTC (observador a 2 m sobre el relieve) | 0,9248° | 0,9248° (Horizons, 0 m) | `05` §8.3 |
| A3: puesta lisa a 0 m | 20:10:39 UTC (0 s) | 20:10:39 | `05` §8.3 |
| A8: elevación máxima de la Tierra en Chang'e 4 | −37,12° (2024-09-25T03Z; SPICE −37,12°) | < 0° | `11` §4 |
| A8: elevación mínima de la Tierra en (0°, 0°) | 79,49° (2033-10-14T15Z) | > 75° | `11` §4 |
| A8: \|elevación del Sol\| máxima en el polo sur | 1,590° (2044-06-10T09Z) | < 1,6° | `11` §4 |
| A8: \|elevación de la Tierra\| máxima en el polo sur | 7,109° (2038-01-13T05Z) | < 7,5° | `11` §4 |
| A8: instantes comprobados | 184.105 (0,3 s) | — | — |
| A10 liso: salida | 2025-03-04T09:14:10Z (10 s) | 09:14 ± 2 min | `11` §4; tarjeta |
| A10 liso: elevación del Sol el 06/03 a las 17:30 UTC | 2,464350° (SPICE 2,464350°) | 2,46 ± 0,01° | `11` §4; tarjeta |
| A10 con relieve (LOLA 40 m + 120 m, 2 m): salida | 2025-03-06T00:11:07Z (+38,9 h) | Más tarde | `11` §4 |
| A10 con relieve: margen del Sol a las 17:30 UTC | 1,684° (horizonte 0,780°) | Más bajo que 2,464° | `11` §4 |
| A1 (tabla): valores comparados y error máximo | 256; 2,5·10⁻⁵° | < 0,02° | `11` §4 |
| `make report` | 21 casos publicados: 4 pass, 1 fail (A3), 16 skipped | — | — |

### T-26 · Referencia de visibilidad, parte II (2026-11-14)

Constantes nuevas (`pipeline/vis/metrics.py`, `requirements.py`, `ranking.py`, `vectors.py` y sus pruebas):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `NEXT_EVENT_HORIZON_S` (búsqueda de la cuenta atrás) | 60 d | `07_visibilidad.md` §7 (igual que `web/src/core/metrics.ts`) |
| `TRUNCATED_WARNING` | `Mission extends beyond available ephemeris; results truncated.` | `07` §7 |
| `Requirements` por defecto: Sol y Tierra al aterrizar, noche máxima, margen de la Tierra, fracción del Sol | sí; sí; 24 h; 1,0°; 1,0 | `07` §8.1 |
| `NIGHT_NEAR_LIMIT`; `SUN_FRACTION_EPS` | 0,75; 10⁻⁹ | `07` §8.2 |
| `GRID_S`, `MATRIX_COLUMNS`, pasos Δ | 600 s; 31; 6 h, 12 h, 1 d, 2 d | `07` §8.3 |
| `NEXT_WINDOW_DAYS`, paso de aterrizaje | 90 d; 1 h | `07` §8.4 |
| `STATUS_ORDER`; redondeo del ranking | go 0, marginal 1, no_go 2; 0,1 (mitad hacia arriba) | `07` §8.5 y §12.7 |
| `COUNTS` (casos por bloque de los vectores) | 200, 50, 100, 100, 20, 20, 30, 6, 4, 30 | `07` §12.3 |
| `FORMULA_MASKS` | `flat:0`, `flat:0.5`, `tilt:0.3`, `sine:1,3` | `07` §12.3 |
| `SEED`; `EDGE_DEG`; `EDGE_H` (generador de vectores) | 26; 10⁻⁶°; 0,01 h | Elección del generador (D-96 c): la semilla es arbitraria; los umbrales son la tolerancia de ángulos de `07` §12.4 y 10 veces la de horas |
| Escenarios de B1 | Los cinco de `11_validacion.md` (B1) | `11` §4; D-90 a |
| B2: aterrizaje base, duración, retrasos y estados esperados | 2025-03-02T08:34:00Z; 14 d; 0, 14 y 29,5 d → `go`, `no_go` (`night_too_long`), `go` | `07` §13.7 |
| B2: puesta del +14 d | Entre 18:00 y 20:30 UTC del 16/03/2025 | `07` §13.7 («hacia las 18:00–20:20 UTC») |
| Fechas de los eclipses del bloque `eclipse` | 2025-03-14, 2025-09-07, 2026-03-03, 2026-08-28, 2028-12-31, 2029-06-26 | `tests/golden/eclipses_nasa.csv` (Espenak, caso B4) |
| (−90°, 0°): extremos de la elevación del Sol | \|el\| < 1,6° | `07` §13.6 |

Valores medidos:

| Magnitud | Medido | Esperado | Fuente |
| --- | --- | --- | --- |
| B2, Luna lisa (2 m): +0 / +14 / +29,5 d | `go` / `no_go` (`night_too_long`, noche 324,21 h) / `go` | `go` / `no_go` / `go` | `07` §13.7 |
| B2, SLDEM2015 (2 m): +0 / +14 / +29,5 d | `go` / `no_go` (`night_too_long`, noche 325,67 h) / `go` | Ídem | `07` §13.7 |
| `core_vectors.json` | 560 casos, 0,18 MB; unos 2 min de generación (el 80 % en `assess` y `rank`) | — | — |
| `vectors.test.ts` con el fichero | 10 bloques, todos en verde (0,7 s) | Tolerancias de `07` §12.4 | `07` §12.4 |
| Dos generaciones seguidas | Ficheros idénticos byte a byte | — | D-96 c |

### T-28 · Capas, fondo del mapa y comparación con la NASA (2026-11-14)

Constantes nuevas (`pipeline/layers/layers.py`, `hillshade.py`, `compare_nasa.py` y sus pruebas):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `MEAN_START_UTC`, `MEAN_STEPS` (periodo `mean186`) | 2026-01-01T00:00:00Z; 163.152 pasos de 1 h (fin 2044-08-12T00:00:00Z) | `08_mapa_polar.md` §5.1; D-22 |
| `FIRST_STEP_INDEX` (2026-01-01T00Z en el tramo `main`) | 17.545 = 1 + 731·24 | `08` §5.2 (se comprueba contra `t0_unix` de la tabla) |
| `MONTHS`, `MONTH_STEPS_TOTAL`; febrero de 2028 | 2026-01 … 2030-12; 43.824 pasos; 696 | `08` §5.1 y §5.3 |
| `ANY_EVERY` (pasos del criterio «cualquier fracción») | 1 de cada 3 (54.384) | `08` §5.2; D-106 d |
| `ANY_COLUMNS`, `MIN_COS_EL` | −0,8, −0,4, 0, 0,4, 0,8; 0,05 | `07_visibilidad.md` §4.2 (ya en `pipeline/vis/discs.py`) |
| `PCT_PER_UNIT`, `UNITS_FULL`, `NODATA` | 0,4 %; 250; 255 | `09_contrato_datos.md` §9 |
| Redondeo de `v` | `(500·cuenta + n) // (2n)`, mitad hacia arriba | `09` §9.2; D-106 a |
| `DEFAULT_BATCH_CHUNKS`, `DEFAULT_BLOCK_STEPS` | 64 trozos (16.384 puntos); 512 pasos | `08` §5.2 (valores de ejemplo) |
| `NASA_OBSERVER_HEIGHT_M` (plan B-4) | 0 m | `03_datos_y_fuentes.md` §6 («se toma como superficie»); D-106 e |
| `HILL_STEP_M`, `HILL_W`, `HILL_H` | 250 m; 1.504 × 1.344 px | `09` §8.3 |
| `Z_FACTOR`, luz (`LIGHT_AZ_DEG`, `LIGHT_ALT_DEG`), `AMBIENT`, `DIFFUSE` | 2; L = (−cos 30°·sin 45°, cos 30°·cos 45°, sin 30°); 0,35; 0,65 | `08` §6 |
| `DEM_NODATA` de `dem_500m` | −32.768 | `09` §8.3 |
| `DN_SCALE`; rango válido de DN | 0,00004; [0, 25.000] | Etiquetas de N1–N4 (`03` §6: `SCALING_FACTOR` y mayor `DERIVED_MAXIMUM`) |
| `INNER_HALF_M` (celdas leídas de N1/N2) | 151.500 m | `08` §8.2 |
| `WINDOW` | 3 × 3 píxeles | `08` §8.2 |
| `WITHIN_PTS` | 10 puntos | `08` §8.2 |
| Umbral de B7 | r > 0,9 (se lee de `tests/golden/tolerances.json`, `B7_r_min`) | `08` §8.3; `11` §5 |
| Figuras: `SCATTER_PX`, `DIFF_PX`, `FIGURE_MAX_BYTES`, `DIFF_RANGE_PTS` | 1.200 × 600 RGB; 752 × 672 RGBA; 300 kB; ±30 puntos | `09` §7.1 |
| `DIFF_CLASS_PTS` (clases del mapa de diferencias) | 5 puntos | Elección de presentación (D-106 g) |
| Colores de las figuras | `--c-surface` #141C2A, `--c-text` #E6EBF2, `--c-text-muted` #A3AFC0, `--c-border` #273246, `--c-sun` #E69F00, `--c-earth` #56B4E9, `--c-nogo` #D55E00 | `web/src/styles/tokens.css` (paleta de Okabe e Ito, `10_interfaz.md` §2) |

Valores medidos (portátil de I1, RTX 4060 Laptop, PyTorch 2.15.0+cu132; tabla real de `web/public/data`):

| Magnitud | Medido | Esperado | Fuente |
| --- | --- | --- | --- |
| Máscara de −90° / +90°, 61 periodos | 250 / 0 en las tres bandas y en `_any` | 100 % / 0 % | `08` §5.3 |
| Luna lisa (−0,0869°) en las 4 celdas junto al polo, `mean186` | Sol 51,2 %; Tierra 48,8–49,2 %; ambos 25,2 % | Sol 45–60 %; Tierra 40–60 %; ambos ≤ mín. | `08` §5.3 |
| Ídem, criterio «cualquier fracción» | Sol 56,4–56,8 %; Tierra 53,6 % | — | — |
| Capa frente a la referencia de `07` (3 celdas con máscaras de fórmula, enero a marzo de 2026, 2.160 pasos) | Cuentas idénticas en las tres bandas, por mes y en `_any` | Diferencia ≤ 0,4 puntos | `08` §5.3 (B6 sintético) |
| PyTorch `float32` (CPU) frente a NumPy `float64`, 64 puntos × 2.000 pasos | Diferencia de cuentas ≤ 2 pasos en < 1 % de las celdas | — | D-106 c |
| Velocidad en la GPU: 16.384 puntos × 4.096 pasos | 0,45 s → **recorrido completo (505.344 puntos × 163.152 pasos) unos 9 min** | 10–30 min (diseño) | `08` §5.2 |
| Velocidad de PyTorch en CPU (10 hilos): 2.048 puntos × 4.096 pasos | 0,92 s → recorrido completo unas 2,5 h | 2–4 h (diseño) | `08` §5.2 |
| N1, N2, N4: tamaño, DN mínimo y máximo | Iguales a la etiqueta | Iguales | `03` §6 |
| N3: DN máximo del fichero | **22.396** (la etiqueta dice `DERIVED_MAXIMUM = 22397`) | Igual a la etiqueta | `03` §6 (anotado en el traspaso) |
| N5: valores presentes | −20.000, +20.000 y **0 en 5 píxeles interiores** de 25.583.364 | Solo ±20.000 | `03` §6 (anotado en el traspaso) |
| Centro de Shackleton en N1 / N5 | 0 / +20.000 | 0 / +20.000 | `03` §6 |
| Celda de Shackleton (415, 380), media 3 × 3 de N1 | 0 % (± 1) | Sombra permanente | `03` §6 |

### T-31 · Elección del par de la demo (2026-11-14)

Constantes nuevas (`pipeline/vis/demo.py` y `pipeline/tests/test_pick_demo.py`):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `FIRST_MONTH`, `LAST_MONTH` | 2027-01; 2028-12 | `04_catalogo_sitios.md` §5.1, paso 2 |
| `MIN_BOTH_A_PCT`, `MAX_BOTH_B_PCT` | 60 %; 10 % | `04` §5.1, paso 2 |
| `MAX_PAIR_DIST_M`, `RELAXED_PAIR_DIST_M` | 1.000 m (2 celdas); 2.000 m | `04` §5.1, paso 2 y relajaciones |
| `N_PAIRS` | 5 | `04` §5.1, paso 3 |
| `SEARCH_STEP_S`, `DELAY_DAYS`, `RELAXED_DELAY_DAYS` | 6 h; 12 d; 10–16 d (cada 6 h, la más cercana a 12 d primero) | `04` §5.1, paso 4 y relajaciones; D-108 |
| `MISSION_DAYS`, `OBSERVER_HEIGHTS_M`, `LAW` | 14 d; 2 y 10 m; `full` | `04` §5.1, pasos 3 y 4 |
| `PAIR_RELIEF` | `lola_polar` | El relieve de las regiones candidatas del catálogo (`04` §3) |
| `LATLON_DECIMALS` (coordenadas de A y B) | 5 | Como `horizon/<site>.json` (`06` §5); D-108 |

Cifras medidas con los datos reales (cubo completo, capas `computed`, 2026-11-14):

| Medida | Valor |
| --- | --- |
| Parejas que cumplen el paso 2 a ≤ 1.000 m | 103 (57 con su mejor mes en 2028-10) |
| Media de «ambos» en las celdas de regiones, 2027-01 … 2028-12 | 11,5 % (2027-05) … 33,7 % (2028-10) |
| Parejas con fecha sin relajar / con relajación 1 / sin fecha | 3 / 1 / 1 |
| Evaluaciones completas de `assess` | 484 |
| Duración de `pick-demo` | 451 s |

### T-34 · Máscaras compactas (2026-11-14)

Constantes nuevas (`pipeline/horizon/compact.py` y `pipeline/tests/test_compact.py`):

| Nombre | Valor | Fuente |
| --- | --- | --- |
| `MAGIC`, `HEADER` | `LLSNCMP1`; cabecera de 32 B | `09_contrato_datos.md` §11 |
| `N_AZ_COMPACT`, `STEP_CDEG` | 180 acimuts; paso de 200 centésimas de grado (2°) | `09` §11 |
| `WINDOW` | 2 acimuts completos a cada lado de `4·b` (± 1°) | `09` §11, `el_q[b] = max(q[(4b + m) mod 720], m = −2…2)` |
| `OVERVIEW_STEP` | 4 (un punto de cada 4 en cada dirección; i, j = 0, 4, 8, …) | `09` §11; el origen en 0 es D-109 |
| `REGION_NONE` | 255 | `09` §11 |
| `REGION_POINTS`, `OVERVIEW_POINTS` (pruebas) | 10.252; 188 × 168 = 31.584 | `09` §11 |

Cifras medidas:

| Medida | Valor |
| --- | --- |
| Puntos por región con las cajas del catálogo | de Gerlache Rim 2 484, Haworth 1.156, Malapert Massif 576, Mons Mouton 324, Mons Mouton Plateau 5.776, Nobile Rim 1 484, Nobile Rim 2 484, Peak near Cabeus B 484, Slater Plain 484 (total 10.252, sin solapes) |
| `regions` sin comprimir | 32 + 368 · 10.252 = 3.772.768 B |
| Leer y compactar un trozo del cubo | ~6 ms → ~12 s para los 1.974 trozos (estimado con un trozo sintético) |

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

## T-53 / T-54 · Interfaz (UX de Málaga y consola)

| Constante | Valor | Fuente |
| --- | --- | --- |
| `WELCOME_KEY` | `llsn.welcome.closed` (valor `1`) | `14` §1; D-93 |
| Tamaño mínimo de `Button` y de los controles | 44 × 44 px, 8 px de separación | `14` §6 |
| Cifra principal del panel / su etiqueta | 28 px / 14 px | `14` §4 |
| `VIEW_MAX_H` del panorama | 240 px (antes 200) | T-54 (cabe en 1280 × 720) |
| `ZOOM_W`, `SIDE_W` | 200 px (antes 236) | T-54 |
| Zoom mínimo; margen del zoom adaptable | 4° × 2° (×10); 1,5 × (separación + diámetro del disco) | `10` §6.1; D-94 |
| Columnas izquierda / derecha | 232 px / 320 px | T-54 |
| `--c-accent` / `--c-on-accent` | #DCE5F0 / #0D1320 | D-94 |
