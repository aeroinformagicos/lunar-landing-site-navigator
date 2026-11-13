# 12 · Tareas

Tarjetas en orden de construcción. La primera orden del hackathon es **«haz T-01»**. Cada tarjeta se copia a `docs/tasks/T-xx.md` (lo hace T-01) y se ejecuta con una sesión limpia de Claude Code y el mensaje «haz T-xx». Una tarjeta = una rama = una petición de integración.

Carriles: **I1** cálculo (cuenta 1) e **I2** web (cuenta 2). El caso base son **dos cuentas**: I3 no programa (define, integra, opera el cómputo y prueba) y las tarjetas de integración que llevan código las ejecuta la cuenta indicada en cada una. Si aparece una tercera cuenta, se aplica el §12. Tamaño en tiempo de Claude Code: **S** hasta 45 min, **M** de 45 a 90 min, **L** de 90 a 120 min. Ninguna pasa de 2 h.

Toda tarjeta termina con: `make test` en verde, `make check` sin avisos nuevos, contrato respetado, una línea en `AI_USAGE.md`, fuentes nuevas en `SOURCES.md` y nota de traspaso en `docs/handoff/T-xx.md` (qué se hizo, qué queda, cifras medidas).

## 1. Vista general

| Bloque | Tarjetas | Hito |
| --- | --- | --- |
| M0 Esqueleto | T-01, T-02, T-03 | Pruebas con una orden y URL de previsualización |
| M1 Efemérides | T-04, T-05, T-06 | A1 y A2 en verde (integración de las 11:00) |
| M2 Motor de horizonte | T-07, T-08, T-09 | A4 en verde y tres sitios reales (12:30–13:30) |
| M3 Núcleo de visibilidad | T-10 (Python), T-11, T-12, T-13 (web) | Mismos resultados en Python y TypeScript |
| M4 Interfaz mínima | T-14 a T-20 | Control de las 15:30; con dos cuentas las vistas se cierran entre las 19:15 y las 22:45 (§11) |
| M5 Lote de sitios | T-21 | 14 sitios publicados |
| M6 Validación | T-22, T-23 | **Hito 1: base validada, sábado 17:30** |
| Ruta crítica de la demo | T-24 a T-31, T-39 | **Hito 2: sábado noche, 00:30** (con dos cuentas, T-29, T-31 y T-39 entran el domingo a las 10:45) |
| Resto de P1 | T-32 a T-38 | **Hito 3: domingo 11:30** |
| P2 y P3 | T-40 a T-52 | Solo si P1 está integrado |

### 1.1 Ruta crítica

```
T-01 ─┬─ T-04 ─ T-06 ─┐
      │               ├─ T-10 ─ T-22 ─ [PUNTO A, sáb 16:30] ─ T-26 ─ T-27 ─ T-30 ─ [HITO 2]
      ├─ T-07 ─ T-08 ─ T-09 ─┘                                   
      │          └─ T-24 ─ T-25 (cubo, corre solo) ─ T-28 ─ T-29 (con plan B)
      └─ T-02 ─ T-11 ─ T-12 ─ T-13 ─ T-14 ─ T-16 ─ T-15 ─ T-17 ─ T-18 ─ T-23
```

La demo (T-30) depende de las máscaras de sitio, de T-27 y del par de la demo (T-31; mientras no exista, par de reserva). Solo T-29 depende del cubo, y tiene plan B.

### 1.2 Qué va en paralelo

- La cuenta 1 hace T-01 (20–30 min) y sigue con T-04. Desde el primer commit de T-01, la cuenta 2 hace T-02 y sigue con T-11: trabaja con los datos de ejemplo sin esperar a I1 (regla del plan).
- Mientras tanto I3 baja los ficheros de los grupos G0 a G3 con la lista de `03_datos_y_fuentes.md` §10 (no hace falta el script) y comprueba sus tamaños.
- T-07 y T-08 no dependen de las efemérides: I1 puede intercalarlas mientras A1 ejecuta T-05.
- T-24 (motor del cubo) es un extra de cálculo: con dos cuentas (caso base, §11) la cuenta 1 lo escribe tras la firma del punto A, de 18:00 a 19:10 (regla 2 del §1.3). I3 lanza `make cube-bench` en una terminal aparte en cuanto T-24 está en verde, aplica la regla de decisión de `08_mapa_polar.md` §4 y lanza el nivel 1 en cuanto T-25 (bucle reanudable con `LEVELS`) está integrada, hacia las 21:50. A las 00:30, antes de dormir y tras integrar T-28, lanza en cadena el resto del cubo y las capas (`make night`, T-25); las máscaras compactas se calculan el domingo tras T-34 (§11). El cubo provisional de las 15:00 del cronograma del plan no existe en el caso base: su código aún no está escrito a esa hora.
- Las descargas (grupos G4–G6, a mano con la lista o con el script de T-03) y el lote de sitios (T-21) corren en segundo plano, fuera de las sesiones de Claude Code.
- A1 ejecuta `make golden` (T-05) y hace A5; A2 revisa el catálogo y las fuentes; A3 revisa textos y guion.

### 1.3 Puntos de validación humana

| Punto | Cuándo | Quién | Qué necesita terminado |
| --- | --- | --- | --- |
| A | Sábado 16:30–17:30 (firma 17:15) | A1 | T-04 a T-10, T-21 (primer lote), T-22; lista de `11_validacion.md` §8 |
| B | Domingo 11:30–13:00 | A1, A3 | T-26 a T-37 integradas; T-36 con resultados de la noche |

Integraciones a hora fija (plan): sábado 11:00, 12:30, 15:30, 19:15, 22:45 y 00:15; domingo 10:45. Tras cada una, revisión de 10 min de A1 (sentido físico) y A3 (usabilidad) sobre la versión desplegada.

**Regla del control de las 15:30 (sábado).** En la integración de las 15:30, I3 y A3 comparan lo integrado con el reparto del §11. Si la interfaz va retrasada:

1. El punto A se celebra igual a las 16:30 y valida **los números**: con `validation_report.json` y con la referencia en Python (`pipeline/vis`, `make test`), no con las vistas.
2. Las vistas de la base que falten (T-15, T-17, T-18, T-19, T-20) **no bloquean los extras de cálculo**: tras la firma de A1, la cuenta 1 empieza T-24, T-25, T-26 y T-28 como está previsto.
3. Sí bloquean **los extras de interfaz**: la cuenta 2 no empieza T-27, T-29, T-30 ni ninguna otra tarjeta de interfaz posterior hasta haber integrado las vistas de la base que falten, en el orden del §11.
4. La decisión se anota en `docs/decisions.md` con la lista de vistas pendientes.

## 2. M0 · Esqueleto

### T-01 · Repositorio, herramientas e integración continua
- **Objetivo:** dejar un repositorio en el que las pruebas corren con una orden y cada integración publica una previsualización.
- **Carril / tamaño:** integración; la ejecuta la cuenta 1 · S (versión mínima: árbol, `Makefile`, `CLAUDE.md`, pruebas triviales y flujo de integración continua; el despliegue lo termina I3 a mano con `make deploy`).
- **Depende de:** nada.
- **Crea:** árbol de `02_arquitectura.md` §2 con ficheros mínimos; `CLAUDE.md` (copia de `13_claude_md.md`); `Makefile` y `package.json` raíz (§4); `pipeline/requirements.txt` y `requirements-gpu.txt`; `web/` con Vite + React + TypeScript vacío que muestra el título; `.github/workflows/ci.yml`; `.gitignore`; `LICENSE` (MIT); `SOURCES.md`, `AI_USAGE.md`, `docs/decisions.md`, `docs/constants.md`; `docs/spec/` (esta especificación) y `docs/tasks/T-xx.md` (una por tarjeta); `CODEOWNERS`.
- **Contrato:** `contract/VERSION` = `1.0.0`.
- **Especificación:** `02_arquitectura.md` entero; `13_claude_md.md`.
- **Pruebas:** `make setup` instala todo desde cero; `make test` ejecuta una prueba trivial de Python y otra de Vitest; `make build` genera `web/dist/`; el flujo de integración continua pasa; `make deploy` publica y la URL responde. Anota en `docs/decisions.md` las versiones que hayan hecho falta distintas de las fijadas.

### T-02 · Contrato: esquemas y datos de ejemplo
- **Objetivo:** que I2 pueda construir toda la web sin esperar al pipeline.
- **Carril / tamaño:** integración; la ejecuta la cuenta 2 · M.
- **Depende de:** T-01.
- **Crea:** `contract/schemas/*.schema.json` (10 esquemas); `contract/examples/make_examples.py` y su salida `contract/examples/data/…`; `pipeline/cli` suborden `check-contract`; copia de los ejemplos en `web/public/data/` y `web/public/config.json`.
- **Contrato:** todo `09_contrato_datos.md` (lo materializa).
- **Especificación:** `09_contrato_datos.md` §3–§14, en especial §13 (contenido sintético) y §14 (restricciones de los esquemas).
- **Pruebas:** todos los ejemplos validan contra su esquema; tamaños binarios exactos (5.260.176, 737.312, 553.504, 1.516.032 B); un JSON con un vector de 719 elementos es rechazado; ida y vuelta de un trozo del cubo y de un perfil.

### T-03 · Descarga de datos
- **Objetivo:** bajar y verificar todos los datos con una orden reanudable. No está en la ruta crítica: los ficheros se pueden bajar a mano con la lista de `03_datos_y_fuentes.md` §10 y `build_crop` vive en T-07.
- **Carril / tamaño:** integración; la ejecuta la cuenta 1 cuando tenga hueco (después de T-22) · S.
- **Depende de:** T-01, T-07 (`build_crop`).
- **Crea:** `ops/fetch_data.py` (con `--group`, `--check`, `--full-tiles`, `--crops`), `ops/data_manifest.json` (las 27 filas del §10.1 y sus etiquetas), órdenes `make data-fetch` y `make data-fetch-all`.
- **Contrato:** ninguno (datos internos en `data/`).
- **Especificación:** `03_datos_y_fuentes.md` §10 y §11.
- **Pruebas:** `data_manifest.json` coincide fila a fila con la lista (URL, bytes, carpeta); con un servidor HTTP local de prueba: reanudación tras corte, detección de tamaño incorrecto, petición por rango de filas correcta; `--check` distingue `OK`, `PARTIAL` y `MISSING`; un fichero ya presente con su tamaño exacto se salta sin tocar la red.

## 3. M1 · Efemérides

### T-04 · SPICE: carga, referencia `spkcpo` y pruebas de marcos
- **Objetivo:** función de referencia de acimut y elevación y blindaje del sistema de referencia.
- **Carril / tamaño:** I1 · S.
- **Depende de:** T-01; los cuatro núcleos en `data/kernels/`.
- **Crea:** `pipeline/common/constants.py`, `timeutil.py`, `geo.py`; `pipeline/ephem/kernels.py`, `spice_ref.py`; `pipeline/tests/test_ephem_frames.py`, `test_enu.py`; `tests/golden/horizons_smoke.csv`; entradas en `docs/constants.md`.
- **Contrato:** ninguno.
- **Especificación:** `05_efemerides.md` §1–§3 y §8.1, §8.2, §8.3, §8.5, §8.6; `03_datos_y_fuentes.md` §2 y §3.4.
- **Pruebas:** valor del `.tf` (± 0,001 km); tabla ENU a mano; las 15 filas de Horizons con error < 0,0005°; `MOON_ME` frente a `MOON_PA` (0,0227° y 0,0156° ± 0,002°); `IAU_MOON` falla; `ktotal == 4`.

### T-05 · Valores de referencia de Horizons y casos A1 y A2
- **Objetivo:** script de descarga de los valores de referencia y pruebas que los usan.
- **Carril / tamaño:** I1 · S. Lo ejecuta y revisa A1.
- **Depende de:** T-04.
- **Crea:** `ops/fetch_golden.py`; `tests/golden/horizons_azel.csv`, `horizons_sun_series.csv`, `events_published.csv`, `eclipses_nasa.csv`, `tolerances.json`, `raw/`; `pipeline/tests/test_a1_horizons.py`, `test_a2_riseset.py` (este último se activa al llegar T-10).
- **Contrato:** ninguno.
- **Especificación:** `11_validacion.md` §1–§3 y filas A1, A2.
- **Pruebas:** el analizador lee las tres variantes de fecha y las respuestas de `referencias/horizons/`; A1 en verde con 128 filas y error máximo anotado; cabecera de Horizons comprobada.

### T-06 · Tabla de efemérides e interpolación
- **Objetivo:** generar `ephemeris.bin` y la función de interpolación de referencia.
- **Carril / tamaño:** I1 · S.
- **Depende de:** T-04.
- **Crea:** `pipeline/ephem/table.py`, `interp.py`; suborden `ephem`; `web/public/data/ephemeris.bin` y `.meta.json` reales; `tests/golden/ephem_sample.json`; `pipeline/tests/test_ephem_table.py`.
- **Contrato:** `ephemeris.bin`, `ephemeris.meta.json`, `manifest.json` (`synthetic: false`).
- **Especificación:** `05_efemerides.md` §4, §5, §8.4, §8.7.
- **Pruebas:** tamaño 5.260.176 B; tabla frente a `spkcpo` en 2.000 casos < 0,001°; módulos y libración dentro de límites; los 15 valores de Horizons con la tabla < 0,001°.

## 4. M2 · Motor de horizonte

### T-07 · Lector PDS, rejillas y pila de DEM
- **Objetivo:** leer cualquier DEM del proyecto y muestrearlo en una dirección unitaria.
- **Carril / tamaño:** I1 · M.
- **Depende de:** T-01 (para las pruebas con datos reales, los ficheros del grupo G1 en `data/raw/lola/`).
- **Crea:** `pipeline/dem/pds_label.py`, `grids.py` (`Grid` polar y cilíndrica, `SyntheticGrid`), `stack.py` (`DemStack` y las cuatro pilas), `crop.py` (`build_crop`, desde la tesela local o por rango de filas); `pipeline/tests/test_grids.py`, `test_dem_read.py` (marca `data`); suborden `bench-sampler`.
- **Contrato:** textos de `relief_label`.
- **Especificación:** `03_datos_y_fuentes.md` §3, §4, §5.1, §5.3, §5.4, §7.
- **Pruebas:** ida y vuelta píxel ↔ latitud y longitud ↔ vector (error < 10⁻⁶ píxeles) en polar y cilíndrica; valores de las etiquetas reproducidos (píxel 0 de la tesela = 45,00098°); bilineal exacta en un plano; análisis de las etiquetas de `referencias/etiquetas/` (copiadas a `pipeline/tests/fixtures/`); `build_crop` con una tesela sintética: el recorte hecho desde el fichero local y el hecho por rango de filas (servidor HTTP local de prueba) son idénticos byte a byte, y una tesela local incompleta no se usa; con datos: tamaños, mínimos y máximos, profundidad y orientación de Shackleton (`03` §4.4), cota de SLIM (`03` §5.4), coherencia P1–P2.

### T-08 · Motor de horizonte de referencia y casos sintéticos
- **Objetivo:** algoritmo de la máscara en NumPy con sus pruebas analíticas (A4, A9).
- **Carril / tamaño:** I1 · M.
- **Depende de:** T-07.
- **Crea:** `pipeline/horizon/law.py`, `engine_ref.py`, `profile.py` (reducción); `pipeline/tests/test_horizon_synthetic.py`, `test_law.py`.
- **Contrato:** ninguno todavía.
- **Especificación:** `06_horizonte.md` §2–§10.
- **Pruebas:** `N_S` = 3709 y 1855, últimas distancias 299.878 y 299.772 m (± 5 m); depresiones −0,0869°, −0,6147°, −1,9435°; monte 2,606° y 2,604°; depresión circular 2,6857°; tabla de acimuts, polo y antimeridiano; invariantes; bordes y huecos. Anota la velocidad medida en `docs/constants.md`.

### T-09 · Máscara y perfil por sitio; primeros sitios reales
- **Objetivo:** suborden que escribe `horizon/<site>.json` y `profile/<site>.bin.gz`, y tres sitios reales calculados.
- **Carril / tamaño:** I1 · M.
- **Depende de:** T-08, T-02; datos G1 (y G2 para Blue Ghost 1).
- **Crea:** `pipeline/horizon/site_mask.py`; subórdenes `site-mask`, `profile-csv`, `sites` (lote en el orden de `04_catalogo_sitios.md` §6, que publica cada sitio al terminar y salta los que ya existen), `regions` y `publish` (escribe `manifest.json` y copia las salidas a `web/public/data/`); `contract/sites.catalog.json` con el contenido de `04_catalogo_sitios.md`; salidas de `im-2`, `shackleton-floor` y `region-malapert-massif` (y `blue-ghost-1` si hay recorte). Con esto T-21 queda sin código: es solo la ejecución del lote.
- **Contrato:** `sites.json`, `horizon/*.json`, `profile/*.bin.gz`, `manifest.json`.
- **Especificación:** `06_horizonte.md` §5, §8, §9; `09_contrato_datos.md` §4–§6; `04_catalogo_sitios.md`.
- **Pruebas:** salidas validan contra el esquema; `shackleton-floor` tiene `min_el_deg` > 10° (fondo de un cráter de 4,1 km de profundidad y ~10,5 km de radio: el borde queda a unos 21°); repetibilidad byte a byte; `profile-csv` coherente con la máscara (el máximo del CSV es el `el_deg` del acimut). A1 hace A5 con `profile-csv`.

## 5. M3 · Núcleo de visibilidad

### T-10 · Referencia de visibilidad en Python (parte I)
- **Objetivo:** horizonte en un acimut, márgenes, fracción de disco, sucesos, ventanas y eclipses, sobre la tabla.
- **Carril / tamaño:** I1 · M.
- **Depende de:** T-06, T-09.
- **Crea:** `pipeline/vis/sky.py`, `discs.py`, `events.py`, `eclipse.py`; `pipeline/tests/test_vis_*.py`, `test_b3_eclipse.py`; activa `test_a2_riseset.py`.
- **Contrato:** ninguno.
- **Especificación:** `07_visibilidad.md` §1–§6, §9, §10, §13.1–§13.5.
- **Pruebas:** tablas de `horizon_at` y de fracción de disco; puesta lisa de Blue Ghost 1 a las 20:10:39 UTC (± 10 s) y salida de IM-2 a las 09:14:10 (± 20 s); A2 en verde; eclipse B3 (± 60 s de las cifras de comprobación del plan, ± 5 min de Firefly); geometría del solape.

### T-11 · Esqueleto de la web, carga de datos y estado
- **Objetivo:** aplicación que arranca, carga los datos de ejemplo y mantiene el estado.
- **Carril / tamaño:** I2 · S.
- **Depende de:** T-01 (y T-02 para los ejemplos; puede empezar con ficheros mínimos propios).
- **Crea:** `web/src/main.tsx`, `App.tsx`, `core/types.ts`, `constants.ts`, `gz.ts`, `loaders.ts`, `state/store.ts`, `ui/common/DataState.tsx`, `i18n/en.json`, `i18n/t.ts`, `styles/tokens.css`.
- **Contrato:** lectura de `manifest.json`, `sites.json`, `horizon/*.json`, `config.json`.
- **Especificación:** `02_arquitectura.md` §8; `09_contrato_datos.md` §1–§5; `10_interfaz.md` §2, §9.
- **Pruebas:** cargadores con respuestas simuladas (correcta, 404, versión mayor distinta, tamaño erróneo); `gz.ts` descomprime un fichero de ejemplo; el almacén crea el estado inicial a partir de `defaults`.

### T-12 · Núcleo: tabla de efemérides y marcos
- **Objetivo:** `skyAt` en TypeScript idéntico a la referencia.
- **Carril / tamaño:** I2 · S.
- **Depende de:** T-11.
- **Crea:** `web/src/core/ephemeris.ts`, `frames.ts`, `time.ts`, `__tests__/ephemeris.test.ts`, `frames.test.ts`.
- **Contrato:** `ephemeris.bin` y meta.
- **Especificación:** `05_efemerides.md` §4.5, §4.6, §5, §8.2, §8.3.
- **Pruebas:** pesos de Lagrange (suma 1; u = 0 → (0, 1, 0, 0)); tabla ENU a mano; con la tabla real (cuando T-06 esté integrada), las 15 filas de Horizons < 0,001° y `ephem_sample.json`; `RangeError` fuera de rango; 10⁶ llamadas en menos de 1 s.

### T-13 · Núcleo: horizonte, fracción de disco, sucesos y métricas
- **Objetivo:** el resto del núcleo de visibilidad de la base.
- **Carril / tamaño:** I2 · M.
- **Depende de:** T-12.
- **Crea:** `web/src/core/law.ts`, `horizon.ts` (`horizonAt`, `blockerAt`, `smoothMask`, `localXY`), `visibility.ts` (`discFraction`, `evaluate`), `events.ts`, `metrics.ts`, `__tests__/…`, `__tests__/vectors.test.ts` (se activa por bloques según existan en `core_vectors.json`).
- **Contrato:** `horizon/*.json`.
- **Especificación:** `07_visibilidad.md` §1–§7, §10–§13; `06_horizonte.md` §3, §8, §9.
- **Pruebas:** las de §13.1, §13.2, §13.3 y §13.8 de `07`; `law_distance` igual que Python en 20 índices; presupuestos de rendimiento del §11; vectores compartidos cuando existan.

## 6. M4 · Interfaz mínima

### T-14 · Armazón: disposición, modos, escenarios, selector de sitio y tiempo (F1, F2)
- **Carril / tamaño:** I2 · M. **Depende de:** T-13.
- **Crea:** `ui/layout/`, `ui/scenario/` (tarjetas, selector de sitio, coordenadas a medida), `ui/controls/` (fecha, duración, deslizador, reproducción), `state/selectors.ts`.
- **Contrato:** `sites.json`.
- **Especificación:** `10_interfaz.md` §3–§5, §9, §12; `01_alcance.md` F1, F2.
- **Pruebas:** criterios de F1 y F2; máximo de 4 escenarios; validación de fecha y de coordenadas con sus mensajes; reproducción a tres velocidades; navegación con teclado por cabecera y tarjetas.

### T-15 · Panorama y comparación con la Luna lisa (F3, F4)
- **Carril / tamaño:** I2 · L. **Depende de:** T-14.
- **Crea:** `ui/panorama/` (vista de 40°, zoom del horizonte, tira de 360°, cuadro `Terrain effect`).
- **Especificación:** `10_interfaz.md` §6.1; `07_visibilidad.md` §4, §7.
- **Pruebas:** criterios de F3 y F4; prueba de geometría del dibujo (un disco con centro en el horizonte queda cortado por la mitad); arrastre y teclas; estados de carga y error.

### T-16 · Línea temporal, cuenta atrás y panel de cifras (F5, F6, F7)
- **Carril / tamaño:** I2 · M. **Depende de:** T-14.
- **Crea:** `ui/timeline/`, `ui/metrics/` (tres cifras, bloque `Now`, cuentas atrás, ficha de estado básica, línea de procedencia).
- **Especificación:** `10_interfaz.md` §6.2, §6.6; `07_visibilidad.md` §6, §7, §12.6.
- **Pruebas:** criterios de F5–F7; formato de duraciones y porcentajes (`<1 %`, `>99 %`); el cursor arrastrado coincide con el deslizador; las barras coinciden con los sucesos.

### T-17 · Resumen en lenguaje llano (F18)
- **Carril / tamaño:** I2 · S. **Depende de:** T-13.
- **Crea:** `ui/summary/summarize.ts`, `Summary.tsx`, pruebas.
- **Especificación:** `10_interfaz.md` §8.
- **Pruebas:** una prueba por rama de las tres tablas de plantillas; rumbos de 16 direcciones; los números de las frases son los del panel.

### T-18 · Corte del relieve (F12)
- **Carril / tamaño:** I2 · M. **Depende de:** T-14; perfiles de T-09 (o el de ejemplo).
- **Crea:** `ui/section/`, cargador del perfil en `core/loaders.ts`.
- **Contrato:** `profile/*.bin.gz`.
- **Especificación:** `10_interfaz.md` §6.3; `06_horizonte.md` §8; `09_contrato_datos.md` §6.
- **Pruebas:** criterio de F12; `profileBinDistance` igual que Python; la línea del horizonte toca el terreno en el punto que bloquea (± 1 intervalo); Luna lisa; mensajes de punto de malla y de error.

### T-19 · Comparación de escenarios (F8)
- **Carril / tamaño:** I2 · S (con dos cuentas, reducida a dos escenarios). **Depende de:** T-16.
- **Crea:** `ui/compare/`.
- **Especificación:** `10_interfaz.md` §5 (comparación).
- **Pruebas:** criterio de F8 con 2, 3 y 4 escenarios; resaltado de la mejor cifra; mensaje con un solo escenario. Plan B: solo 2 escenarios.

### T-20 · Móvil y accesibilidad
- **Carril / tamaño:** I2 · S. **Depende de:** T-14 a T-18.
- **Crea:** ajustes de `styles/`, atajos de teclado, tablas ocultas de datos, `aria-live`.
- **Especificación:** `10_interfaz.md` §3.2, §12, §13.
- **Pruebas:** Playwright con perfil móvil (390 × 844) sin desplazamiento horizontal; recorrido con teclado; auditoría de accesibilidad ≥ 90. Las reglas de accesibilidad se aplican en cada componente desde T-14; esta tarjeta es el repaso.

## 7. M5 y M6 · Lote de sitios y validación

### T-21 · Lote de sitios y publicación
- **Objetivo:** `make sites` calcula y publica el primer lote (14 sitios) y, después, el resto.
- **Carril / tamaño:** operación de I3, sin sesión de Claude Code (las subórdenes `sites` y `publish` las crea T-09) · ejecución de unos minutos por lote.
- **Depende de:** T-09; los ficheros de datos de cada sitio (`03_datos_y_fuentes.md` §10).
- **Crea:** `web/public/data/` reales (sin código nuevo).
- **Contrato:** `sites.json`, `horizon/`, `profile/`, `manifest.json`.
- **Especificación:** `04_catalogo_sitios.md` §6, §7.
- **Pruebas:** las de `04` §7; sitios sin datos salen como `smooth`; `check-contract` en verde sobre `web/public/data/`.

### T-22 · Pruebas con datos reales e informe de validación
- **Objetivo:** A3, A8 y A10 automatizados y `validation_report.json` generado desde las pruebas.
- **Carril / tamaño:** I1 · M.
- **Depende de:** T-10, T-21 (Blue Ghost 1 con recorte).
- **Crea:** `pipeline/tests/test_a3_blueghost_sunset.py`, `test_a8_sanity.py`, `test_a10_im2.py`, `conftest.py` (`record_case`), suborden `report`, `docs/manual_checks.json`.
- **Contrato:** `validation_report.json`.
- **Especificación:** `11_validacion.md` §4, §7.1; `09_contrato_datos.md` §7.
- **Pruebas:** A8 en verde; A10 liso (09:14 UTC ± 2 min y 2,46° ± 0,01°); A3 calculado e informado (si falla, parar e informar a A1; no tocar la tolerancia); el informe valida contra el esquema y sus tres titulares existen (`A7B7` como `skipped`).

### T-23 · Página de validación (F9)
- **Carril / tamaño:** I2 · S. **Depende de:** T-11; informe de ejemplo de T-02.
- **Crea:** `ui/validation/`.
- **Contrato:** `validation_report.json`.
- **Especificación:** `10_interfaz.md` §6.7.
- **Pruebas:** criterio de F9; estados `Match`, `Mismatch`, `Pending`; la tabla completa se despliega y cada fila se expande; sin informe, mensaje.

**→ Punto de validación A y etiqueta `v0.1-base`.**

## 8. Ruta crítica de la demo

### T-24 · Motor del cubo (PyTorch) y medida de coste
- **Carril / tamaño:** I1 · M. **Depende de:** T-08, T-07.
- **Crea:** `pipeline/horizon/engine_torch.py`, `cube.py` (trozo: cálculo, codificación, escritura atómica), subórdenes `cube --bench`, `cube-plan`; `pipeline/tests/test_cube_engine.py`.
- **Contrato:** `cube/c_RR_CC.bin.gz`, `cube/cube.json`, `cube/done.bin`.
- **Especificación:** `08_mapa_polar.md` §1–§4; `09_contrato_datos.md` §10.
- **Pruebas:** tabla de `08` §3.5 (sin la de datos reales); `make cube-bench` escribe `bench.json`. I3 aplica la regla de decisión de `08` §4 y lo anota en `docs/decisions.md`.

### T-25 · Ejecución del cubo: reanudación, reparto y nube
- **Carril / tamaño:** I1 escribe · S; I3 opera.
- **Depende de:** T-24.
- **Crea:** bucle reanudable de `cube` (`LEVELS`, `SHARD`, `LAW`), `ops/cloud/README.md`, `ops/deploy_heavy.sh` y la orden `make deploy-heavy` (con el fichero `_headers` de CORS de `02_arquitectura.md` §6.2 y la escritura de `heavy_base_url` en `config.json`), y la orden encadenada `make night` = `make cube LEVELS=2,3,4` seguido de `make layers`, que se detiene en el primer fallo y registra cada paso en `data/out/logs/` (las máscaras compactas no van en la cadena: su código llega con T-34 y tardan menos de 5 min).
- **Especificación:** `08_mapa_polar.md` §2, §4, §9; `02_arquitectura.md` §6.2, §10.
- **Pruebas:** reanudación idéntica byte a byte; dos fragmentos (`0/2` y `1/2`) cubren todos los trozos sin repetir; `make deploy-heavy` en modo de ensayo (`DRY_RUN=1`) lista los ficheros y el `_headers` sin subir nada. I3 lanza el nivel 1 en el portátil y, a las 00:30, `make night`.

### T-26 · Referencia de visibilidad (parte II): métricas, requisitos, matriz, ranking y vectores
- **Carril / tamaño:** I1 · M. **Depende de:** T-10; T-21 (máscara SLDEM2015 de `blue-ghost-1`, para B2 con relieve).
- **Crea:** `pipeline/vis/metrics.py`, `requirements.py`, `ranking.py`; suborden `core-vectors`; `tests/golden/core_vectors.json`; pruebas.
- **Especificación:** `07_visibilidad.md` §7, §8, §12, §13.7.
- **Pruebas:** B2 (0 → `go`, +14 d → `no_go` con `night_too_long`, +29,5 d → `go`) con máscara lisa y con SLDEM2015; orden del ranking estable; vectores generados con todos los bloques.

### T-27 · Replanificación en la web (F10)
- **Carril / tamaño:** I2 · M. **Depende de:** T-13, T-16; vectores de T-26 para la equivalencia.
- **Crea:** `core/requirements.ts`, `ranking.ts`, `ui/replan/`, ficha de estado completa en `ui/metrics/`.
- **Especificación:** `07_visibilidad.md` §8; `10_interfaz.md` §6.5.
- **Pruebas:** criterio de F10; bloques `assess`, `replan_row` y `rank` de los vectores; presupuesto de 300 ms para 13 filas; teclado en la matriz.

### T-28 · Capas, fondo del mapa y comparación con la NASA
- **Carril / tamaño:** I1 · L. **Depende de:** T-24 (algún trozo calculado), T-06; datos G3.
- **Crea:** `pipeline/layers/layers.py`, `hillshade.py`, `compare_nasa.py`; subórdenes `layers`, `hillshade`, `compare-nasa`; salidas en `data/out/heavy/`.
- **Contrato:** `map/*`, `layers/*`.
- **Especificación:** `08_mapa_polar.md` §5, §6, §8, §9; `09_contrato_datos.md` §8, §9.
- **Pruebas:** tabla de `08` §5.3; lectura de N1 y N2 comprobada (`03` §6); `compare-nasa` produce métricas y figuras; variante de plan B (`source = nasa_avgvisib`) genera capas válidas.

### T-29 · Vista de mapa y clic (F11)
- **Carril / tamaño:** I2 · L (con dos cuentas, primero la versión mínima del §11: lienzo con zoom y arrastre, capas, leyenda, lectura y clic). **Depende de:** T-14; ejemplos de T-02 (datos reales cuando lleguen).
- **Crea:** `core/grid.ts`, `cube.ts`; `ui/map/` (lienzo, zoom, capas, leyenda, lectura, clic).
- **Contrato:** `map/*`, `layers/*`, `cube/*`.
- **Especificación:** `08_mapa_polar.md` §1.2, §7; `10_interfaz.md` §6.4.
- **Pruebas:** criterio de F11; malla ida y vuelta y celda de Shackleton (415, 380); decodificación de trozo con desbordamiento cíclico; estados sin datos, sin calcular y plan B; teclado.

### T-30 · Historia guiada (F15)
- **Carril / tamaño:** I2 · M. **Depende de:** T-15, T-18, T-19, T-27, T-23.
- **Crea:** `ui/story/` (`storySteps.ts`, superposición).
- **Especificación:** `10_interfaz.md` §11.
- **Pruebas:** criterio de F15; cada paso produce el estado descrito; variante sin mapa; Playwright recorre los 7 pasos con `Next`.

### T-31 · Elección del par de la demo (A11)
- **Carril / tamaño:** I1 · S. **Depende de:** T-25 (nivel 1), T-28 (capas de esos trozos), T-26.
- **Crea:** suborden `pick-demo`; `data/out/demo_candidates.json`.
- **Especificación:** `04_catalogo_sitios.md` §5.
- **Pruebas:** con datos sintéticos, encuentra la pareja plantada. A1 elige y firma; A2 añade `demo-a` y `demo-b` al catálogo; se recalcula con `make sites`.

### T-39 · Publicación del origen pesado
- **Carril / tamaño:** operación de I3, sin sesión de Claude Code (el código, `make deploy-heavy`, lo crea T-25) · 30 min de reloj. **Depende de:** T-25, T-28 y el cálculo nocturno (`make night`).
- **Crea:** el origen pesado publicado y `config.json` con su `heavy_base_url` en la aplicación desplegada.
- **Especificación:** `02_arquitectura.md` §6.2, §7; `09_contrato_datos.md` §1.
- **Pruebas:** desde la web desplegada, un clic en el mapa descarga un trozo de otro origen sin error de CORS. La copia sin conexión (`make offline`) no es de esta tarjeta: la crea y la prueba T-38.

**→ Hito 2 y etiqueta `v0.2`.**

## 9. Resto de P1

### T-32 · Eclipses en la web (F13)
- **Carril / tamaño:** I2 · S. **Depende de:** T-13, T-16.
- **Crea:** `core/eclipse.ts`; banda en la línea temporal, aviso en el panel, discos superpuestos en el panorama.
- **Especificación:** `07_visibilidad.md` §9; `10_interfaz.md` §6.2, §6.6; `11_validacion.md` B3.
- **Pruebas:** criterio de F13; bloque `eclipse` de los vectores. La prueba B4 es de Python (carril I1) y está en T-36, para que no dependa de que esta tarjeta de interfaz entre.

### T-33 · Enlace compartible (F16)
- **Carril / tamaño:** integración; la ejecuta la cuenta 2 · S. **Depende de:** T-14.
- **Crea:** `state/url.ts`, botón `Share`.
- **Especificación:** `10_interfaz.md` §10.
- **Pruebas:** ida y vuelta del estado; entradas corruptas; Playwright abre el enlace en un contexto nuevo.

### T-34 · Máscaras compactas
- **Carril / tamaño:** I1 · S. **Depende de:** T-25 (nivel 1).
- **Crea:** `pipeline/horizon/compact.py`, suborden `compact`.
- **Contrato:** `compact/*.bin.gz`.
- **Especificación:** `09_contrato_datos.md` §11.
- **Pruebas:** tamaño 32 + 368·n; cada valor compacto ≥ los cinco valores completos de su ventana; 10.252 puntos con las cajas del catálogo.

### T-35 · Sitio óptimo en la web (F32)
- **Carril / tamaño:** I2 · M. **Depende de:** T-29; ejemplo compacto de T-02.
- **Crea:** `workers/optimal.worker.ts`, `ui/optimal/`, `core` (`bestByPeriod`).
- **Especificación:** `08_mapa_polar.md` §10; `10_interfaz.md` §6.4.
- **Pruebas:** tabla de `08` §10.3; cancelación; la interfaz responde durante el cálculo.

### T-36 · Pruebas lentas y de catálogo: A6, A7, B6 y B4
- **Carril / tamaño:** I1 · M (50 min de escritura); ejecución desatendida.
- **Depende de:** T-28, T-25, T-10.
- **Crea:** `pipeline/tests/test_a6_shackleton.py`, `test_a7_nasa_points.py`, `test_b6_cube_vs_site.py`, `test_b4_eclipse_catalog.py`.
- **Especificación:** `08_mapa_polar.md` §8, §11; `11_validacion.md` A6, A7, B4, B6.
- **Pruebas:** escriben sus `test_results`; `make report` los incorpora; B4 con la tabla de `11_validacion.md` §5. Con dos cuentas la tarjeta se escribe el domingo por la mañana (§11) y sus pruebas se lanzan en cuanto está en verde: con el cubo y las capas ya calculados de noche, A6, A7 y B6 tardan minutos (20 máscaras de sitio para A7, 10 para B6) y sus resultados llegan al punto B de las 11:30.

### T-37 · Pruebas de extremo a extremo (B1, B2, B9)
- **Carril / tamaño:** I2 · M (con dos cuentas, solo B1 y B2). **Depende de:** T-27, T-30.
- **Crea:** `web/e2e/*.spec.ts`.
- **Especificación:** `10_interfaz.md` §14; `11_validacion.md` B1, B2, B9.
- **Pruebas:** las propias.

### T-38 · Versión final, licencias y copia sin conexión
- **Carril / tamaño:** integración; I3 con la cuenta 1 para los textos del `README.md` · M. **Depende de:** todo lo integrado.
- **Crea:** `README.md` final (qué es, cómo se usa, cómo se reproduce, datos, validación), revisión de `SOURCES.md` y `AI_USAGE.md` con A2, `make offline`, etiqueta `v1.0`, repositorio público.
- **Especificación:** `11_validacion.md` B10; `02_arquitectura.md` §6.4.
- **Pruebas:** lista de B10; enlaces abiertos en ventana privada y en un móvil; copia local en dos portátiles.

**→ Hito 3 (domingo 11:30: funcionalidades congeladas), hito 4 (14:30: código congelado) e hito 5 (15:30: entrega subida).**

## 10. P2 y P3 (tarjetas cortas; se detallan al abrirlas)

Solo si todo P1 está integrado el domingo a las 00:30. Orden por carril según el plan. Cada una se abre con una decisión en `docs/decisions.md` y respeta la regla de admisión.

| Tarjeta | Funcionalidad | Carril | Tamaño | Qué hace falta | Criterio |
| --- | --- | --- | --- | --- | --- |
| T-40 | F21 Sensibilidad | I1, I2 | M | Máscaras de 10 m (ya publicadas) y vecinos del cubo | `01_alcance.md` §3.3 |
| T-41 | F19 Buscador por requisitos | I1, I2 | M | Trabajador de F32 con `assess` sobre máscaras compactas | Ídem |
| T-42 | F22 Sombra permanente | I2 (datos: I1) | S | N5 remuestreado a la malla (`layers/psr.bin.gz`, 1 banda `uint8`) | Ídem |
| T-43 | F24 Márgenes | I1, I2 | M | Umbrales de `Requirements` | Ídem |
| T-44 | F14 Estaciones DSN | I1, I2 | M | `stations.json` (A2), tabla Luna→estación, caso B5 | Ídem |
| T-45 | F17 Español | I2 | S | `es.json` (A3) | Ídem |
| T-46 | F25 Calendario anual | I2 | M | Núcleo existente | Ídem |
| T-47 | F20 Plantillas de misión | I2 | S | Núcleo existente | Ídem |
| T-48 | F23 Pendiente | I1 | S | P2 a 500 m (`layers/slope.bin.gz`) | Ídem |
| T-49 | F26 Animación del mapa | I2 | S | Capas mensuales | Ídem |
| T-50 | F30 Fase de la Tierra | I2 | S | Vectores Sol y Tierra | Ídem |
| T-51 | F31 Exportación | I3 | S | Núcleo existente | Ídem |
| T-52 | F27 Globo 3D (P3) | I2 | M | Sombreado global: no hay dato previsto; solo si sobra tiempo | Ídem |

Cualquier fichero nuevo de P2 (por ejemplo `layers/psr.bin.gz`) exige ampliar el contrato a `1.1.0` antes de escribir código (cambio de tipo 3).

Mejora de precisión anotada, sin tarjeta propia (cierre de E-12 en `90_dudas_y_riesgos.md`): calcular la máscara cada 0,25° y guardar el máximo de cada par. Solo se abre con una decisión en `docs/decisions.md`, después de todo P1.

## 11. Reparto y encaje en el horario con dos cuentas (caso base)

Dos cuentas de Claude Code: la cuenta 1 en el carril de cálculo (I1) y la cuenta 2 en el carril web (I2). I3 no programa. Entre paréntesis, minutos estimados de Claude Code; a la derecha de cada tramo, los minutos de reloj disponibles.

| Tramo | Cuenta 1 (I1) | Cuenta 2 (I2) | I3, sin cuenta |
| --- | --- | --- | --- |
| Sábado 09:00–11:00 (120) | T-01 (25), T-04 (40), T-06 (40) | T-02 (45), T-11 (40), T-12 (35) | Baja G0–G3 con la lista de `03` §10 y comprueba tamaños; despliegue de previsualización |
| 11:00–13:30 (150) | T-05 (30), T-07 (65), T-08 (55) | T-13 (75), T-14 (75) | Integraciones de las 11:00 y 12:30; A1 ejecuta `make golden` |
| 14:30–16:30 (120) | T-09 (45), T-10 (55), pruebas de T-22 (20) | T-16 (70), inicio de T-15 (50) | T-21: primer lote de sitios; **control de las 15:30** (§1.3) |
| 16:30–17:30 (60) | Informe de T-22 (25); solo fallos de validez | T-23 (40), T-15 (20) | Punto A con A1; etiqueta `v0.1-base` |
| 18:00–19:30 (90) | T-24 (70), inicio de T-25 (20) | Fin de T-15 (30), T-17 (30), inicio de T-18 (30) | `make cube-bench` (hacia las 19:10, en cuanto T-24 está en verde) y decisión de ley (`08` §4) |
| 21:30–00:30 (180) | Fin de T-25 (20), T-26 (65), T-28 (95) | Fin de T-18 (25), T-19 reducida (30), T-27 (70), T-30 (55) | Hacia las 21:50, con T-25 integrada: nivel 1 del cubo en el portátil (minutos). Integraciones de las 22:45 y 00:15. A las 00:30, tras integrar T-28: `make night` (resto del cubo y capas, desatendido) |
| Domingo 09:00–11:00 (120) | T-31 (30), T-34 (30), T-36 (50); T-03 solo si sobra tiempo (no hace falta: los datos se bajan con la lista) | T-29 en versión mínima (90), T-20 solo comprobación (30) | 08:00: comprueba `make night`. `make compact` tras T-34; lanza las pruebas de T-36; T-39 (publica el origen pesado); integración de las 10:45 |
| Domingo 11:30–14:30 | Correcciones del punto B; textos de T-38 | Correcciones; T-37 (B1 y B2) | Punto B; T-38; copia sin conexión |

Consecuencias de trabajar con dos cuentas, que el equipo debe conocer:

- **No hay holgura antes del punto A en ninguno de los dos carriles.** Por eso existe la regla del control de las 15:30 (§1.3): el punto A valida los números con el informe de validación y la referencia en Python aunque falten vistas.
- **Al punto A llegan terminadas** F1, F2, F5, F6 y F7 (y F9 durante la propia hora de validación). **F3, F4 y F18** entran en la integración de las 19:15; **F12 y F8** (dos escenarios), en la de las 22:45.
- **Hito 2 (00:30):** F10 y F15 integradas. De F11 están el nivel 1 del cubo y el código de las capas (T-28); el resto del cubo y las capas se calculan de noche con `make night` y están el domingo a las 08:00. **La vista del mapa (T-29) entra el domingo a las 10:45**. Hasta entonces la historia guiada usa la variante sin mapa de su paso 6 (`10_interfaz.md` §11).
- **T-29 en versión mínima** = lienzo con zoom y arrastre, capas, leyenda, lectura al pasar el puntero y clic. El manejo completo con teclado y el panel `Best site` quedan para después.
- **F13, F16 y F32 (interfaz)** solo entran si la cuenta 2 termina T-29 antes de las 10:15 del domingo, por este orden: T-33, T-32, T-35. Los datos de F32 (T-34) estarán hechos igualmente.
- **T-03** (script de descarga) deja de estar en la ruta crítica: los ficheros se bajan con la lista y `build_crop` está en T-07.
- **P2 y P3** (T-40 a T-52) no se hacen.

Orden de prioridad de la cuenta 2 si algo se retrasa (no se altera): T-02, T-11, T-12, T-13, T-14, T-16, T-23, T-15, T-17, T-18, T-19, T-27, T-30, T-29, T-20, T-37, T-33, T-32, T-35.

Orden de prioridad de la cuenta 1: T-01, T-04, T-06, T-05, T-07, T-08, T-09, T-10, T-22, T-24, T-25, T-26, T-28, T-31, T-34, T-36, T-03. T-21 y T-39 no figuran porque no llevan código: las opera I3 con las órdenes que crean T-09 y T-25.

## 12. Si hay una tercera cuenta

La tercera cuenta trabaja en un carril de integración propio, en directorios que no pisan a los otros dos:

| Tarjetas que toma la cuenta 3 | Efecto |
| --- | --- |
| T-01, T-02, T-03 | Las cuentas 1 y 2 empiezan T-04 y T-11 a las 09:00 |
| T-17, T-19 (completa), T-23 (`ui/summary`, `ui/compare`, `ui/validation`) | La cuenta 2 termina T-15 y T-18 antes del punto A: la base llega completa |
| T-33, T-37, T-38 (T-39 sigue siendo operación de I3) | La cuenta 2 hace T-27 y T-29 el sábado de 18:00 a 19:30 y T-30 por la noche: el hito 2 se cumple con F11 incluida (con las capas del nivel 1; el resto llega de noche) |
| — | La cuenta 2 dedica el domingo por la mañana a T-32 y T-35; P2 solo si todo P1 está integrado a las 00:30 |

Lo que no se recorta nunca, con dos o con tres cuentas: T-04 a T-10 y T-22 (validez), T-27 y T-30 (demo), T-38 (entrega).

Si se agota una cuenta: su dueño pasa a tareas humanas (revisar, probar a mano, integrar) y el otro carril hereda la tarjeta desde el repositorio, gracias a la nota de traspaso.
