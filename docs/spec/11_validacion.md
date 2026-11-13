# 11 · Validación

Cada caso tiene entrada exacta, resultado esperado, tolerancia y una fuente que no es nuestro código. Los aeroespaciales validan dos veces (punto A: sábado 16:30–17:30; punto B: domingo 11:30–13:00), pero las pruebas automáticas corren en cada cambio. Regla del plan: si falla una prueba de referencia, se para y se informa; nunca se cambian la prueba ni la tolerancia. Veto de A1.

## 1. Niveles y marcas de las pruebas

| Nivel | Marca de pytest / lugar | Qué necesita | Cuándo corre | Casos |
| --- | --- | --- | --- | --- |
| Unitarias y sintéticas | (sin marca) | Nada | `make test`, integración continua | A4, A9, vectores, formatos |
| De referencia con SPICE | `kernels` | `data/kernels/` | `make test`, integración continua (núcleos en caché) | A1, A2, A8, A10, B3, B4, marcos |
| Con relieve | `data` | DEM descargados | `make test-all`, portátil de I1 | A3, A5 (apoyo), lectura de DEM |
| Lentas | `slow` | Cubo o muchas máscaras | De noche | A6, A7, B6, B7 |
| Web | Vitest | Nada | `make test` | Núcleo en TypeScript, vectores |
| Extremo a extremo | Playwright | Web construida | `make test-all`, antes de cada hito | B1, B2, B9 (parte) |
| Manuales | — | Personas | Puntos A y B | A5, A11, B8, B9, B10, B11 |

Tolerancias: fichero protegido `tests/golden/tolerances.json`:

```json
{ "A1_deg": 0.02, "A2_min": 5, "A3_min": 30, "A4_deg": 0.005, "A5_deg": 0.1,
  "A7_r_min": 0.9, "A7_mae_pct_max": 10, "A9_interp_deg": 0.001,
  "B1_deg": 0.01, "B1_min": 1, "B3_min": 5, "B5_deg": 0.05, "B5_min": 2,
  "B6_el_deg": 0.01, "B6_pct": 0.4, "B7_r_min": 0.9 }
```

Las pruebas leen las tolerancias de ese fichero; ninguna las escribe en el código.

## 2. Consultas exactas a Horizons

Sintaxis comprobada con las respuestas de `referencias/horizons/` (`03_datos_y_fuentes.md` §8). Las hace `ops/fetch_golden.py` (`make golden`), que ejecuta A1; el resultado se revisa y se integra con su aprobación.

### 2.1 Parámetros comunes

`GET https://ssd.jpl.nasa.gov/api/horizons.api` con:

| Parámetro | Valor |
| --- | --- |
| `format` | `text` |
| `COMMAND` | `'10'` (Sol) o `'399'` (Tierra) |
| `OBJ_DATA` | `'NO'` |
| `MAKE_EPHEM` | `'YES'` |
| `EPHEM_TYPE` | `'OBSERVER'` |
| `CENTER` | `'coord@301'` |
| `COORD_TYPE` | `'GEODETIC'` |
| `SITE_COORD` | `'<lon_este>,<lat>,<altura_km>'` (por ejemplo `'61.81,18.562,0'`) |
| `QUANTITIES` | `'4,13,20'` |
| `ANG_FORMAT` | `'DEG'` |
| `APPARENT` | `'AIRLESS'` |
| `RANGE_UNITS` | `'KM'` |
| `TIME_DIGITS` | `'SECONDS'` |
| `EXTRA_PREC` | `'YES'` |
| `CSV_FORMAT` | `'YES'` |

Todos los valores van codificados para URL (comillas simples incluidas). Tiempos, una de dos formas:

- Lista: `TLIST='2025-03-14 06:00' '2025-09-07 18:00' …` con `TLIST_TYPE='CAL'` y `TIME_TYPE='UT'`.
- Intervalo: `START_TIME='2025-03-16 19:30'`, `STOP_TIME='2025-03-16 21:00'`, `STEP_SIZE='1 m'`.

### 2.2 Lectura de la respuesta

- Comprobar que la primera línea es `API VERSION: 1.2` (si cambia, avisar y seguir) y que la cabecera contiene `Center pole/equ : MEAN_ME`, `Center radii    : 1737.4, 1737.4, 1737.4 km` y `Atmos refraction: NO (AIRLESS)`. Si falta alguna, abortar con `Unexpected Horizons header: <línea>`.
- Los datos están entre las líneas `$$SOE` y `$$EOE`. Cada línea, separada por comas: fecha (`2025-Mar-14 06:00:00.000`, `2025-Mar-14 00:00:00` o `2025-Mar-16 18:15` según la consulta), marca de presencia solar, marca del cuerpo interferente, acimut (°), elevación (°), diámetro angular (″), distancia (km), velocidad radial (km/s).
- La marca `*` significa «borde superior del Sol sobre el horizonte liso»: no se usa en ninguna comparación.
- Se guarda la respuesta íntegra en `tests/golden/raw/<caso>_<site>_<target>.txt` y las filas en el CSV correspondiente.
- Una consulta por segundo como mucho; reintento con espera de 10 s ante error HTTP.

### 2.3 Consultas del caso A1 (16 consultas)

Sitios (altura 0 km) y `SITE_COORD`:

| `site_id` | `SITE_COORD` |
| --- | --- |
| `apollo-11` | `'23.47314,0.67416,0'` |
| `blue-ghost-1` | `'61.81,18.562,0'` |
| `chandrayaan-3` | `'32.32,-69.3741,0'` |
| `im-2` | `'29.1957,-84.7906,0'` |
| `change-7-candidate` | `'123.4,-88.8,0'` |
| `val-899s` | `'0,-89.9,0'` |
| `change-4` | `'177.5885,-45.4561,0'` |
| `change-6` | `'-153.9852,-41.6385,0'` |

Instantes (UTC), los mismos para todos, en un `TLIST`: `2025-03-14 06:00`, `2025-09-07 18:00`, `2026-06-15 12:00`, `2027-01-01 00:00`, `2027-10-20 03:30`, `2028-02-29 12:00`, `2029-06-26 03:00`, `2030-12-31 23:00`. Incluyen un 29 de febrero, un cambio de año y dos instantes de eclipse.

Para cada sitio, una consulta con `COMMAND='10'` y otra con `COMMAND='399'`: 8 × 2 × 8 = 128 filas, 256 valores de acimut y elevación. Longitud negativa en `SITE_COORD`: comprobado que Horizons la admite como longitud este negativa y la devuelve en 0–360 (`'-153.9852,-41.6385,0'` → `Center geodetic : 206.0148, -41.6385, 0.0`; respuesta en `referencias/horizons/prueba_lon_negativa_change6.txt`). El script comprueba en cada consulta que la cabecera reproduce la longitud pedida módulo 360.

### 2.4 Consultas del caso A2 (salida y puesta del centro del Sol)

Sitios: `apollo-11`, `blue-ghost-1` y `change-3` (`'-19.5117,44.1214,0'`). Para cada uno:

1. Consulta gruesa: `COMMAND='10'`, de `2025-03-01 00:00` a `2025-04-01 00:00`, `STEP_SIZE='1 h'`. El script localiza **todos** los cambios de signo de la elevación del intervalo, que pueden ser dos o tres porque el mes sinódico (29,53 días) es más corto que el intervalo (31 días). Esperado: `apollo-11` y `change-3`, una salida y una puesta; `blue-ghost-1`, tres (una salida antes del alunizaje del 2 de marzo a las 08:34 UTC, la puesta del 16 de marzo a las 20:10:39 UTC y la salida siguiente, un mes sinódico después de la primera, todavía dentro de marzo; estimación a partir de la puesta y del periodo sinódico, que fija la consulta). La prueba A2 compara cada cruce de Horizons con el cruce del mismo tipo más cercano de nuestro cálculo.
2. Consulta fina alrededor de cada cambio: desde 60 min antes hasta 60 min después de la hora en punto anterior al cambio, `STEP_SIZE='1 m'`.
3. Instante de referencia: interpolación lineal del cruce por 0° entre las dos filas consecutivas de signo distinto.

Para Blue Ghost 1 ya se conoce el resultado de la puesta: 2025-03-16T20:10:39Z (`05_efemerides.md` §8.3).

### 2.5 Consulta del caso B5 (solo si entra F14)

Luna vista desde una estación terrestre: `COMMAND='301'`, `CENTER='coord@399'`, `SITE_COORD` con las coordenadas de la estación (PENDIENTE DE VERIFICAR, A2), cinco instantes de 2027 en `TLIST` y una serie de 1 min alrededor de una salida y una puesta de la Luna.

## 3. Formato de `tests/golden/`

| Fichero | Contenido | Columnas o estructura |
| --- | --- | --- |
| `horizons_smoke.csv` | Las 15 filas de `05_efemerides.md` §8.3 | Igual que `horizons_azel.csv` |
| `horizons_azel.csv` | A1 (128 filas) | `case,site_id,lat_deg,lon_deg,alt_km,target,utc,az_deg,el_deg,ang_diam_arcsec,range_km` |
| `horizons_sun_series.csv` | A2 (series de 1 min) | `case,site_id,lat_deg,lon_deg,alt_km,event,utc,az_deg,el_deg` |
| `horizons_station.csv` | B5 | `case,station_id,target,utc,az_deg,el_deg` |
| `events_published.csv` | Hechos publicados: eclipse y puesta de Blue Ghost 1 | `case,event,utc,source_url,quote` |
| `eclipses_nasa.csv` | Tabla del §5 (B4) | `date,td_greatest,type,umbral_magnitude` |
| `core_vectors.json` | Vectores Python → TypeScript (`07_visibilidad.md` §12) | Bloques por función |
| `ephem_sample.json` | 50 muestras de la tabla con su valor de `spkpos`, para probar el lector de TypeScript | `{segment, k, values[6]}` |
| `tolerances.json` | §1 | — |
| `raw/*.txt` | Respuestas íntegras de Horizons | Texto |

Reglas: `target` ∈ `sun`, `earth`; `utc` en ISO 8601 con `Z`; punto decimal; una cabecera; codificación UTF-8. Son datos, no código. Solo cambian con la aprobación de A1.

Contenido inicial de `events_published.csv` (lo crea T-05):

| `case` | `event` | `utc` | Fuente | Cita |
| --- | --- | --- | --- | --- |
| B3 | `eclipse_start` | 2025-03-14T05:00:00Z | Firefly, diario de misión (`https://fireflyspace.com/?p=3379`) | «The eclipse will last nearly 5 hours starting at 12 am CST through 4:52 am CST» |
| B3 | `totality_start` | 2025-03-14T06:18:00Z | Ídem | «approximately 2 hours and 16 minutes of totality, starting at 1:18 am CST» |
| B3 | `totality_end` | 2025-03-14T08:34:00Z | Ídem | 1:18 am + 2 h 16 min |
| B3 | `eclipse_end` | 2025-03-14T09:52:00Z | Ídem | «through 4:52 am CST» |
| A3 | `last_data` | 2025-03-16T23:15:00Z | Firefly, nota de fin de misión | «the final data received around 6:15 pm CDT on March 16» |
| A3 | `sunset_latest` | 2025-03-16T18:15:00Z | Ídem | «operated for 5 hours into the lunar night» |

Las horas se pasan a UTC sumando 5 h. Firefly escribe «CST» en la nota del día 13, pero sus notas del día 14 dan las horas en CDT («around 12:30 am CDT», «around 2:30 am CDT during the totality») y con UTC−6 el eclipse no cuadraría con las efemérides por una hora: se toma UTC−5. Confirmación final: A1.

## 4. Punto A: la base

| N.º | Entrada exacta | Resultado esperado | Tolerancia | Fuente independiente | Tipo y prueba | Tarea |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Acimut y elevación de Sol y Tierra con `azel_spice` y con la tabla, en los 8 sitios y 8 instantes del §2.3, altura 0 | Valores de `horizons_azel.csv` | 0,02° (acimut ponderado por cos de la elevación) | JPL Horizons | Automática, `kernels`: `test_a1_horizons.py`. El informe da además el error máximo; esperado < 0,001° | T-04, T-05 |
| A2 | Salida y puesta del centro del Sol en marzo de 2025 en `apollo-11`, `blue-ghost-1` y `change-3`; Luna lisa, observador a 0 m (`find_crossings` con máscara `flat:0`) | Cruces por 0° de `horizons_sun_series.csv` | 5 min | JPL Horizons | Automática, `kernels`: `test_a2_riseset.py`; esperado < 15 s | T-05, T-10 |
| A3 | `blue-ghost-1` (18,562° N, 61,810° E), 2025-03-16, máscara SLDEM2015, observador a 2 m: instante del `sunset` (centro) | Entre 18:00 y 18:15 UTC (Firefly: últimos datos hacia las 23:15 UTC, «5 hours into the lunar night»). Condición equivalente: horizonte de ~0,9° en el acimut 269,7° (a las 18:15 el Sol está a 0,925°). Con Luna lisa: 20:10:39 UTC (centro, 0 m) | 30 min → pasa si el `sunset` cae entre 17:30 y 18:45 UTC | Firefly Aerospace | Automática, `data`: `test_a3_blueghost_sunset.py`. El informe da también el instante en que el disco desaparece del todo (fracción 0) y el horizonte en 269,7° | T-09, T-22 |
| A4 | Esfera lisa con observador a 2 m, 100 m y 1.000 m; monte de 3 km a 50 km con observador a 0 m | −0,087°, −0,615°, −1,943°; 2,606° (cuentas en `06_horizonte.md` §10.1 y §10.2) | 0,005° | Cálculo a mano de A1 con R = 1.737,4 km | Automática: `test_horizon_synthetic.py` | T-08 |
| A5 | Tres acimuts (0°, 120°, 240°) de `region-malapert-massif`: perfil del DEM sacado en QGIS y ángulo máximo calculado en hoja de cálculo con la fórmula de `06` §4.3 | El valor de `el_deg` de nuestra máscara en esos acimuts | 0,1° | Cálculo manual de A1 y A2 (mismo DEM: comprueba el algoritmo, no el relieve) | Manual, con apoyo de `profile-csv`; A1 anota los tres valores | T-09 |
| A6 | Mejor celda de la malla a menos de 15 km del centro de Shackleton (−89,67°, 129,78°), 2026–2030, 2 m | Racha de luz continua del orden de 240 días y noche más larga del orden de 1,5 días | Mismo orden (factor 3) | Mazarico et al. (2011); coordenadas y altura del punto original: PENDIENTE DE VERIFICAR (A1) | Lenta + veredicto manual: `test_a6_shackleton.py` calcula y anota | T-36 |
| A7 | 20 puntos al azar con r ≤ 150 km (semilla 42): media de 18,6 años de Sol y de Tierra con criterio «cualquier fracción», 2 m | `AVGVISIB_85S_060M_201608` y `…_EARTH` en esos puntos (media 3 × 3 píxeles) | r > 0,9 y diferencia media absoluta < 10 puntos, para cada astro | PGDA, producto 69 | Lenta: `test_a7_nasa_points.py` (`08_mapa_polar.md` §8) | T-36 |
| A8 | Luna lisa, 0 m, rejilla horaria de todo 2024–2044 | Chang'e 4: Tierra siempre bajo el horizonte. (0°, 0°): Tierra siempre por encima de 75°. (−90°, 0°): \|elevación del Sol\| < 1,6° y \|elevación de la Tierra\| < 7,5° | Exacta | Geometría orbital; A1 la justifica | Automática, `kernels`: `test_a8_sanity.py` | T-22 |
| A9 | Invariantes | Fracción de disco en [0, 1]; subir el mástil nunca empeora el horizonte; la tabla interpolada difiere de SPICE menos de 0,001° | Exacta | Propiedades lógicas | Automática: `05` §8.4, `06` §10.5, `07` §13.8 | T-06, T-08, T-10 |
| A10 (secundario) | `im-2-planned` (84,78° S, 29,13° E), marzo de 2025, Luna lisa y con relieve | Luna lisa: salida del centro el 04/03 a las 09:14 UTC; el 06/03 a las 17:30 UTC el Sol está a 2,46° (valores de Horizons, `05` §8.3). Con relieve: más bajo o más tarde | Un día | Horizons (el plan da «hacia las 09:10» y «~2,5°»). No va a la página de validación. No se afirma que la nave esperase al amanecer | Automática, `kernels` (lisa) y `data` (relieve): `test_a10_im2.py` | T-22 |
| A11 | Par de la demo (`04_catalogo_sitios.md` §5) | Resultados opuestos por una causa visible en el DEM | Cualitativa | Perfil manual de A1 en QGIS | Manual; A1 firma en `docs/decisions.md` | T-31 |

A5 usa el mismo DEM que nuestro código. La comprobación independiente del relieve polar son A6, A7, B7 y B11; la del relieve fuera del polo, A3.

Si A3 no pasa: no se fuerza. Se revisa, por este orden, (1) la lectura del recorte (costuras, orientación), (2) qué llama Firefly «puesta» (centro, borde o fin de energía en los paneles: PENDIENTE DE VERIFICAR, A1) comparando también con el instante de fracción 0 y con el de fracción 0,5, y (3) la altura del observador. Se enseña la diferencia con su explicación.

## 5. Punto B: el producto final

| N.º | Entrada exacta | Resultado esperado | Tolerancia | Fuente independiente | Tipo y prueba | Tarea |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Cinco escenarios en la interfaz: (1) `blue-ghost-1`, 2025-03-02T08:34Z, 14 d; (2) `im-2`, 2025-03-06T17:30Z, 10 d; (3) `region-malapert-massif`, 2027-08-01T00:00Z, 14 d; (4) `apollo-11`, 1969-07-20T20:00Z, 3 d; (5) el escenario inicial de la demo. Cursor en aterrizaje + 1 d | Las cifras del panel (elevaciones, márgenes, % de disco, horas, noche más larga, próximos sucesos) iguales a las de la referencia de Python (`core_vectors.json`, bloque `metrics`) | 0,01° y 1 min | Referencia validada en el punto A | Playwright: `e2e/b1.spec.ts` | T-37 |
| B2 | `blue-ghost-1`, base 2025-03-02T08:34Z, 14 d, requisitos por defecto; retrasos de 14 y de 29,5 días | +14 d: `no_go` (la noche empieza ese mismo día y dura unos 14,8 días). +29,5 d: `go` | Semáforo correcto | Periodo sinódico lunar; A1 lo comprueba en Horizons | Automática (`07` §13.7) y Playwright: `e2e/b2.spec.ts` | T-26, T-37 |
| B3 | `blue-ghost-1`, 2025-03-14, altura 0: sucesos de eclipse | Parcial de 05:00 a 09:52 UTC y total de 06:18 a 08:34 UTC (Firefly). Cifras de comprobación del plan (SPICE): 05:01–09:51 y 06:17:30–08:34:00 | 5 min frente a Firefly; 60 s frente a las cifras de comprobación del plan | Firefly Aerospace | Automática, `kernels`: `test_b3_eclipse.py` | T-10 |
| B4 | Sitio (0°, 0°), Luna lisa, 0 m, de 2025-01-01 a 2031-01-01, paso de 10 min: intervalos con el Sol tapado por la Tierra | (a) Cada intervalo detectado contiene el instante de máximo de un eclipse de la tabla siguiente (± 3 h); (b) los 6 eclipses totales de la tabla se detectan con fase total; (c) no hay más de 14 intervalos | Misma fecha | Catálogo de eclipses de la NASA | Automática, `kernels`: `test_b4_eclipse_catalog.py` | T-36 |
| B5 | Solo con F14: elevación de la Luna desde Madrid en 5 instantes y ventanas de contacto | Las de Horizons con la estación como observador | 0,05° y 2 min | JPL Horizons | Automática | T-44 |
| B6 | 10 celdas de la malla (semilla 7, entre las calculadas): máscara del cubo frente a `site-mask` con la misma ley; capa frente a cálculo de sitio | Coinciden | 0,01° en elevación (99 % de los acimuts; 0,02° en todos) y 0,4 puntos en porcentaje | Coherencia entre dos caminos de cálculo | Lenta: `test_b6_cube_vs_site.py` | T-36 |
| B7 | Todas las celdas del conjunto «85S» de `mean186_any` frente a N1 y N2 | Mismo patrón | r > 0,9 | Mapas AVGVISIB del PGDA | Lenta: `compare-nasa` | T-28 |
| B8 | Tres personas ajenas al equipo, tres tareas (`10_interfaz.md` §14) | Cada tarea en menos de 60 s | 2 de 3 personas | Observación directa de A3 | Manual | — |
| B9 | Versión desplegada | Recorrido con teclado; contraste; interfaz visible en menos de 3 s; modo Explore en un móvil real; copia local sin conexión funcionando | Lista completa | Auditoría automática del navegador y prueba manual | Playwright (teclado, móvil emulado) + manual | T-20, T-37 |
| B10 | Entrega | Enlace público sin registro; página del proyecto en inglés; fuentes citadas (`SOURCES.md`); declaración de IA (`AI_USAGE.md`); licencia; vídeo de 30 s o menos con subtítulos en inglés | Todo presente | Guía oficial de entrega | Manual: lista de I3 y A2 | T-38 |
| B11 (opcional) | Imagen de LROC con hora conocida frente a la iluminación calculada en ese instante | Mismo patrón de luz y sombra | Visual | LROC; viabilidad: PENDIENTE DE VERIFICAR (A2) | Manual | — |

Tabla del caso B4 («Lunar Eclipses: 2021 – 2030», F. Espenak, NASA GSFC; hora del máximo en tiempo dinámico TD, unos 70 s por delante de UTC):

| Fecha | Máximo (TD) | Tipo | Magnitud umbral |
| --- | --- | --- | --- |
| 2025-03-14 | 06:59:56 | Total | 1,178 |
| 2025-09-07 | 18:12:58 | Total | 1,362 |
| 2026-03-03 | 11:34:52 | Total | 1,151 |
| 2026-08-28 | 04:14:04 | Parcial | 0,930 |
| 2027-02-20 | 23:14:06 | Penumbral | −0,057 |
| 2027-07-18 | 16:04:09 | Penumbral | −1,068 |
| 2027-08-17 | 07:14:59 | Penumbral | −0,525 |
| 2028-01-12 | 04:14:13 | Parcial | 0,066 |
| 2028-07-06 | 18:20:57 | Parcial | 0,389 |
| 2028-12-31 | 16:53:15 | Total | 1,246 |
| 2029-06-26 | 03:23:22 | Total | 1,844 |
| 2029-12-20 | 22:43:12 | Total | 1,117 |
| 2030-06-15 | 18:34:34 | Parcial | 0,502 |
| 2030-12-09 | 22:28:51 | Penumbral | −0,163 |

Por qué la prueba no exige detectar todos: en un eclipse parcial o penumbral solo parte de la Luna entra en la sombra o la penumbra, y el punto (0°, 0°) puede quedar fuera. En un eclipse total toda la Luna está en la umbra y el Sol queda tapado del todo desde cualquier punto de la cara visible.

## 6. Pruebas de marcos (exigidas por el plan)

| Prueba | Qué demuestra | Dónde |
| --- | --- | --- |
| Usar `IAU_MOON` falla | Sin PCK de texto cargado, `pxform('IAU_MOON', 'J2000', et)` y `spkpos(…, 'IAU_MOON', …)` lanzan error; además, ninguna línea de `pipeline/` ni de `web/src/` fuera de las pruebas contiene `IAU_MOON` ni `MOON_PA` | `05_efemerides.md` §8.6 |
| `MOON_ME` frente a `MOON_PA` | La diferencia máxima de elevación en 2025 es 0,0227° en el sitio previsto de IM-2 y 0,0156° en Blue Ghost 1 (± 0,002°), y siempre mayor de 0,010° | `05_efemerides.md` §8.5 |
| Núcleos bien cargados | Valor de ejemplo del propio `moon_de440_250416.tf` | `03_datos_y_fuentes.md` §2 |
| Solo cuatro núcleos | `ktotal('ALL') == 4` | `05_efemerides.md` §2 |

## 7. Qué corre `make test` y cuánto tarda

| Bloque | Contenido | Duración esperada |
| --- | --- | --- |
| `pytest -m "not data and not slow"` | Proyecciones y lector PDS con ficheros sintéticos; horizonte sintético (A4, A9); visibilidad (fracción, sucesos, solape); con núcleos: marcos, A1 (con `horizons_smoke.csv` hasta que exista `horizons_azel.csv`), A2, A8, A10 liso, B3, tabla frente a SPICE, `MOON_ME` frente a `MOON_PA` | 25–35 s |
| `vitest run` | Núcleo en TypeScript: tabla, marcos, horizonte, fracción, sucesos, métricas, requisitos, ranking, eclipses, malla, decodificación de trozos, vectores compartidos, `summarize`, URL | 8–12 s |
| Esquemas | Todos los JSON de `contract/examples/data/` y `web/public/data/` contra `contract/schemas/` | 2–3 s |
| **Total** | | **< 60 s** |

Si faltan los núcleos, las pruebas `kernels` se saltan con un aviso visible (`SKIPPED: SPICE kernels not found; run make data-fetch`), y `make test` termina con aviso, no con error. En la integración continua, que los tiene en caché, saltarlas es un fallo: el flujo define `LLSN_REQUIRE_KERNELS=1` y `conftest.py` convierte el salto en error (`02_arquitectura.md` §6.1).

`make test-all` añade: pruebas `data` (lectura de DEM, A3, A10 con relieve, máscaras reales: 2–5 min), `slow` (cuando hay cubo) y Playwright (2–4 min).

### 7.1 Del resultado de las pruebas al informe

Cada prueba ligada a un caso usa el accesorio `record_case(case_id, status, expected, obtained, tolerance, source, details, note)`, que escribe `data/out/test_results/<case_id>.json`. `python -m pipeline.cli report` los reúne en `web/public/data/validation_report.json` (`09_contrato_datos.md` §7): los casos sin fichero salen como `skipped`; los manuales (A5, A11, B8, B9, B10, B11) se leen de `docs/manual_checks.json`, que editan A1 y A3 (`{case_id, status, obtained, note, signed_by}`). El titular `A7B7` combina A7 y B7. Lo que ve el jurado es lo que se ha probado.

## 8. Firma de los puntos de validación

**Punto A (sábado, 16:30–17:30; firma a las 17:15).** A1 comprueba, sobre la versión desplegada y el informe:

1. A1, A2, A4, A8, A9 y las pruebas de marcos en verde.
2. A3 calculado (en verde, o con diferencia explicada y decisión anotada).
3. A5 hecho a mano (tres valores anotados).
4. Revisión de sentido físico de 10 min: en tres sitios, la dirección de la Tierra, la duración del día y el signo de los acimuts son los esperados.
5. A10 calculado (no se publica).

El punto A valida números, no vistas: todo lo anterior se comprueba con `validation_report.json` y con la referencia en Python (`make test`, `pipeline/vis`). Si en el control de las 15:30 la interfaz va retrasada, el punto A se celebra igual; las vistas que falten no bloquean los extras de cálculo, solo los de interfaz (`12_tareas.md` §1.3). En ese caso, la revisión de sentido físico del punto 4 se hace con las vistas que haya y con la salida de `python -m pipeline.cli site-mask` y de las pruebas.

A1 escribe la entrada «Punto A firmado» en `docs/decisions.md` e I3 pone la etiqueta `v0.1-base`. Sin esa firma, los extras no empiezan (plan). A6, A7 y A11 quedan para la noche o para el punto B.

**Punto B (domingo, 11:30–13:00).** B1–B4, B6, B7 en verde o explicados; B8, B9 y B10 hechos; A6, A7 y A11 cerrados. Firma de A1 y etiqueta `v1.0` al congelar el código (14:30).

**Fallo de validez** (un número incorrecto): lo declara A1, entra de inmediato como cambio de tipo 1 y bloquea la publicación hasta resolverlo.
