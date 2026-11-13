# 13 · `CLAUDE.md` propuesto para el repositorio del proyecto

La tarea T-01 copia el bloque siguiente, tal cual, al fichero `CLAUDE.md` de la raíz del repositorio. Cubre los doce puntos que pide el plan. Es corto a propósito: lo que no cabe aquí está en `docs/spec/`.

---

```markdown
# Lunar Landing Site Navigator · reglas para Claude Code

## 1. Qué es
Web estática que, para cualquier sitio y fecha, muestra el Sol y la Tierra sobre el horizonte real de la
Luna, cuánto duran la luz y el enlace directo con la Tierra, y qué pasa si cambian el sitio o la fecha
(NASA Space Apps Challenge 2026, reto «Lunar Landing Site Navigator», equipo Aeroinformágicos).
Usuarios: planificador de misión, educador y público. Todo lo pesado se calcula fuera de línea en Python;
la web solo lee ficheros. No hay servidor.

La especificación completa está en `docs/spec/`. Antes de programar una tarea, lee su tarjeta
(`docs/tasks/T-xx.md`) y las secciones que cita. No decidas nada que la especificación ya decide.

## 2. Convenios científicos obligatorios
- Sistema de referencia: **MOON_ME** siempre. Prohibido `IAU_MOON` y `MOON_PA` (hay pruebas que lo vigilan).
- Núcleos SPICE: solo `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`.
  No cargues ningún PCK de texto.
- Radio lunar 1737.4 km; cotas en metros sobre esa esfera. Radio del Sol 695700 km; de la Tierra 6378.137 km.
- Latitud planetocéntrica, norte positiva. Longitud este positiva, (−180, 180] en ficheros e interfaz.
- Acimut desde el norte hacia el este, [0, 360). Elevación sobre el plano perpendicular a la vertical local.
- Tiempo: UTC. En ficheros, ISO 8601 con `Z`; en binarios y dentro del núcleo, segundos Unix.
- Corrección de aberración `LT+S`. Observador a 2 m por defecto.
- Ángulos en grados en ficheros e interfaz; vectores astronómicos en km; relieve en m.
- «Hay Sol» y «hay enlace» = centro del disco sobre el horizonte real. No lo cambies.
- **Ninguna constante sin fuente.** Cada constante nueva se anota en `docs/constants.md` con su fuente.
  Si no tienes fuente, para y pregunta.

## 3. Módulos y dueños
| Directorio | Dueño | Contenido |
| --- | --- | --- |
| `contract/` | I3 | Esquemas, ejemplos, catálogo de sitios |
| `pipeline/` | I1 | Python: efemérides, DEM, horizonte, visibilidad de referencia, cubo, capas |
| `web/` | I2 | TypeScript: `src/core` (núcleo puro), `src/ui`, `src/state`, `src/workers` |
| `ops/` | I3 | Descarga de datos, despliegue, nube |
| `tests/golden/` | A1 | Valores de referencia y tolerancias |
| `docs/` | A2, A3, I3 | Especificación, tareas, decisiones, constantes |

Una sesión trabaja en **un** carril. No edites directorios de otro carril. Si tu tarea lo necesita, para y dilo.
`web/src/core` no importa React ni toca el DOM.

## 4. El contrato es ley
Los ficheros que produce el pipeline y consume la web están definidos en `docs/spec/09_contrato_datos.md`
y en `contract/schemas/`. No cambies formatos, nombres de campo ni unidades. Si crees que hace falta,
para y propón el cambio: lo decide I3, sube `contract/VERSION` y actualiza esquema y ejemplo antes que el código.

## 5. Órdenes
- `make setup` · prepara el entorno (Python 3.12 en `.venv`, Node 24 en `web/`).
- `make test` · pruebas rápidas (menos de 60 s). **Ejecútala antes de cada commit.**
- `make test-all` · todas, incluidas las lentas y las de navegador.
- `make check` · análisis estático y comprobación del contrato.
- `make dev` · web en local. `make build` · web de producción.
- `make ephem`, `make sites`, `make cube-bench`, `make cube`, `make layers`, `make night`, `make compact`, `make report`.
- `make deploy`, `make deploy-heavy`, `make offline`.
Si no hay `make`, usa `npm run <orden>` desde la raíz.

## 6. Pruebas
- Ejecuta `make test` antes de cada commit. No hagas commit en rojo.
- **No modifiques `tests/golden/` ni las tolerancias** (`tests/golden/tolerances.json`), salvo que la tarjeta
  lo diga expresamente.
- Si falla una prueba de referencia (A1–A11, B1–B7, marcos), **para e informa**: no cambies la prueba,
  no relajes la tolerancia, no añadas excepciones.
- Cada función del núcleo nace con su prueba. Los valores esperados salen de la especificación o de
  `tests/golden/`, nunca del propio código que se prueba.
- Python y TypeScript implementan el mismo algoritmo (`docs/spec/07_visibilidad.md` §12). Si cambias uno,
  cambia el otro y los vectores en la misma tarea, o no cambies ninguno.

## 7. Git
- Una rama por tarea: `t-xx-descripcion-corta`. Commits pequeños con mensaje en inglés (`T-08: add radial law`).
- Petición de integración a `main`; integra I3. Nunca `push --force`. Nunca reescribas la historia de `main`.
- Nunca subas datos grandes (límite: 10 MB por fichero), núcleos SPICE, DEM, credenciales ni `.env`.
  `data/` está en `.gitignore`.

## 8. Datos
- No abras ficheros de `data/` (son de cientos de MB): usa las subórdenes de `python -m pipeline.cli`,
  que imprimen resúmenes.
- No lances cálculos largos (cubo, capas, descargas) dentro de la sesión: deja la orden preparada y dila.
- No descargues datos de sitios que no estén en `ops/data_manifest.json`.

## 9. Citas
Toda fuente externa (datos, artículos, bibliotecas, fragmentos de código) se añade a `SOURCES.md`
en el mismo commit en que se usa, con URL y licencia si se conoce.

## 10. Uso de IA
Añade una línea a `AI_USAGE.md` al terminar cada tarea: tarjeta, qué generó la IA y qué revisó una persona.

## 11. Idioma y accesibilidad
- Código, comentarios, mensajes de commit y textos de interfaz en inglés. Los textos de interfaz van en
  `web/src/i18n/en.json`, nunca escritos dentro de los componentes.
- Todo componente nuevo cumple desde el primer commit: paleta de `styles/tokens.css` (apta para daltonismo),
  ningún estado comunicado solo con color, contraste suficiente, manejo completo con teclado, foco visible,
  etiquetas ARIA y estados de carga, vacío y error.
- Cada cifra en pantalla lleva unidad. Las horas se rotulan `UTC`.
- Cada resultado muestra el relieve usado. Sin relieve: Luna lisa con aviso en rojo. Nunca mezcles relieves
  sin decirlo.

## 12. Definición de terminado
- `make test` y `make check` en verde, sin avisos nuevos.
- Contrato respetado (`check-contract` en verde).
- Pruebas de la tarjeta escritas y pasando.
- `SOURCES.md` y `AI_USAGE.md` actualizados.
- Nota de traspaso en `docs/handoff/T-xx.md`: qué se hizo, qué queda, cifras medidas y decisiones tomadas.
- Nada fuera del alcance de la tarjeta. Si ves algo que mejorar en otro sitio, anótalo en el traspaso.

## Cambios durante el evento
Nadie cambia el rumbo de una sesión de palabra. Un cambio llega como una decisión numerada en
`docs/decisions.md` y, si procede, una tarjeta nueva. Empieza siempre con sesión limpia:
«lee la decisión D-xx y haz T-yy».
```

---

## Notas para I3

- El bloque usa nombres de carril (I1, I2, I3, A1…) porque quién es cada persona lo decide el equipo; si se prefiere, se sustituyen por nombres al copiarlo.
- `CODEOWNERS` refuerza los puntos 3, 4 y 6: `tests/golden/ → A1`, `contract/ → I3`.
- Si una regla de este fichero choca con la especificación, manda la especificación y se corrige el fichero con una decisión en `docs/decisions.md`.
