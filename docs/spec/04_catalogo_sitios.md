# 04 · Catálogo de sitios

Contenido inicial de `contract/sites.catalog.json` (lo mantiene A2). El pipeline lo convierte en `sites.json` (`09_contrato_datos.md` §4) y calcula una máscara por sitio. Ninguna coordenada de este fichero está escrita de memoria: cada una lleva su fuente.

## 1. Reglas

- `id`: minúsculas y guiones. Longitud este en (−180, 180] (las fuentes que dan 0–360 se pasan restando 360 cuando superan 180).
- `type`: `landing` (alunizaje con éxito y coordenadas publicadas), `candidate_region` (punto representativo de una región candidata de la NASA), `validation` (punto usado por los casos de `11_validacion.md`), `demo` (par de la demo).
- `relief` según la latitud y los datos disponibles (`03_datos_y_fuentes.md` §7): `lola_polar` (≤ −75°), `lola_60s` (entre −75° y −60°), `sldem2015` (|lat| < 60°), `smooth` (sin relieve).
- Cada sitio cuesta una máscara (segundos). El lote completo son 43 sitios.
- Cómo nombrar las regiones candidatas en `name`, `note` y en la interfaz: `NASA candidate landing regions near the lunar south pole (2024 list)`; en español, «las nueve regiones candidatas que la NASA seleccionó en 2024 junto al polo sur». No se asocian a ninguna misión Artemis concreta y nunca se escribe «Artemis III will land» (ver §3).

## 2. Alunizajes

Fuente de todas las coordenadas y fechas de esta tabla: NSSDCA, «Table of Anthropogenic Impacts and Spacecraft on the Moon» (`referencias/sitios/nssdc_tabla.txt`), sistema Mean Earth/Polar Axis de DE421; casi todas proceden de imágenes de LROC (nota «d» de la tabla). Las de Apolo coinciden con la página «Apollo Landing Site Coordinates» del NSSDCA (Wagner et al., *Icarus* 283, 2017).

| `id` | Nombre | Lat (°) | Lon (°) | Fecha | `relief` | Teselas SLDEM2015 (`512_…`) o DEM |
| --- | --- | --- | --- | --- | --- | --- |
| `luna-9` | Luna 9 | 7,13 | −64,37 | 1966-02-03 | `sldem2015` | `00N_30N_270_315`, `30S_00S_270_315` |
| `surveyor-1` | Surveyor 1 | −2,4745 | −43,3398 | 1966-06-02 | `sldem2015` | `00N_30N_270_315`, `30S_00S_270_315`, `00N_30N_315_360`, `30S_00S_315_360` |
| `luna-13` | Luna 13 | 18,87 | −62,05 | 1966-12-24 | `sldem2015` | `00N_30N_270_315` |
| `surveyor-3` | Surveyor 3 | −3,0162 | −23,4180 | 1967-04-20 | `sldem2015` | `00N_30N_315_360`, `30S_00S_315_360` |
| `surveyor-5` | Surveyor 5 | 1,4551 | 23,1943 | 1967-09-11 | `sldem2015` | `00N_30N_000_045`, `30S_00S_000_045` |
| `surveyor-6` | Surveyor 6 | 0,4742 | −1,4275 | 1967-11-10 | `sldem2015` | `00N_30N_315_360`, `30S_00S_315_360`, `00N_30N_000_045`, `30S_00S_000_045` |
| `surveyor-7` | Surveyor 7 | −40,9812 | −11,5127 | 1968-01-10 | `sldem2015` | `60S_30S_315_360`, `60S_30S_000_045` |
| `apollo-11` | Apollo 11 | 0,67416 | 23,47314 | 1969-07-20 | `sldem2015` | `00N_30N_000_045`, `30S_00S_000_045` |
| `apollo-12` | Apollo 12 | −3,0128 | −23,4219 | 1969-11-19 | `sldem2015` | `00N_30N_315_360`, `30S_00S_315_360` |
| `luna-16` | Luna 16 | −0,5137 | 56,3638 | 1970-09-20 | `sldem2015` | `00N_30N_045_090`, `30S_00S_045_090` |
| `luna-17` | Luna 17 (Lunokhod 1) | 38,23764 | −35,00163 | 1970-11-17 | `sldem2015` | `00N_30N_270_315`, `00N_30N_315_360`, `30N_60N_270_315`, `30N_60N_315_360` |
| `apollo-14` | Apollo 14 | −3,64589 | −17,47194 | 1971-02-05 | `sldem2015` | `00N_30N_315_360`, `30S_00S_315_360` |
| `apollo-15` | Apollo 15 | 26,13239 | 3,63330 | 1971-07-30 | `sldem2015` | `00N_30N_315_360`, `00N_30N_000_045`, `30N_60N_315_360`, `30N_60N_000_045` |
| `luna-20` | Luna 20 | 3,7863 | 56,6242 | 1972-02-21 | `sldem2015` | `00N_30N_045_090`, `30S_00S_045_090` |
| `apollo-16` | Apollo 16 | −8,9734 | 15,5011 | 1972-04-21 | `sldem2015` | `00N_30N_000_045`, `30S_00S_000_045` |
| `apollo-17` | Apollo 17 | 20,1911 | 30,7723 | 1972-12-11 | `sldem2015` | `00N_30N_000_045`, `30N_60N_000_045` |
| `luna-21` | Luna 21 (Lunokhod 2) | 25,9994 | 30,4076 | 1973-01-15 | `sldem2015` | `00N_30N_000_045`, `30N_60N_000_045` |
| `luna-24` | Luna 24 | 12,7142 | 62,2129 | 1976-08-18 | `sldem2015` | `00N_30N_045_090` |
| `change-3` | Chang'e 3 | 44,1214 | −19,5117 | 2013-12-14 | `sldem2015` | `30N_60N_315_360` |
| `change-4` | Chang'e 4 | −45,4561 | 177,5885 | 2019-01-03 | `sldem2015` | `60S_30S_135_180`, `60S_30S_180_225` |
| `change-5` | Chang'e 5 | 43,0576 | −51,9161 | 2020-12-01 | `sldem2015` | `30N_60N_270_315`, `30N_60N_315_360` |
| `chandrayaan-3` | Chandrayaan-3 | −69,3741 | 32,32 | 2023-08-23 | `lola_60s` | P3 `LDEM_60S_120M` |
| `slim` | SLIM | −13,3160 | 25,2510 | 2024-01-19 | `sldem2015` | `30S_00S_000_045` |
| `im-1` | IM-1 Odysseus | −80,13 | 1,44 | 2024-02-22 | `lola_polar` | P1 + P2 + P3 (dentro de P1, a 4 km de su borde norte; su círculo de 300 km se sale de P2) |
| `change-6` | Chang'e 6 | −41,6385 | −153,9852 | 2024-06-01 | `sldem2015` | `60S_30S_180_225` |
| `blue-ghost-1` | Blue Ghost Mission 1 | 18,562 | 61,810 | 2025-03-02 | `sldem2015` | `00N_30N_045_090` |
| `im-2` | IM-2 Athena | −84,7906 | 29,1957 | 2025-03-06 | `lola_polar` | P1 + P2 |

27 alunizajes. Notas que van al campo `note`:

- `luna-9`: según el NSSDCA (nota «f»), las coordenadas vienen del primer comunicado y LROC no ha localizado la sonda; el sitio real puede estar a más de 10 km. `note`: `Published coordinates are approximate (lander not located in LROC images).`
- `luna-21`: su fecha queda fuera de la tabla de efemérides; el sitio sirve para cualquier fecha de 2024–2044.
- `im-2`: Athena quedó de lado dentro de un cráter de 20 m (LROC, «IM-2 Athena Seen Obliquely»). El relieve de 40 m no resuelve ese cráter: `note`: `Lander came to rest inside a 20 m crater that the terrain model does not resolve.` No se enseña en la demo (plan).
- `blue-ghost-1`: `landing_utc = 2025-03-02T08:34:00Z` (Firefly: «Successful Touchdown Confirmed», 2:34 am CST del 2 de marzo de 2025 = 08:34 UTC). La usan los casos B2 y B3.
- `slim`: `landing_utc = 2024-01-19T15:20:00Z`. LROC («JAXA SLIM Landing»): «On 19 January 2024 at 15:20 UTC…» y «The SLIM lander on the lunar surface (13.3160°S, 25.2510°E, -912 m elevation)». La cota se usa como comprobación de lectura del recorte (`03_datos_y_fuentes.md` §5.4).
- Para el resto, `landing_utc = null` y `landing_date` con la fecha de la tabla.

No entran: Luna 23 (el NSSDCA la lista como alunizaje suave, pero volcó y la misión no se cumplió; el plan pide alunizajes «con éxito»), los impactos y los alunizajes fallidos (por ejemplo, Hakuto-R Mission 2, que el NSSDCA lista como impacto el 5 de junio de 2025).

**Alunizajes de 2026:** la tabla del NSSDCA no recoge ninguno y las búsquedas hechas no confirman ninguno con coordenadas publicadas. PENDIENTE DE VERIFICAR (A2); si aparece alguno, se añade una fila con su fuente.

Las coordenadas de la lista de Wikipedia «List of artificial objects on the Moon» difieren en varios casos (por ejemplo, da 84°54′ S, 12°54′ E para IM-1): se usa siempre el NSSDCA.

## 3. Regiones candidatas de la NASA

Lista oficial (sin coordenadas): nota de prensa de la NASA «NASA Provides Update on Artemis III Moon Landing Regions» (28 de octubre de 2024) y resumen 1901 de la 57.ª LPSC (2026), «Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions». Centros y tamaños: `https://www.nasanow.org/artemis`, que cita el registro del USGS `sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8`. **Centros y tamaños: PENDIENTE DE VERIFICAR (A2)** en el registro original, que no se pudo leer de forma automática.

| `id` del sitio | `region_id` | Nombre | Lat (°) | Lon (°) | Lado aprox. (km) | x (m) | y (m) | `box_m` [x0, y0, x1, y1] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `region-de-gerlache-rim-2` | `de-gerlache-rim-2` | de Gerlache Rim 2 | −88,2 | −64,6 | 11 | −49.310 | 23.410 | [−54810, 17910, −43810, 28910] |
| `region-haworth` | `haworth` | Haworth | −86,8 | −22,8 | 17 | −37.610 | 89.480 | [−46110, 80980, −29110, 97980] |
| `region-malapert-massif` | `malapert-massif` | Malapert Massif | −86,0 | −0,2 | 12 | −420 | 121.340 | [−6420, 115340, 5580, 127340] |
| `region-mons-mouton` | `mons-mouton` | Mons Mouton | −85,4 | 31,7 | 9 | 73.330 | 118.740 | [68830, 114240, 77830, 123240] |
| `region-mons-mouton-plateau` | `mons-mouton-plateau` | Mons Mouton Plateau | −84,3 | 30,6 | 38 | 88.060 | 148.900 | [69060, 129900, 107060, 167900] |
| `region-nobile-rim-1` | `nobile-rim-1` | Nobile Rim 1 | −85,4 | 37,3 | 11 | 84.570 | 111.020 | [79070, 105520, 90070, 116520] |
| `region-nobile-rim-2` | `nobile-rim-2` | Nobile Rim 2 | −84,0 | 58,8 | 11 | 155.770 | 94.340 | [150270, 88840, 161270, 99840] |
| `region-peak-near-cabeus-b` | `peak-near-cabeus-b` | Peak near Cabeus B | −83,6 | −68,7 | 11 | −181.000 | 70.570 | [−186500, 65070, −175500, 76070] |
| `region-slater-plain` | `slater-plain` | Slater Plain | −87,2 | 125,5 | 11 | 69.140 | −49.310 | [63640, −54810, 74640, −43810] |

- Todas con `type = candidate_region`, `relief = lola_polar`, `replan_candidate = true`. El punto representativo es el centro publicado. Las cajas (D-28) son cuadrados alineados con los ejes del mapa; x e y salen de `08_mapa_polar.md` §1.1. El pipeline recalcula x, y y la caja con todos los decimales; los de esta tabla están redondeados a 10 m.
- Comprobaciones cruzadas hechas: LROC publica un mosaico de «Peak Near Cabeus B» con centro −83,6°, 291,2° E (= −68,8°), coherente; un artículo de *Acta Astronautica* (2024) da para el sitio DM2 de Nobile Rim 2 84°12′ S, 60°42′ E, a unos 8 km del centro usado aquí (otra definición del punto).
- Tres regiones no caben en el cuadrado de 85° S (Peak near Cabeus B, Nobile Rim 2 y parte de Mons Mouton Plateau): por eso la malla del mapa es mayor (`08` §1) y el relieve cercano es `LDEM_80S_40M`, que las cubre todas a 40 m.
- **Cómo se nombran (decidido, E-05).** El resumen de la LPSC 2026 dice que las 9 regiones «are specific to Artemis III» y que la selección «does not affect site selection for Artemis IV and later missions»; desde febrero de 2026 el primer alunizaje tripulado es Artemis IV. Por eso no se asocian a ninguna misión concreta. En español (pitch, documentación): **«las nueve regiones candidatas que la NASA seleccionó en 2024 junto al polo sur»**. En la interfaz: `NASA candidate landing regions near the lunar south pole (2024 list)`.
- Regiones de la lista de 2022 retiradas en 2024: no se incluyen. Si A2 confirma la lista y sus centros, pueden añadirse con `note = "Withdrawn in 2024"` y `replan_candidate = false`.

## 4. Puntos de validación

| `id` | Nombre | Lat (°) | Lon (°) | `relief` | Para qué | Fuente de las coordenadas |
| --- | --- | --- | --- | --- | --- | --- |
| `val-899s` | 89.9° S test point | −89,9 | 0 | `lola_polar` | A1, A8; es el punto de la comprobación con Horizons del plan (allí con 2,1 km de altura) | Plan |
| `val-equator` | Sub-Earth point (0°, 0°) | 0 | 0 | `smooth` | A8 | Plan |
| `im-2-planned` | IM-2 planned site | −84,78 | 29,13 | `lola_polar` | A10 (secundario; no va a la página de validación) | Plan |
| `change-7-candidate` | Chang'e 7 candidate (near Shackleton) | −88,8 | 123,4 | `lola_polar` | A1; ejemplo de replanificación | Wikipedia, «Chang'e 7» («peak near the southeast ridge of Shackleton crater»). Comprobado: Wikipedia toma esas coordenadas de una publicación en una red social, no de la agencia ni de un artículo revisado, y da el lanzamiento como aplazado, sin fecha de alunizaje. No es un sitio oficial. En el pitch se dice «cerca del cráter Shackleton» (E-04). `note`: `Reported candidate site; not an official landing site.` Con estas coordenadas el punto queda a unos 27 km del centro de Shackleton, no sobre su borde (radio ~10,5 km) |
| `shackleton-floor` | Shackleton crater floor | −89,67 | 129,78 | `lola_polar` | Par de reserva de la demo; prueba de orientación de los DEM | Gazetteer of Planetary Nomenclature, ficha 5450 (centro del cráter) |

Los ocho sitios del caso A1 son: `apollo-11`, `blue-ghost-1`, `chandrayaan-3`, `im-2`, `change-7-candidate`, `val-899s`, `change-4` y `change-6`. Los 20 puntos al azar del caso A7 no entran en el catálogo: los genera la prueba (`08` §8.3).

Punto del caso A6 (borde de Shackleton, Mazarico et al. 2011): sus coordenadas y altura siguen PENDIENTES DE VERIFICAR (A1); el caso se resuelve buscando la mejor celda de la malla (`08` §11).

## 5. Par de sitios de la demo

Requisito del plan: dos sitios cercanos con resultados opuestos por una causa que se ve en el DEM; lo confirma A1 (caso A11). La demo solo usa máscaras de sitio, no el cubo.

### 5.1 Procedimiento para elegir el par principal (`python -m pipeline.cli pick-demo`)

1. Entrada: los trozos de nivel 1 del cubo (regiones candidatas) y las capas mensuales de esos trozos.
2. Para cada mes M de 2027-01 a 2028-12 y cada pareja de celdas (A, B) de una misma región a 1.000 m o menos (2 celdas): puntuación = `both(A, M) − both(B, M)`, exigiendo `both(A, M) ≥ 60 %` y `both(B, M) ≤ 10 %`.
3. Se toman las 5 parejas de mayor puntuación (de regiones distintas si es posible) y se calcula para cada una la máscara de sitio completa (ley `full`, 2 m y 10 m, perfil).
4. Para cada pareja se busca una fecha de aterrizaje `t` dentro del mes M (paso de 6 h) que cumpla a la vez: `assess(A, t) = go`; `assess(B, t) = no_go`; `assess(A, t + 12 d) = no_go`; y existe otra región candidata con `go` en `t + 12 d`. Misión de 14 días y requisitos por defecto.
5. Salida: `data/out/demo_candidates.json` con las parejas, la fecha, la distancia entre A y B, el punto que bloquea a B y una frase con la causa. A1 elige una mirando el perfil en QGIS (A11) y A2 la añade al catálogo como `demo-a` y `demo-b` (`type = demo`, `replan_candidate = false`), con `defaults.demo_pair`, `defaults.demo_landing_utc` y `defaults.demo_mission_days = 14`.

Si ningún mes cumple el paso 4 completo, se relajan por este orden: retraso de 10 a 16 días en vez de 12; `marginal` cuenta como válido; distancia entre A y B hasta 2.000 m.

### 5.2 Par de reserva (sin cubo, disponible desde el principio)

| `id` | Lat (°) | Lon (°) | Papel |
| --- | --- | --- | --- |
| `change-7-candidate` | −88,8 | 123,4 | Punto alto cercano a Shackleton |
| `shackleton-floor` | −89,67 | 129,78 | Fondo del cráter: sin Sol y sin Tierra |

Están a unos 27 km: no cumple lo de «unos cientos de metros», pero el contraste es seguro porque el fondo del cráter está en sombra permanente (es el plan B del riesgo «el par de la demo no muestra diferencia»). Si la máscara de `change-7-candidate` no da buena iluminación, el primer miembro del par de reserva pasa a ser la celda más iluminada del borde de Shackleton que encuentre la prueba A6 (`08` §11). Son también los sitios con los que arrancan los datos de ejemplo (`09` §13) y los valores iniciales de `defaults.demo_pair` hasta que exista el par principal.

## 6. Orden del lote

`make sites` calcula en este orden y publica cada sitio en cuanto termina:

1. **Primer lote (M5, 14 sitios, 12 polares):** las 9 regiones, `im-2`, `change-7-candidate`, `shackleton-floor`, `blue-ghost-1` y `apollo-11`. Solo necesita los grupos de datos G1, G2 y el recorte de Apollo 11.
2. `val-899s`, `im-2-planned`, `demo-a`, `demo-b` (cuando existan).
3. El resto de alunizajes, según lleguen sus recortes (G4) y P3 (G5): primero `apollo-17`, `slim`, `chandrayaan-3`, `change-4`, `change-6`, `im-1`; después los demás por fecha.

Un sitio cuyo recorte no esté disponible se publica con `relief = smooth`, `has_mask = false` y el rótulo rojo; se recalcula cuando llegue el dato.

## 7. Pruebas del catálogo

- `sites.catalog.json` valida contra el esquema; ids únicos; longitudes en (−180, 180].
- Cada sitio `sldem2015` tiene |lat| ≤ 50,1° (todo el círculo de 300 km cabe en SLDEM2015): se cumple en los 24 (máximo: Chang'e 4, 45,46°). Son 24: los 27 alunizajes menos `chandrayaan-3`, `im-1` e `im-2`.
- Cada región cae dentro de la malla con su caja entera.
- Para cada sitio con máscara: `sites.json.height_m` coincide con `horizon/<id>.json.site_height_m`.
- Comprobación de A2 en QGIS de la cota de 5 sitios (Blue Ghost 1, Apollo 11, IM-2, una región y `shackleton-floor`), con tolerancia de 20 m frente a `height_m`.
