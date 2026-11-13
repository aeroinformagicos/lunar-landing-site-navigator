# 00 · Índice, glosario, convenios y decisiones

Especificación técnica de **Lunar Landing Site Navigator** (equipo Aeroinformágicos, NASA Space Apps Challenge 2026). Quien implemente una tarjeta de `12_tareas.md` no tiene que decidir nada: todo lo que hace falta está en estos ficheros o en las fuentes que citan.

Códigos de persona: A1 = Aero · Validación, A2 = Aero · Datos y mentores, A3 = Aero · Presentación, I1 = Info · Cálculo, I2 = Info · Web, I3 = Info · Integración.

## 1. Mapa de la especificación

| Fichero | Qué responde | Lo lee sobre todo |
| --- | --- | --- |
| `00_indice.md` | Glosario, convenios y registro de decisiones (D-xx) | Todos |
| `01_alcance.md` | Las 30 funcionalidades, su prioridad, su criterio de aceptación y lo descartado | A3, I2, I3 |
| `02_arquitectura.md` | Pipeline Python, web TypeScript, árbol de directorios, dependencias fijadas, órdenes `make`, despliegue y presupuesto de tamaño | I3 |
| `03_datos_y_fuentes.md` | Cada conjunto de datos: URL, tamaño, formato byte a byte, proyecciones, comprobación de lectura, descarga | I1, I3, A2 |
| `04_catalogo_sitios.md` | Tabla de sitios (alunizajes, regiones candidatas, validación, demo) con su relieve y su fuente | A2, I1 |
| `05_efemerides.md` | Tabla de efemérides (`ephemeris.bin`), interpolación y paso a acimut y elevación | I1, I2 |
| `06_horizonte.md` | Algoritmo de la máscara de horizonte, perfil para el corte y casos sintéticos | I1 |
| `07_visibilidad.md` | Fracción de disco, criterios, ventanas, sucesos, eclipses, requisitos, ranking y equivalencia Python–TypeScript | I1, I2 |
| `08_mapa_polar.md` | Malla de 500 m, cubo de horizontes, capas, clic, sitio óptimo F32 y comparación con la NASA | I1, I2, I3 |
| `09_contrato_datos.md` | Cada fichero intercambiado: ruta, formato, esquema, ejemplo y versión | I3 (custodio), todos |
| `10_interfaz.md` | Modos, pantallas, componentes, estados, textos en inglés, accesibilidad, móvil e historia guiada | I2, A3 |
| `11_validacion.md` | Casos A1–A11 y B1–B11, consultas a Horizons, `tests/golden/` y `make test` | A1, I1, I2 |
| `12_tareas.md` | Tarjetas T-01… en orden de construcción, ruta crítica, paralelismo y recortes del plan B | Todos |
| `13_claude_md.md` | El `CLAUDE.md` propuesto para el repositorio del proyecto | I3 |
| `90_dudas_y_riesgos.md` | Posibles errores del plan con propuesta, riesgos y todo lo PENDIENTE DE VERIFICAR | A1, A2, I3 |
| `92_revision.md` | Revisión independiente: problemas encontrados, gravedad y corrección aplicada | I3, A1 |
| `99_fuentes.md` | Todas las fuentes citadas | A2 |

Orden de lectura para implementar: 00 → 09 → el fichero del módulo → la tarjeta de `12_tareas.md`.

## 2. Glosario

| Término | Definición usada en este proyecto |
| --- | --- |
| **MOON_ME** | Sistema de referencia fijo a la Luna «Mean Earth/Polar Axis»: eje Z en el eje medio de rotación (norte), meridiano cero en la dirección media a la Tierra. En el fichero `moon_de440_250416.tf` es un alias (ID 31001) de `MOON_ME_DE440_ME421` (ID 31009), definido por una rotación constante desde `MOON_PA_DE440`. Es el sistema de los DEM de LOLA y SLDEM2015 (`COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"` en sus etiquetas) y el que Horizons llama `MEAN_ME`. |
| **MOON_PA** | Sistema de ejes principales de inercia de la Luna (ID 31000). Difiere de MOON_ME en ~0,02886° (~875 m en superficie). **Prohibido** en este proyecto. |
| **IAU_MOON** | Sistema lunar definido por los elementos de rotación IAU de un PCK de texto. Difiere de MOON_ME hasta ~0,0051° (~155 m). **Prohibido**; no se carga ningún PCK de texto para que su uso falle. |
| **Esfera de referencia** | Esfera de radio R = 1.737,4 km centrada en el centro de masas de la Luna. Todas las cotas son alturas radiales sobre ella. |
| **Cota / altura (`height_m`)** | Distancia radial de un punto del terreno a la esfera de referencia, en metros, positiva hacia fuera. No es altura sobre el geoide. |
| **Latitud** | Planetocéntrica, en grados, positiva al norte, en [−90, 90]. Sobre la esfera coincide con la planetográfica. |
| **Longitud** | Este positiva, en grados. En todos los ficheros del contrato y en la interfaz: intervalo (−180, 180]. Internamente, al indexar teselas SLDEM2015: [0, 360). |
| **Acimut** | Ángulo en el plano horizontal local medido desde el norte local hacia el este: 0° = norte, 90° = este, 180° = sur, 270° = oeste. Intervalo [0, 360). Es el convenio de Horizons. |
| **Elevación** | Ángulo sobre el plano perpendicular a la vertical local (la dirección radial que pasa por el sitio). Positiva hacia el cénit. Sin refracción: la Luna no tiene atmósfera. |
| **Plano tangente local (ENU)** | Base ortonormal en el sitio: E (este), N (norte), U (cénit radial). Ver `05_efemerides.md` §5. |
| **Observador** | Punto a `observer_height_m` (2 m por defecto; 10 m como extra) sobre el terreno del sitio, en la vertical local. |
| **Máscara de horizonte** | Para un sitio y una altura de observador: elevación del horizonte real para cada acimut (720 valores, cada 0,5°), con la distancia, las coordenadas y la cota del punto del terreno que lo fija. No depende de la fecha. |
| **Punto que bloquea** | El punto del terreno que da la elevación máxima en un acimut. Con Luna lisa es el punto de tangencia con la esfera. |
| **Luna lisa** | Cálculo sin relieve: el horizonte es la esfera de referencia vista desde el observador (depresión de 0,087° a 2 m). |
| **Depresión del horizonte** | Ángulo bajo la horizontal al que queda el horizonte de la esfera lisa: acos(R/(R+h)). |
| **Fracción de disco** | Fracción del área del disco aparente (Sol o Tierra) que queda por encima del horizonte real, en [0, 1]. |
| **Hay Sol** | El centro del disco solar está por encima del horizonte real en su acimut. Se muestra además el % de disco visible. |
| **Hay enlace** | El centro del disco de la Tierra está por encima del horizonte real en su acimut. Se muestra el **margen**. |
| **Margen** | Elevación del centro del astro menos elevación del horizonte en su acimut, en grados. Positivo = visible. |
| **Ventana** | Intervalo de tiempo continuo en el que se cumple una condición (hay Sol, hay enlace, ambos). |
| **Suceso** | Instante en que el margen cambia de signo: salida y puesta del Sol (`sunrise`, `sunset`), aparición y pérdida de la Tierra (`earthrise`, `earthset`), inicio y fin de eclipse. |
| **Noche** | Ventana en la que no hay Sol (criterio del centro). «Noche más larga» = la de mayor duración dentro del periodo analizado. |
| **Eclipse** | Desde el sitio, el disco de la Tierra tapa en parte o del todo el disco del Sol. Desde la Tierra es un eclipse de Luna. |
| **Escenario** | Sitio + fecha y hora de aterrizaje (UTC) + duración de la misión + altura del observador. |
| **Sigue valiendo** | Un escenario cumple los tres requisitos de replanificación (ver `07_visibilidad.md` §8): Sol al aterrizar, Tierra al aterrizar y ninguna noche más larga que el límite. |
| **Malla** | Rejilla regular de 500 m en proyección estereográfica polar sur sobre la zona del mapa (752 × 672 celdas). |
| **Cubo** | Conjunto de máscaras de horizonte de todos los puntos de la malla, guardado por trozos de 16 × 16 puntos. |
| **Capa** | Ráster sobre la malla con un porcentaje de tiempo (con Sol, con Tierra, con ambos) en un periodo. |
| **Máscara compacta** | Versión reducida de la máscara (cada 2°, máximo local) para el cálculo del sitio óptimo en el navegador. |
| **Corte** | Perfil del terreno en un acimut con la curvatura de la Luna, la línea de visión al disco y el punto que bloquea (F12). |
| **Estereográfica polar** | Proyección de los DEM polares de LOLA: plano tangente en el polo sur, escala exacta en el polo, longitud 0 hacia arriba y 90° E hacia la derecha. |
| **Cilíndrica simple** | Proyección de SLDEM2015: columnas equiespaciadas en longitud y filas equiespaciadas en latitud. |
| **ppd** | Píxeles por grado. 512 ppd ≈ 59,2 m en el ecuador. |
| **ET / TDB** | Segundos de tiempo dinámico baricéntrico desde J2000; es el tiempo que usa SPICE. |
| **UTC** | Tiempo civil. Único tiempo que aparece en el contrato y en la interfaz. |
| **LT+S** | Corrección de aberración de SPICE: tiempo de luz más aberración estelar. |
| **Contrato** | Conjunto de ficheros que produce el pipeline y consume la web, con su versión (`09_contrato_datos.md`). |
| **Golden** | Valores de referencia de una fuente que no es nuestro código, guardados en `tests/golden/`. |

## 3. Convenios obligatorios

| Tema | Convenio | Motivo |
| --- | --- | --- |
| Sistema | Todo vector y toda coordenada en MOON_ME | Es el de los DEM y el de Horizons (`MEAN_ME`); mezclarlo con MOON_PA gasta la tolerancia entera (0,02°) |
| Radio | R = 1.737,4 km exactos | `A_AXIS_RADIUS` de todas las etiquetas LOLA y SLDEM2015; el que usa Horizons (`Center radii: 1737.4`) |
| Longitud en ficheros e interfaz | Este positiva, (−180, 180] | Es como se publican los alunizajes (E/W) y lo decidido en el plan. La función `wrap180` normaliza |
| Longitud interna para SLDEM2015 | [0, 360) | Las teselas se nombran y se indexan de 0 a 360 (`WESTERNMOST_LONGITUDE`); evita un corte en 180° dentro de una tesela. La función `wrap360` normaliza |
| Latitud | Planetocéntrica, norte positiva | `KEYWORD_LATITUDE_TYPE = "PLANETOCENTRIC"` |
| Acimut | Desde el norte hacia el este, [0, 360) | Convenio de Horizons: `North(0) -> East(90) -> South(180) -> West(270)` |
| Ángulos | Grados decimales en ficheros e interfaz; radianes solo dentro de las funciones | Legibilidad y validación a mano |
| Distancias y vectores astronómicos | km | Unidades de SPICE |
| Cotas, alturas y distancias sobre el terreno | m | Unidades naturales del relieve; el contrato lo indica en el nombre de cada clave (`_m`, `_km`, `_deg`) |
| Tiempo en ficheros | UTC, ISO 8601 con `Z` (`2025-03-16T18:15:00Z`); en binarios, segundos Unix (POSIX) | La web usa `Date.UTC`; ver D-02 |
| Tiempo en la interfaz | UTC, rotulado «UTC» siempre | Evita confusiones de zona horaria como la de Firefly (CST/CDT) |
| Índices de píxel | Base 0, columna `s` hacia la derecha, fila `l` hacia abajo; el centro del píxel (0, 0) está medio píxel dentro de la esquina | Coincide con los valores `*_PROJECTION_OFFSET` de las etiquetas (ver `03_datos_y_fuentes.md` §3) |
| Constantes físicas | Radio del Sol 695.700 km; radio de la Tierra 6.378,137 km; R = 1.737,4 km | Plan («Decisiones que prevalecen» 2); coinciden con la cabecera de Horizons (`Target radii`) |
| Altura del observador | 2 m por defecto; 10 m como extra | Plan |
| Identificadores | `site_id` en minúsculas con guiones (`blue-ghost-1`); claves JSON en `snake_case` | Estables en URL y nombres de fichero |
| Idioma | Código, comentarios, claves y textos de interfaz en inglés; documentación del equipo en español | Reglas del proyecto |
| Versión del contrato | `contract_version` (SemVer) en cada fichero JSON y en la cabecera de cada binario | Plan: «versión del contrato en cada fichero» |

## 4. Registro de decisiones

Cada decisión que el plan dejaba abierta, con su motivo. Las que contradicen o matizan el plan están además en `90_dudas_y_riesgos.md`.

| N.º | Decisión | Motivo |
| --- | --- | --- |
| D-01 | La tabla de efemérides guarda `float32`, paso de 1 h, y se interpola con Lagrange de 4 puntos componente a componente | 5,26 MB en total. El error de `float32` en dirección es < 0,00001° y el de la interpolación cúbica < 0,000001° (`05_efemerides.md` §4): tres órdenes por debajo del requisito de 0,001° |
| D-02 | El eje de tiempos de todos los binarios es el tiempo Unix (segundos POSIX en UTC, días de 86.400 s). Cada muestra de la tabla se genera convirtiendo su etiqueta UTC a ET con SPICE | El navegador trabaja con `Date.UTC`. `naif0012.tls` no tiene segundos intercalares después de 2017, así que entre 2024 y 2044 la correspondencia es exacta; en 1969–1972 el desajuste es de 1 s como mucho (0,00014° de Sol) |
| D-03 | Tramos de la tabla: `main` 2024-01-01 a 2045-01-01 y `apollo` 1969-01-01 a 1973-01-01, con una muestra de guarda antes y otra después de cada tramo | Cubre «2024–2044 más las fechas de Apolo» del plan y permite interpolar en los extremos |
| D-04 | Ficheros de relieve: `LDEM_80S_40M.IMG` (40 m, 80°–90° S, ±304 km, entero de 16 bits, 462.080.000 B), `LDEM_75S_120M.IMG` (120 m, entero de 16 bits) y teselas `SLDEM2015_512_*_FLOAT.IMG` | `LDEM_80S_40M` sustituye a `LDEM_85S_40M` (±152 km), que dejaba tres regiones candidatas con relieve cercano de 120 m; ahora toda la malla y las nueve regiones tienen 40 m (cierre de E-02). Las versiones enteras ocupan la mitad y su paso de 0,5 m sobra |
| D-05 | Producto LOLA para 60°–75° S y para sitios polares cuyo círculo de 300 km se sale del cuadrado de 75° S: `LDEM_60S_120M.IMG` (120 m, entero de 16 bits, 482 MB) | Cubre hasta 60° S en los ejes y hasta 48,5° S en las esquinas (`DSMAP_POLAR.CAT`), así que contiene entero el círculo de 300 km de Chandrayaan-3 e IM-1. Misma resolución que el relieve lejano polar. Resuelve el «A VERIFICAR» del plan |
| D-06 | Los ficheros PDS se leen con un lector propio mínimo (`numpy.memmap` + análisis de la etiqueta), sin GDAL ni bibliotecas PDS | Son matrices binarias sin cabecera con etiqueta separada; evita dependencias difíciles de instalar en Windows |
| D-07 | Ley de muestreo radial única y fija (`full`): 20 m hasta 20 km y, desde ahí, paso del 0,1 % de la distancia hasta 299,88 km (3.709 muestras). Variante `fast` solo para el cubo si la medida de coste lo exige | Error por saltarse una cresta ≤ 0,009° con pendientes del 30 %, por debajo de la tolerancia. Una sola ley hace que mapa y sitio coincidan (caso B6) |
| D-08 | La elevación de cada muestra se calcula con la fórmula cerrada de la esfera (`06_horizonte.md` §4), equivalente al cálculo cartesiano en 3D; la referencia en `float64` la comprueba contra el cálculo cartesiano literal | La forma cerrada no pierde precisión en `float32` (GPU); el cartesiano directo sí (0,02° a 500 m) |
| D-09 | Motor de referencia en NumPy `float64` (sitios) y motor del cubo en PyTorch `float32` (GPU o CPU con el mismo código) | PyTorch se instala con `pip` en Windows con CUDA incluido y el mismo código corre en CPU para las pruebas y la nube |
| D-10 | Fracción de disco por 32 franjas verticales con el horizonte interpolado en cada franja | Idéntica en Python y TypeScript, exacta en 0, 0,5 y 1, y tiene en cuenta que el horizonte cambia dentro del ancho del disco |
| D-11 | Sucesos por barrido cada 10 min y bisección hasta 1 s | Tolerancia de 1 min en B1 con margen; coste despreciable |
| D-12 | Semáforo de replanificación con tres estados: `go`, `marginal`, `no_go` (`07_visibilidad.md` §8) | El plan pide semáforo con tres requisitos fijos; el ámbar marca que se cumple pero con poco margen |
| D-13 | Zona del mapa: rectángulo x ∈ [−200, +176] km, y ∈ [−152, +184] km en estereográfica polar sur; 752 × 672 celdas de 500 m = 505.344 puntos | El cuadrado de ±152 km del plan deja fuera Peak near Cabeus B, parte de Nobile Rim 2 y parte de Mons Mouton Plateau (`08_mapa_polar.md` §1) |
| D-14 | El cubo se guarda en 1.974 trozos de 16 × 16 puntos, comprimidos con gzip, con elevación en `int16` (0,01°) codificada en diferencias y distancia en 1 byte logarítmico | Un clic descarga ~0,2 MB; el cálculo es reanudable trozo a trozo y se ordena por prioridad (regiones candidatas primero) |
| D-15 | Las capas se sirven como matrices `uint8` crudas comprimidas con gzip (3 bandas por periodo), no como imágenes; la web las colorea | La web necesita el número (lectura al pasar el ratón, F32 modo periodo) y el color exacto apto para daltonismo; se evita la gestión de color del navegador |
| D-16 | Los binarios comprimidos se guardan ya en gzip y la web los descomprime con `DecompressionStream` | Tamaño servido independiente del alojamiento |
| D-17 | Web: React + TypeScript + Vite, estado con Zustand, gráficos con módulos de D3 sobre SVG y Canvas, mapa propio en Canvas con `d3-zoom` (sin biblioteca de mapas) | Es la combinación que Claude Code genera con menos errores; el mapa es una sola imagen en una proyección que las bibliotecas de teselas no traen |
| D-18 | Pipeline: Python 3.12, NumPy, SpiceyPy, PyTorch (solo para el cubo y las capas), Pillow, pytest, jsonschema | Intersección de versiones admitidas por los paquetes (`02_arquitectura.md` §3) |
| D-19 | Alojamiento: Cloudflare Pages por subida directa con Wrangler; alternativa GitHub Pages para la aplicación y almacenamiento de objetos para `cube/` | Admite repositorio privado sin coste y 20.000 ficheros; el límite de 1 GB de GitHub Pages queda justo para el cubo |
| D-20 | Dos orígenes de datos configurables en `config.json`: `data_base_url` (ligero, va en el repositorio y se despliega con la aplicación) y `heavy_base_url` (cubo, capas, mapa y máscaras compactas) | La rama principal sigue siendo desplegable sin subir cientos de MB al repositorio, y el origen pesado se puede mover sin recompilar |
| D-33 | El campo `landing_utc` solo se rellena cuando la hora tiene fuente (Blue Ghost 1 y SLIM); para el resto se guarda `landing_date` | La tabla del NSSDCA da fechas, no horas |
| D-34 | Los casos de validación escriben su resultado con `record_case` y el informe se genera solo a partir de esos ficheros y de `docs/manual_checks.json` | «Lo que ve el jurado es lo que se ha probado» (plan) |
| D-21 | En la comparación con AVGVISIB se usa el criterio «cualquier fracción del disco visible», no el del centro | Es el criterio de la NASA según la etiqueta («sunlit (by any fraction of the solar disc)»); comparar con criterios distintos falsea la diferencia |
| D-22 | Periodo de la media de 18,6 años: 6.798 días desde 2026-01-01T00:00:00Z, paso de 1 h | Un ciclo de precesión nodal completo dentro de la tabla, que contiene los meses de 2026–2030 de las capas mensuales: una sola pasada |
| D-23 | Catálogo: coordenadas de los alunizajes tomadas de la tabla del NSSDCA; regiones candidatas con el centro publicado a partir del registro del USGS | Fuente única de la NASA para los alunizajes; para las regiones no hay coordenadas en la nota de prensa de la NASA |
| D-24 | Par de sitios de la demo: se elige con un procedimiento determinista sobre el DEM (`04_catalogo_sitios.md` §5); par de reserva: borde frente a fondo de Shackleton | El plan exige que A1 lo confirme (A11); el procedimiento evita inventar coordenadas |
| D-25 | Los valores de referencia de Horizons los descarga un script (`ops/fetch_golden.py`) que ejecuta A1; el resultado se revisa y se protege | Reproducible, sin copiar a mano 128 valores |
| D-26 | El corte (F12) usa un perfil reducido a 512 intervalos por acimut que conserva en cada intervalo la muestra de mayor elevación | 0,74 MB por sitio sin perder la silueta que ve el observador |
| D-27 | Textos de interfaz en `web/src/i18n/en.json` con claves; sin biblioteca de traducción | Deja F17 (español) como un segundo fichero |
| D-28 | Las cajas de las regiones candidatas son cuadrados centrados en el punto publicado y alineados con los ejes del mapa, con el lado «about N km across» de la fuente | No hay polígonos oficiales accesibles; queda PENDIENTE DE VERIFICAR (A2) |
| D-29 | Fuera de las zonas con relieve (o con coordenadas a medida fuera del mapa), Luna lisa con aviso en rojo; nunca se mezclan relieves sin rotularlo | Plan («Decisiones que prevalecen» 1) |
| D-30 | Licencia del código: MIT. Datos derivados: se publican con la cita de sus fuentes | Las normas piden licencia de código abierto; MIT es la más simple |
| D-31 | El recorte de ±300 km de cada sitio se construye desde la tesela SLDEM2015 completa si está en `data/raw/sldem2015/` con su tamaño exacto y, si no, descargando solo las filas necesarias (cabecera HTTP `Range`) | Sirve igual con los ficheros bajados a mano que con el script; el servidor acepta rangos y por filas la descarga baja a menos de la mitad |
| D-35 | Lista única de ficheros de datos (`03_datos_y_fuentes.md` §10) con URL, bytes exactos y carpeta de destino, en orden de prioridad; `ops/data_manifest.json` es su copia | Un fichero presente con su tamaño exacto vale, venga de donde venga; el script de descarga deja de estar en la ruta crítica |
| D-36 | Caso base de dos cuentas de Claude Code (una por carril; I3 no programa), con reparto por tramos en `12_tareas.md` §11 | Cierre de E-11 |
| D-37 | Regla del control de las 15:30: el punto A valida los números con el informe de validación y la referencia en Python; las vistas que falten no bloquean los extras de cálculo, solo los de interfaz | Cierre de E-11; evita que un retraso de la interfaz pare el cubo y las capas |
| D-38 | Las regiones candidatas se nombran «las nueve regiones candidatas que la NASA seleccionó en 2024 junto al polo sur» (interfaz: `NASA candidate landing regions near the lunar south pole (2024 list)`), sin asociarlas a una misión Artemis | Cierre de E-05: el resumen de la LPSC 2026 las declara específicas de Artemis III |
| D-32 | Con Luna lisa y en las comparaciones con Horizons se usa altura de sitio 0 y altura de observador 0 | Compara lo mismo que calcula Horizons con `Alt = 0` |
| D-39 | Los recortes de SLDEM2015 se alinean con la rejilla global de 512 ppd (bordes en múltiplos de 1/512°) | Cada valor del recorte es un valor exacto de la tesela, sin remuestreo, y `lat_max_deg`/`lon_west_deg360` no dependen de redondeos (`03_datos_y_fuentes.md` §5.3; revisión R-02) |
| D-40 | T-21 y T-39 no llevan código: `sites` y `publish` los crea T-09; `make deploy-heavy` y `make night` (resto del cubo y capas, encadenados y desatendidos) los crea T-25; la prueba B4 pasa de T-32 a T-36 | Ninguna de esas piezas tenía hueco en el reparto de dos cuentas y la prueba B4 es del carril de cálculo (`12_tareas.md`; revisión R-06 a R-10) |
| D-41 | La integración continua baja los cuatro núcleos SPICE con `curl` y define `LLSN_REQUIRE_KERNELS=1`, que convierte en fallo el salto de las pruebas `kernels` | El script de descarga (T-03) llega el domingo o no llega, y sin núcleos la integración continua del sábado no comprobaría los marcos (`02_arquitectura.md` §6.1; revisión R-05) |
| D-42 | Las dos figuras del titular `A7B7` entran en el contrato (`validation/*.png`, campo opcional `figures` del informe) | La página de validación las enseña y no tenían ruta, productor ni formato (`09_contrato_datos.md` §7.1; revisión R-11) |
| D-43 | F18 no atribuye al relieve el ocultamiento de un astro que está por debajo del horizonte liso; dice `below the lunar horizon` | Desde la cara oculta la Tierra está a −43°: culpar a un monte sería falso (`10_interfaz.md` §8; revisión R-03) |
