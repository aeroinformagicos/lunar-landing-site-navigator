# 01 · Alcance

Qué construimos, en qué orden de importancia y cómo se sabe que cada funcionalidad está terminada. Son las 30 funcionalidades vigentes del plan: 11 en la base, 6 en P1, 12 en P2 y 1 en P3.

## 1. Producto en una frase

Una web estática que, para cualquier sitio y fecha, muestra el Sol y la Tierra sobre el horizonte real de la Luna, cuánto duran la luz y el enlace directo con la Tierra, y qué pasa si cambian el sitio o la fecha. En el polo sur, además, responde a un retraso de la misión y busca el mejor sitio.

Usuarios: planificador de misión (modo Planificar), educador y público (modos Explorar y Aprender).

## 2. Progresión en tres fases

La especificación y el orden de construcción respetan la visión del equipo:

| Fase | Qué hace el usuario | Funcionalidades | De qué datos depende |
| --- | --- | --- | --- |
| 1. Sitios conocidos | Elige un sitio donde ya se ha aterrizado (o una región candidata) y ve su horizonte, el corte del relieve y las trayectorias del Sol y la Tierra, con un sí o un no | F1–F9, F12, F18 y F10 | Máscaras por sitio |
| 2. Punto elegido en el mapa | Pincha en el mapa del polo donde quiere aterrizar y obtiene lo mismo para ese punto | F11 (y F1 con clic) | Cubo y capas |
| 3. Búsqueda del mejor sitio | Pide el mejor punto para un periodo o a partir de una fecha y hora | F32 (y F19 en P2) | Capas y máscaras compactas |

Cada fase es presentable por sí sola. La demo (historia guiada, F15) solo necesita la fase 1; enseña la 2 y la 3 si existen.

## 3. Funcionalidades, prioridad y criterio de aceptación

Prioridades: **Base** (el producto mínimo; se valida en el punto A), **P1 demo** (ruta crítica de la demo), **P1**, **P2**, **P3**. Las filas van en orden de construcción. «Tareas» remite a `12_tareas.md`.

### 3.1 Base (11)

| N.º | Funcionalidad | Fase | Criterio de aceptación comprobable | Tareas |
| --- | --- | --- | --- | --- |
| F1 | Selección de sitio: catálogo, coordenadas a medida y clic en el mapa | 1, 2 | El selector lista todos los sitios de `sites.json` agrupados por tipo y permite buscar por nombre; al elegir uno, la tarjeta muestra nombre, latitud, longitud y el rótulo de relieve. En Planificar, unas coordenadas a medida válidas crean un escenario (punto de malla más cercano o Luna lisa con aviso rojo) y unas no válidas muestran el error del campo | T-14, T-29 |
| F2 | Escenario: fecha y hora de aterrizaje y duración, con deslizador y reproducción | 1 | Se puede fijar fecha y hora UTC (dentro de 2024–2044 o 1969–1972) y duración (0,5–60 días); el deslizador mueve el cursor por la misión y la reproducción lo avanza sola a 3 velocidades; todas las vistas se actualizan en menos de 100 ms | T-14 |
| F3 | Panorama legible: vista de 40° centrada en el Sol o la Tierra, zoom del horizonte rotulado y tira de 360° | 1 | Con `im-2` y una fecha con el Sol a menos de 2° del horizonte, se distingue a simple vista si el disco está por encima, cortado o por debajo; los ejes llevan grados; la tira de 360° marca la ventana visible y permite saltar a otra dirección | T-15 |
| F4 | Horizonte real frente a Luna lisa, con la diferencia en cifras | 1 | Un conmutador dibuja la línea de la Luna lisa sobre el panorama y un cuadro da la diferencia en horas de Sol, horas de enlace y hora del primer suceso solar; en Blue Ghost 1 el 16/03/2025 la puesta real sale antes que la lisa | T-15 |
| F5 | Línea temporal con curvas de elevación del Sol y la Tierra y barras de ventanas | 1 | La línea temporal muestra las dos curvas, la del horizonte en su acimut y tres barras (Sol, Tierra, ambos) coherentes con los sucesos; al pasar el puntero se leen hora, elevación y margen; un clic mueve el cursor | T-16 |
| F6 | Cuenta atrás hasta la puesta de Sol y la pérdida de la Tierra | 1 | Con el cursor en un instante con Sol, se lee `Sunset in Dd HHh MMm` y coincide con el suceso de la línea temporal al minuto; sin Sol, pasa a `Sunrise in…`; lo mismo para la Tierra | T-16 |
| F7 | Métricas: elevación solar, % de disco visible, horas de luz, ventana de enlace y noche más larga | 1 | El panel muestra las cinco cifras con unidad, ayuda y fuente; coinciden con la referencia de Python a 0,01° y 1 min (caso B1) | T-16 |
| F18 | Resumen en lenguaje llano con el porqué | 1 | Para cada escenario hay de una a tres frases generadas por plantilla que dicen si hay Sol y enlace, hasta cuándo y, si algo falla, qué relieve lo tapa, en qué dirección y a qué distancia; los números de las frases son los del panel | T-17 |
| F12 | Corte del relieve hacia el Sol o la Tierra, con curvatura, línea de visión y punto que bloquea | 1 | La pestaña Corte dibuja el perfil en el acimut del astro elegido, la línea al centro del disco, la línea del horizonte y el punto que bloquea con su distancia y su cota; con Luna lisa se ve la caída de la esfera; al mover el cursor de tiempo cambia el acimut | T-09, T-18 |
| F8 | Comparación lado a lado de 2 a 4 escenarios | 1 | Con 2, 3 o 4 tarjetas, la vista de comparación muestra una columna por escenario con las mismas métricas y la mejor cifra de cada fila resaltada; añadir, duplicar y quitar tarjetas funciona; nunca hay más de 4 | T-19 |
| F9 | Página de validación: tres predicciones frente al hecho real y tabla completa a un clic | 1 | La página se genera solo a partir de `validation_report.json`; abre con el eclipse (B3), la puesta de Sol de Blue Ghost (A3) y el mapa frente a la NASA (A7/B7), cada uno con predicción, hecho, tolerancia, fuente enlazada y estado; un control despliega la tabla de todos los casos | T-22, T-23 |

**La base está terminada cuando** hay una URL de previsualización, al menos 12 sitios (5 polares) responden para cualquier fecha entre 2024 y 2044, F1–F9, F12 y F18 cumplen su criterio y A1 firma el punto de validación A (sábado, 17:15).

**Firma del punto A con la interfaz retrasada.** Si en el control de las 15:30 del sábado la interfaz va por detrás del reparto, el punto A se firma igualmente sobre los números, con el informe de validación y la referencia en Python. Las vistas de la base que falten no bloquean los extras de cálculo (cubo, capas, referencia de replanificación); solo bloquean los extras de interfaz, que no empiezan hasta que esas vistas estén integradas (`12_tareas.md` §1.3). En F1, el clic en el mapa llega con F11; en la base, F1 cubre el catálogo y las coordenadas a medida.

### 3.2 P1 (6)

| N.º | Funcionalidad | Prioridad | Fase | Criterio de aceptación comprobable | Tareas |
| --- | --- | --- | --- | --- | --- |
| F10 | Replanificación: matriz sitio × fecha con semáforo, siguiente ventana válida, alternativas y ranking de las regiones candidatas | P1 demo | 1 | La matriz muestra 31 fechas por sitio con color e icono; al cambiar el retraso, las celdas cambian; para cada fila se lee la siguiente ventana válida; el ranking ordena las 9 regiones para la fecha elegida; en Blue Ghost 1, +14 días da `Doesn't work` y +29,5 días `Works` (caso B2); los requisitos (duración y noche máxima) se editan en Planificar | T-26, T-27 |
| F11 | Mapa 2D del polo sur en malla de 500 m con capas y clic | P1 demo | 2 | El mapa muestra el relieve sombreado, las tres capas (Sol, Tierra, ambos) para la media de 18,6 años y para cada mes de 2026–2030, leyenda y contornos de las regiones; al pasar el puntero se leen latitud, longitud, cota y los tres porcentajes; un clic crea un escenario rotulado `Nearest mesh point…` con sus horas; 10 celdas coinciden con el cálculo de sitio (caso B6); con el plan B, el fondo va rotulado como dato de la NASA | T-24, T-25, T-28, T-29, T-39 |
| F15 | Historia guiada de 60 s, que es el guion de la demo | P1 demo | 1 | El modo Aprender recorre los pasos del guion de `10_interfaz.md` §11 con «Next» y «Back» (y teclado); cada paso deja la aplicación en un estado exacto y reproducible; el recorrido completo dura 60 s leyendo en voz alta; funciona sin el origen pesado | T-30 |
| F13 | Eclipses: aviso cuando la Tierra tapa el Sol | P1 | 1 | En Blue Ghost 1, el 14/03/2025, la línea temporal marca el eclipse de 05:01 a 09:51 UTC y la totalidad de 06:17 a 08:34 UTC (± 5 min, caso B3), el panel avisa y el panorama dibuja la Tierra delante del Sol; `lit_fraction` baja a 0 en la totalidad | T-10, T-32 |
| F16 | Enlace compartible con el escenario en la URL | P1 | 1 | El botón `Share` copia una URL que, abierta en una ventana privada, reproduce escenarios, cursor, modo, pestaña y capa; una URL manipulada no rompe la aplicación (se ignora lo no válido y se avisa) | T-33 |
| F32 | Sitio óptimo: más tiempo de Sol y Tierra a la vez en un periodo, o más tiempo seguido desde una fecha y hora | P1 | 3 | Modo periodo: para un mes y una región, se marca la mejor celda y se listan 10 con sus porcentajes. Modo fecha: para una fecha y hora, el trabajador devuelve en menos de 10 s los mejores puntos de las regiones, los 3 primeros se recalculan con la máscara completa y el mejor puede añadirse como escenario; filtro por región; la interfaz no se bloquea mientras calcula | T-34, T-35 |

### 3.3 P2 (12) y P3 (1)

Solo se tocan si todo P1 está integrado el domingo a las 00:30. Lo realista es que entren dos o tres. Orden por carril según el plan.

| N.º | Funcionalidad | Carril | Criterio de aceptación comprobable | Tarea |
| --- | --- | --- | --- | --- |
| F21 | Sensibilidad: mover el sitio 500 m o subir el mástil a 10 m | I1, I2 | Un control cambia entre 2 m y 10 m (máscara ya publicada) y, en el mapa, entre las 8 celdas vecinas; se muestra la diferencia en horas de Sol y de enlace | T-40 |
| F19 | Buscador de sitios por requisitos | I1, I2 | Dados los requisitos de F10 y una fecha, el mapa resalta las celdas de las regiones que cumplen `go` y da su número | T-41 |
| F22 | Capa de sombra permanente y distancia a la más cercana | I2 | Capa binaria a partir de `LPSR_85S_060M_201608` remuestreada a la malla; la tarjeta de un punto del mapa da la distancia a la celda en sombra permanente más cercana | T-42 |
| F24 | Márgenes: ventanas seguras frente a marginales | I1, I2 | La línea temporal distingue con trama las horas con margen solar < 0,27° o margen de la Tierra < 1° | T-43 |
| F14 | Estaciones DSN con contacto en cada momento | I1, I2 | Para un instante se listan las estaciones con la Luna sobre su máscara de elevación; caso B5 en verde | T-44 |
| F17 | Interfaz en español | I2 | Un selector cambia todos los textos a `es.json`; no queda ninguna cadena sin traducir | T-45 |
| F25 | Calendario anual de un sitio por día lunar | I2 | Cuadrícula de 12–13 días lunares × horas con las tres barras; un clic fija la fecha de aterrizaje | T-46 |
| F20 | Plantillas de perfil de misión y requisitos editables | I2 | Tres plantillas (`Short lander 14 d`, `Crewed sortie 6 d`, `Long-duration 60 d`) rellenan duración y requisitos | T-47 |
| F23 | Capa de pendiente del terreno | I1 | Capa de pendiente (°) calculada con diferencias centrales sobre P2 a 500 m; sirve de filtro en F32 | T-48 |
| F26 | Animación del mapa en el tiempo | I2 | Un botón recorre los 60 meses a 2 por segundo con el mes rotulado | T-49 |
| F30 | La Tierra con su fase y su balanceo en el panorama | I2 | El disco de la Tierra se dibuja con el terminador según la dirección del Sol y su posición refleja la libración a lo largo de un mes | T-50 |
| F31 | Exportación a CSV y PNG y máscaras descargables | I3 | Botones que descargan las ventanas del escenario en CSV, la vista actual en PNG y el JSON de la máscara | T-51 |
| F27 (P3) | Globo 3D de contexto con terminador y punto subterrestre | I2 | Esfera con la textura del sombreado, el terminador y los marcadores de sitio; no participa en ningún cálculo | T-52 |

Regla de admisión de extras (plan): un extra solo se integra si un usuario novato puede ignorarlo sin enterarse de que existe. Todo P2 vive en el modo Planificar o detrás de un control secundario.

## 4. Qué enseña cada modo

| Modo | Funcionalidades visibles | Para quién |
| --- | --- | --- |
| Explorar (por defecto) | F1 (solo catálogo y clic en el mapa), F2–F8, F12, F18 y, cuando existan, F11 y F13 | Público, jurado con el móvil |
| Planificar | Todo lo de Explorar más coordenadas a medida, F10, F16, F32, requisitos y todo P2 | Planificador de misión |
| Aprender | F15 | Educador, demo |

La página de validación (F9) es accesible desde los tres modos.

## 5. Alcance según el número de cuentas de Claude

El caso base son dos cuentas (una por carril; I3 no programa). Con una tercera cuenta se recupera el calendario completo del plan.

| Momento | Dos cuentas (caso base) | Con una tercera cuenta |
| --- | --- | --- |
| Punto A (sábado, 16:30) | Números validados; F1, F2, F5, F6, F7 y F9 en la web | F1–F9, F12 y F18 completas |
| Sábado, 19:15 | Entran F3, F4 y F18 | Entran F10 y F11 |
| Sábado, 22:45–00:30 (hito 2) | Entran F12, F8 (dos escenarios), F10 y F15. De F11, el nivel 1 del cubo; el resto del cubo y las capas se calculan de noche (`make night`) y los datos de F32 (máscaras compactas, T-34) el domingo por la mañana | F15; después F13, F16 y F32 |
| Domingo, 10:45 | Entra la vista de F11 (versión mínima). F13, F16 y F32 solo si queda tiempo antes de las 11:30 | Se cierra P1; P2 solo si todo P1 estaba integrado a las 00:30 |

El detalle por tarjeta y por tramo horario está en `12_tareas.md` §11 (dos cuentas) y §12 (tercera cuenta).

## 6. Fuera de alcance

Descartado por el plan y no se construye: servidor o API propia; vista 3D local con sombras; modelo de energía; asistente con IA; modelo térmico; trayectorias y delta-v; cuentas de usuario; app nativa; juego educativo completo; satélites relé; horizonte fino en toda la Luna y polo norte; realidad virtual o aumentada.

Límites conocidos del producto, que se dicen tal cual si el jurado pregunta:

- El relieve no resuelve rasgos menores que el píxel (40 m en el polo, 59 m fuera, 120 m lejos o entre 60° y 75° S): un cráter de 20 m como el de Athena no se ve.
- Fuera del catálogo y de la malla del polo sur no hay relieve: Luna lisa con aviso.
- «Hay enlace» es geometría: línea de visión a la Tierra. No modela antenas, potencia ni qué estación terrestre está de cara a la Luna (eso es F14).
- La Tierra no tiene atmósfera en el cálculo de eclipses; los instantes reales de totalidad pueden diferir en torno a un minuto.
- La máscara se muestrea cada 0,5° de acimut; un pico más estrecho que eso a gran distancia puede no aparecer.

## 7. Trazabilidad con el reto

| Objetivo del enunciado | Funcionalidades |
| --- | --- |
| Selección y comparación interactiva de sitios; coordenadas a medida | F1, F8, F11 |
| Flexibilidad de fecha y hora; días lunares y estaciones | F2, F10, F25 |
| Posición del Sol y la Tierra respecto al horizonte; tiempo hasta la puesta | F3, F4, F6, F12 |
| Energía y comunicaciones: elevación solar, duración de la luz, ventanas de la Tierra | F5, F7, F13, F14 |
| Varias formas de visualización | F3, F5, F11, F12, F27 |
| Dinámica temporal | F2, F5, F26 |
| Accesible para varios niveles | Modos, F15, F18, F17 |
| Topografía real, libración, relieve del polo sur | Máscaras y cubo, F30, F22, F23 |
| Responder rápido a cambios de calendario | F10, F32, F19, F16 |
