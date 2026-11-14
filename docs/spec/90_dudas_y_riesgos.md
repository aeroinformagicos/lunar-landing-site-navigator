# 90 · Dudas, riesgos y pendientes de verificar

Tres partes: (1) los puntos del plan que la investigación obligó a revisar, **todos cerrados** con la decisión tomada y los ficheros donde se aplica; (2) riesgos técnicos de esta especificación con su plan B; (3) lista única de lo verificado y de lo que sigue PENDIENTE DE VERIFICAR, con quién lo verifica.

## 1. Puntos del plan revisados (todos cerrados)

| N.º | Qué dice el plan | Qué se encontró | Decisión | Dónde se aplica | Estado |
| --- | --- | --- | --- | --- | --- |
| E-01 | Malla sobre 85°–90° S (±152 km), «ampliar si alguna región queda fuera» | Tres de las nueve regiones no caben: Peak near Cabeus B (x ≈ −181 km), Nobile Rim 2 (x ≈ +156 km) y la mitad norte de Mons Mouton Plateau (y hasta +168 km) | Malla ampliada a 752 × 672 celdas (505.344 puntos, +37 % sobre los ~370.000 del plan), calculada por niveles de prioridad | D-13; `08_mapa_polar.md` §1 y §2 | **Cerrado** |
| E-02 | Relieve fino con `LDEM_85S_40M` «donde exista (40 m) y el de 120 m en el resto» | Con ese fichero (±152 km), las tres regiones anteriores quedaban con relieve cercano de 120 m | El relieve cercano del polo pasa a ser `LDEM_80S_40M.IMG` (40 m, 80°–90° S, ±304 km, 462.080.000 B): toda la malla y las nueve regiones tienen 40 m. El lejano sigue siendo `LDEM_75S_120M` | D-04; `03_datos_y_fuentes.md` §1, §3.1, §4 y §10; `06_horizonte.md` §4.2; `08_mapa_polar.md` §1.2 y §3.1; `09_contrato_datos.md` §10.1 | **Cerrado** |
| E-03 | B2: «con 14 días, noche en el aterrizaje (no válido)» | Con retraso de 14 días el aterrizaje sería el 16/03/2025 a las 08:34 UTC; el Sol se puso ese día entre las 18:00 y las 20:11 UTC. Al aterrizar aún hay Sol; la noche empieza unas 10 h después y dura unos 14,8 días | El resultado esperado se mantiene («no válido», `no_go` por `night_too_long`). La frase correcta, también para el guion y el pitch, es «el Sol se pone a las pocas horas de aterrizar» | `07_visibilidad.md` §13.7; `11_validacion.md` (B2) | **Cerrado** |
| E-04 | «Chang'e-7 … su sitio candidato está en el borde de Shackleton» | Las coordenadas que circulan (88,8° S, 123,4° E) quedan a unos 27 km del centro de Shackleton, cuyo radio es de ~10,5 km, y proceden de una publicación en una red social; la agencia no ha anunciado sitio | El punto del catálogo se llama `Chang'e 7 candidate (near Shackleton)`, con nota de que no es oficial. En el pitch se dice «cerca del cráter Shackleton» y no se enseña como «el sitio de Chang'e 7» | `04_catalogo_sitios.md` §4 y §5.2 | **Cerrado** |
| E-05 | Decir «regiones candidatas de la NASA para el primer alunizaje tripulado de Artemis» | El resumen 1901 de la LPSC 2026 dice que las nueve regiones «are specific to Artemis III» y que la selección «does not affect site selection for Artemis IV and later missions» | Se nombran **«las nueve regiones candidatas que la NASA seleccionó en 2024 junto al polo sur»**, sin asociarlas a una misión. En la interfaz: `NASA candidate landing regions near the lunar south pole (2024 list)` | D-38; `04_catalogo_sitios.md` §1 y §3; `10_interfaz.md` §5 | **Cerrado** |
| E-06 | Comparar el mapa con `AVGVISIB` (correlación > 0,9, diferencia < 10 puntos) | Las etiquetas de AVGVISIB definen «iluminado» como cualquier fracción del disco visible, no el centro | La comparación usa una capa propia con ese mismo criterio (`mean186_any`); la capa del producto sigue siendo la del centro. La página de validación lo explica en una línea | D-21; `08_mapa_polar.md` §8; `10_interfaz.md` §6.7 | **Cerrado** |
| E-07 | Capas con «noche más larga por periodo» (tabla del contrato del plan) | «Decisiones que prevalecen» solo pide tres capas (Sol, Tierra, ambos) | Tres capas obligatorias; la noche más larga queda como campo opcional del contrato (P2) | `09_contrato_datos.md` §9.1 | **Cerrado** |
| E-08 | F1 (base) incluye «clic en el mapa» | El mapa es F11 (P1) | En la base, F1 cubre catálogo y coordenadas a medida; el clic llega con F11 | `01_alcance.md` §3.1 | **Cerrado** |
| E-09 | A10: «sale el 04/03 hacia las 09:10 UTC» | Horizons da el cruce del centro por 0° a las 09:14 UTC (Luna lisa, 0 m) | La prueba usa 09:14 UTC | `05_efemerides.md` §8.3; `11_validacion.md` (A10) | **Cerrado** |
| E-10 | `MOON_ME` frente a `MOON_PA`: «hasta 0,0217° cerca de Shackleton» | El plan no da las coordenadas de ese punto | La prueba se queda con los dos sitios del plan que sí tienen coordenadas (IM-2 previsto y Blue Ghost 1) | `05_efemerides.md` §8.5 | **Cerrado** |
| E-11 | Base (F1–F9, F12, F18) terminada por el carril web antes de las 16:30 | Las tarjetas de la base suman más trabajo de Claude Code del que cabe en ese carril antes del punto A | Caso base de **dos cuentas** con reparto por tramos. Regla del control de las 15:30: si la interfaz va retrasada, el punto A valida igualmente los números con el informe de validación y la referencia en Python; las vistas que falten no bloquean los extras de cálculo, solo los de interfaz | D-36, D-37; `12_tareas.md` §1.3, §11 y §12; `01_alcance.md` §3.1 y §5; `11_validacion.md` §8 | **Cerrado** |
| E-12 | Máscara cada 0,5° hasta ~300 km | A 300 km, dos rayos vecinos distan 2,6 km: un pico más estrecho puede no aparecer | Se mantiene 0,5°. La limitación está documentada y la mejora (0,25° con máximo por pares) queda anotada, sin tarjeta, para después de P1 | `01_alcance.md` §6; `06_horizonte.md` §3; `12_tareas.md` §10 | **Cerrado** |
| E-13 | Alinear las ventanas de cuota de Claude con un mensaje al arrancar | No es materia de la especificación | Queda fuera de la especificación; lo decide el equipo | — | **Cerrado** |
| E-14 | Tolerancia de A3: 30 min; «si el relieve no explica las ~2 h, se investiga» | No se sabe qué llama Firefly «puesta» ni a qué altura están sus paneles | La prueba informa del instante en que se oculta el centro, del instante en que desaparece todo el disco y del horizonte en 269,7°; pasa con el del centro. Si no pasa, se sigue el orden de comprobaciones de `11_validacion.md` §4 y se enseña la diferencia. Resuelto por D-95: A3 retirado | `11_validacion.md` §4 | **Cerrado** |

Consecuencia del cierre de E-11 que el equipo debe tener presente: con dos cuentas, la vista del mapa (T-29) entra el domingo a las 10:45 y no en el hito 2 del sábado a las 00:30, aunque sus datos (cubo y capas) estén listos esa noche. La demo no se ve afectada porque la historia guiada tiene una variante sin mapa. Detalle en `12_tareas.md` §11. Otra consecuencia, que se aparta de la letra de «Decisiones que prevalecen» 4 («se calcula el sábado por la tarde»): con dos cuentas el código del cubo se escribe tras el punto A, el nivel 1 se calcula el sábado hacia las 22:00 y el resto del cubo y las capas de noche (`make night`, D-40), listos el domingo a las 08:00. Se mantiene lo decidido en E-11; la medida de coste sigue siendo «en cuanto el motor pase las pruebas», como pide el plan.

Incoherencia detectada en una fuente, que no afecta al plan: el párrafo de la transformación inversa de `DSMAP_POLAR.CAT` (catálogo de proyecciones de LOLA) invierte el signo de X para el hemisferio sur respecto a su propia fórmula directa y a su texto. La especificación usa la fórmula directa y lo comprueba con una prueba de orientación sobre el cráter Shackleton (`03_datos_y_fuentes.md` §3.1 y §4.4).

## 2. Riesgos técnicos de esta especificación

| Riesgo | Probabilidad | Daño | Prevención | Plan B |
| --- | --- | --- | --- | --- |
| La velocidad real del motor del cubo es mucho menor que la supuesta | Media | Medio | `make cube-bench` en cuanto exista T-24; nivel 1 primero; ley `fast` | Pasos B-0 a B-4 de `08_mapa_polar.md` §9 |
| Faltan ficheros de datos cuando hacen falta (son 22,8 GB con las teselas completas) | Media | Medio | Lista única con prioridades (`03` §10); G0–G3 (2,23 GB) bastan para el punto A; descarga reanudable; por filas, las teselas bajan a ~9 GB | Sitios sin recorte en `smooth` con rótulo rojo; A3 solo necesita la tesela n.º 7 |
| Una combinación de versiones fijadas no instala o no es compatible (NumPy 2.5 con SpiceyPy 8.3, TypeScript 7 con las herramientas) | Media | Bajo | T-01 instala desde cero y anota | Alternativas de `02_arquitectura.md` §3 |
| El alojamiento no acepta el origen pesado (varios cientos de MB, 2.000 ficheros) | Media | Medio | Prueba con ficheros de relleno durante M0 | Almacenamiento de objetos con CORS o servidor en la nube; `heavy_base_url` configurable |
| Con dos cuentas no hay holgura antes del punto A | Alta | Medio | Regla del control de las 15:30; orden de prioridad fijo por cuenta (`12` §11) | El punto A valida números; las vistas se cierran por la noche |
| Con dos cuentas la vista del mapa no llega al hito 2 | Alta | Medio | Nivel 1 del cubo el sábado y resto del cubo y capas de noche (`make night`), listos el domingo a las 08:00; T-29 en versión mínima el domingo a primera hora | Historia guiada con la variante sin mapa; en el pitch, el mapa se enseña solo si T-29 está integrada a las 10:45 |
| La carga inicial (5,26 MB de efemérides) supera los 3 s en móvil | Media | Bajo | La interfaz se pinta antes; caché | Carga por rangos de un año (210 kB) |
| Diferencias entre Python y TypeScript en casos límite (redondeo, empates) | Media | Alto (B1) | Vectores compartidos con tolerancias; redondeos definidos; mismas fórmulas | Corregir el núcleo de la web: manda la referencia de Python validada en el punto A |
| El recorte de SLDEM2015 tiene huecos o costuras no previstas | Baja | Medio | Filtro de valores inválidos y `stats.warning`; prueba de costura | Usar el producto de 256 ppd del mismo directorio (tesela única por banda de 60° × 120°) |
| A3 no cuadra (el relieve no da ~0,9° al oeste de Blue Ghost) | Ocurrió | Alto para el pitch | Comprobar lectura, orientación y altura del observador antes de concluir | Hecho: A3 retirado (D-95); la validación abre con Horizons, el eclipse y el mapa |
| A7 o B7 no llegan a r > 0,9 | Media | Medio | Mismo criterio que la NASA; media 3 × 3; observador a 2 m anotado | Informar de r y del sesgo con su explicación; repetir con observador a 0 m en los 20 puntos |
| El par de la demo no existe con el retraso exacto de 12 días | Media | Alto | Procedimiento con relajaciones (`04_catalogo_sitios.md` §5.1) | Par de reserva y retraso que sí funcione; el guion dice «unos días» |
| `DecompressionStream` no disponible en el navegador del jurado | Baja | Medio | Es estándar en los navegadores actuales | Detectarlo y mostrar `Your browser is too old for the map. The rest of the app works.` |
| El trabajador de F32 tarda demasiado en móviles | Media | Bajo | F32 se ofrece en Plan (escritorio); filtro por región | Limitar a una región por búsqueda |
| Confusión de zona horaria en fechas | Media | Alto | Todo en UTC, rotulado; el campo de fecha se interpreta como UTC; pruebas con 29 de febrero y cambio de año | — |
| Las cajas cuadradas de las regiones no coinciden con los polígonos oficiales | Alta | Bajo | Rotuladas como aproximadas; margen de 2 km en el nivel 1 | Sustituirlas cuando A2 obtenga los polígonos |

Los riesgos de organización, cuota y presentación están en el plan y no se repiten aquí.

## 3. Verificado y pendiente de verificar

### 3.1 Verificado en fuentes abiertas

| N.º | Qué | Resultado | Dónde se aplica |
| --- | --- | --- | --- |
| — | Sintaxis de Horizons para un observador en la superficie lunar y convenio de acimut | `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon_este,lat,alt_km'`; acimut desde el norte hacia el este; marco `MEAN_ME`; radio 1.737,4 km | `03` §8, `11` §2 |
| — | Nombres y tamaños de las teselas SLDEM2015 | 32 teselas de 1.415.577.600 B; 15 necesarias | `03` §5 y §10 |
| — | Producto LOLA para 60°–75° S | `LDEM_60S_120M.IMG` (481.740.800 B) | `03` §4, D-05 |
| — | Coordenadas publicadas de los alunizajes | Tabla del NSSDCA: 27 alunizajes | `04` §2 |
| — | Cifras de prueba del plan (Sol a 0,92° a las 18:15; puesta lisa 20:11; IM-2 a ~2,5°) | Confirmadas con Horizons: 0,925°; 20:10:39 UTC; 2,464° | `05` §8.3 |
| — | Tamaño y URL de los cuatro núcleos SPICE | Comprobados en el servidor de NAIF | `03` §2 y §10 |
| P-03 | Carácter del sitio candidato de Chang'e 7 | No es oficial: Wikipedia toma las coordenadas (88,8° S, 123,4° E) de una publicación en una red social y da el lanzamiento como aplazado, sin fecha de alunizaje | `04` §4; E-04 |
| P-10 | Rueda de PyTorch con CUDA para Windows y Python 3.12 | Existe `torch-2.15.0+cu132-cp312-cp312-win_amd64.whl` en `https://download.pytorch.org/whl/cu132` (también `cu134`) | `02` §3.1 |
| P-12 (parte) | GitHub Pages con repositorio privado | Según la tabla de planes de GitHub, el plan gratuito solo publica desde repositorios públicos; desde uno privado hace falta Pro o Team | `02` §6.2 |
| P-13 | Cota y hora de alunizaje de SLIM | LROC: «(13.3160°S, 25.2510°E, -912 m elevation)» y «On 19 January 2024 at 15:20 UTC» | `03` §5.4; `04` §2 |
| P-14 | Profundidad de Shackleton y sombra permanente de su interior | Zuber et al. (2012): diámetro medio del borde 21 km, profundidad media 4,1 ± 0,05 km, interior en sombra permanente | `03` §4.4 y §6; `12` (T-09) |
| P-23 | Longitudes este negativas en `SITE_COORD` de Horizons | Admitidas; Horizons las devuelve en 0–360 (−153,9852 → 206,0148) | `05` §8.3; `11` §2.3 |

### 3.2 Sigue pendiente

| N.º | Qué | Quién | Cuándo hace falta | Si no se verifica |
| --- | --- | --- | --- | --- |
| P-01 | Centros y tamaños de las 9 regiones en el registro del USGS (`sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8`), y polígonos oficiales | A2 | Antes del lote de sitios | Se usan los valores de nasanow.org, rotulados como aproximados |
| P-02 | Si hubo alunizajes con éxito en 2026 con coordenadas publicadas (dos búsquedas no han encontrado ninguno) | A2 | Catálogo | El catálogo se queda en 27 |
| P-04 | Qué llama Firefly «puesta de Sol» (centro, borde o fin de energía) | A1 | Punto A (A3) | Respondida: Firefly no publica hora de puesta (`docs/handoff/A3-investigacion.md` §1); A3 retirado (D-95) |
| P-05 | Confirmación de que las horas del eclipse de Firefly son UTC−5 | A1 | Punto A | Se mantiene UTC−5 por coherencia con sus notas del día 14 y con las efemérides |
| P-06 | Coordenadas, altura y cifras de los puntos de Mazarico et al. (2011) y de Gläser et al. (2018) | A1 | A6 | A6 se resuelve con la mejor celda de la malla y veredicto manual |
| P-07 | Coste real del cubo (muestras por segundo en la RTX 4060 y en la nube) | I3, I1 | Sábado, tras T-24 | Plan B del mapa |
| P-08 | Que el par de la demo muestra una diferencia real y visible en el DEM (A11) | A1 | Antes del ensayo 1 | Par de reserva |
| P-09 | Compatibilidad de las versiones fijadas entre sí | I3 | T-01 | Alternativas de `02` §3 |
| P-11 | Qué portátiles tienen `make` | I3 | T-01 | `npm run` |
| P-12 | Que Cloudflare Pages acepta la subida del origen pesado | I3 | M0 | Alternativas de `02` §6.2 |
| P-15 | Texto de la cita recomendada para los datos de LOLA (GDR) | A2 | `SOURCES.md` | Se cita el identificador del conjunto del PDS |
| P-16 | Coordenadas y máscara de elevación de las estaciones DSN | A2 | Solo si entra F14 | F14 no entra |
| P-17 | Imágenes de LROC con hora conocida para B11 | A2 | Opcional | B11 no se hace |
| P-18 | Origen de las coordenadas del «sitio previsto» de IM-2 (84,78° S, 29,13° E) | A2 | A10 (secundario) | Se cita el plan |
| P-19 | Que no hay valores sin dato en los recortes de SLDEM2015 ni en las esquinas de P3 usadas | I1 | T-09, T-21 | `stats.warning` lo avisa |
| P-20 | Duración e idioma del pitch local | A3 | Guion | Se prepara para 3 min en español |
| P-21 | Si la página y el vídeo se pueden editar tras el envío | A2, A3 | Domingo | Se entrega la versión final a las 15:30 |
| P-22 | Capacidades exactas de Quickmap y Moon Trek, y tiempo que se tarda hoy | A2 | Pitch | No se dan cifras |
| P-24 | «Athena esperó en órbita a que amaneciera» | A2 | Pitch | No se dice (plan) |
| P-25 | Que el tiempo de carga cumple B9 con la tabla de 5,26 MB | I2 | Domingo, Zona Beta | Carga por rangos |
| P-26 | Valores hexadecimales de la paleta de Okabe e Ito usados en `10_interfaz.md` §2 y su contraste sobre el fondo (la página consultada no los da en texto) | A3 (auditoría: I2) | T-11 | Se ajustan los colores hasta cumplir el contraste; se mantiene la regla de icono o trama |
| P-27 | Velocidades supuestas del muestreo en NumPy y del motor en PyTorch | I1 | T-08, T-24 | Se anota la medida en `docs/constants.md` y se aplica la regla de decisión del cubo |
| P-28 | URL y contenido de la preimpresión «LunarRF» (F-43 de `99_fuentes.md`), que ningún fichero cita | A2 | Solo si se quiere citar | No se cita ni pasa a `SOURCES.md` |

Ninguno de estos puntos bloquea el arranque: cada uno tiene un comportamiento definido si no se verifica.
