<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Decisiones

Registro de decisiones tomadas durante el evento. D-01 a D-43 están en `docs/spec/00_indice.md` §4;
aquí se sigue la numeración. Un cambio de rumbo llega como una decisión numerada y, si procede, una
tarjeta nueva (CLAUDE.md, «Cambios durante el evento»).

| N.º | Fecha | Decisión | Motivo | Quién |
| --- | --- | --- | --- | --- |
| D-44 | 2026-11-13 | Los datos de entrada están **fuera del repositorio**, en `$LLSN_DATA_DIR` (en los portátiles, `C:\lunar_datos`), con la misma estructura interna que la especificación da bajo `data/`: `kernels/`, `raw/lola/`, `raw/sldem2015/`, `raw/nasa_illum/`; las salidas derivadas (`crops/`, `out/`) también cuelgan de `$LLSN_DATA_DIR`. Donde la especificación dice `data/…` se lee `$LLSN_DATA_DIR/…`; sin la variable, `./data` (que está en `.gitignore`). `--data-dir` de `pipeline.cli` toma ese valor por defecto. La integración continua define `LLSN_DATA_DIR=$GITHUB_WORKSPACE/data`. Las salidas que se versionan (`web/public/data/`) no cambian | Los datos ya estaban bajados en `C:\lunar_datos` (G0–G6 parcial) y ocupan decenas de GB; la variable ya estaba prevista en `02_arquitectura.md` §5 | I1 (cuenta 1), por indicación del equipo |
| D-45 | 2026-11-13 | Proyectos de Cloudflare Pages: `aeroinformagicos-llsn` (aplicación + origen ligero, `make deploy` y la integración continua en cada integración en `main`) y `aeroinformagicos-llsn-data` (origen pesado, `make deploy-heavy`, T-25). Secretos de GitHub `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, los crea I3. Sin secretos, el paso de despliegue se salta con un aviso, no falla | Concreta los proyectos «app» y «data» de `02_arquitectura.md` §6.2 | Equipo |
| D-46 | 2026-11-13 | Normas oficiales de Space Apps 2026: (a) el uso de IA se reconoce en los metadatos: cada fichero fuente empieza con `AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos` (en la línea 2 si la 1 es un `#!`; los JSON quedan fuera porque no admiten comentarios) y `README.md` tiene la sección «Use of AI»; los commits llevan el pie `AI-assisted: Claude Code` (`.claude/settings.json`); (b) nada de logotipos ni elementos de marca de la NASA en la interfaz ni en imágenes generadas; (c) README y todo texto visible para el jurado, en inglés | Normas del concurso; la prueba `pipeline/tests/test_repo_rules.py` vigila (a) | Equipo |
| D-47 | 2026-11-13 | Flujo de cada tarea (CLAUDE.md §7): `git switch main` + `git pull` al empezar; la rama sale de `main` o, si una tarea de la que depende no está integrada, de la rama de esa tarea; al terminar, `make test` en verde, `git push`, `gh pr create` a `main` y se da el enlace. T-01 es la excepción: va directamente a `main` porque el repositorio estaba vacío | Repositorio vacío al empezar | Equipo |
| D-48 | 2026-11-13 | `make <orden>` y `npm run <orden>` son envoltorios de un único ejecutor, `ops/tasks.mjs` (Node), en lugar de repetir las recetas en el `Makefile` y en `package.json` | Una sola definición que funciona igual en Windows (Git Bash o PowerShell) y en Linux, con o sin `make` (`02_arquitectura.md` §4.1, §5) | I1 (cuenta 1) |
| D-49 | 2026-11-13 | T-07 se hace antes que T-04 y crea `pipeline/common/constants.py` (solo `R_MOON_KM` y `R_MOON_M`) y `pipeline/common/geo.py` (`wrap180`, `wrap360`, `unit_vector`, `latlon_of_unit`, `site_position_km` y su inversa: `03_datos_y_fuentes.md` §3.4). T-04 **amplía** esos dos ficheros (resto de constantes de `05_efemerides.md` §1, `enu_basis`) en vez de crearlos: si T-07 no está en `main` cuando empiece T-04, la rama de T-04 sale de `t-07-pds-grids-dem-stack` | La tarjeta T-07 solo depende de T-01, pero su especificación incluye `03` §3.4, que también es de T-04; dos ramas que crean el mismo fichero chocarían al integrar | I1 (cuenta 1) |

## Versiones

Todas las versiones fijadas en `02_arquitectura.md` §3 se instalaron sin cambios en la instalación
limpia de T-01 (Windows 11, Python 3.12.7, Node 24.22.3, npm 11.19.1). Tipos añadidos que la tabla no
fijaba: `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@types/d3-array` 3.2.2, `@types/d3-scale`
4.0.9, `@types/d3-shape` 3.2.0, `@types/d3-selection` 3.0.12, `@types/d3-zoom` 3.0.9.

## Despliegues

| Etiqueta | Fecha | URL |
| --- | --- | --- |
| — | — | — |
