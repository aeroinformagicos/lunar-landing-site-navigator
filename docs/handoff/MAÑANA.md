<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Domingo 15 · Qué hacer antes de las 11:30

Escrito por Claude Code por delegación de I2 a las 03:40 (T-94). Los fallos P-xx están descritos, con capturas, en
`docs/handoff/T-94.md` §2. Peticiones abiertas al escribir esto (`gh pr list`):
[#55 T-64](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/55),
[#56 T-92](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/56), [#57 T-74](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/57), [#58 T-91](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/58) y
[#59 T-94](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/59) (actualizado a las 03:45). Después llegaron, como borradores, [#60 T-90](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/60) (03:24) y [#61 T-93](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/61) (07:02); filas 6 y 7 revisadas a las 08:00.

## 1. Integrar, en este orden

Después de **cada** integración: `git pull`, `make test` y una vuelta rápida a la web publicada (CI la despliega). Al
final de todo, `make test-all` y `node ops/slides_screenshots.mjs`.

**Conflicto que va a salir en todas:** cada rama añade filas al final de `docs/decisions.md`, `AI_USAGE.md` y, algunas,
`docs/constants.md`, `SOURCES.md` y `web/src/i18n/en.json`. Se resuelve **quedándose con las dos partes** (son filas o
claves nuevas, no cambios); en `en.json`, comprobar después que el JSON sigue siendo válido (`make test` lo pilla).

| # | Rama / petición | Qué trae | Riesgo |
| --- | --- | --- | --- |
| 1 | `t-64-fixes-v2` · [#55](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/55) (I1, en el carril de I2 por D-120) | Barra de tiempo con relleno y leyenda, 2D quieta al reproducir, indicador de rumbo en lugar de la tira de 360°, paneles que no pisan la franja inferior, maquetación de tableta y móvil | **Medio.** 48 ficheros, toca `ui/shell`, estilos, `timeline` y `summary`. Su propio `make test-all` dio 119/123 en paralelo (fallos de carga; 3 pasan solos; `stage3d.spec.ts:58` también falla a veces en `main`). Debería arreglar P-04 (tableta), P-12 (móvil) y parte de P-07: **comprobarlo a 768 × 1024 y 390 × 844**. Lo más visible: ir primero. |
| 2 | `t-74-realismo-3d` · [#57](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/57) (I3) | Exageración vertical ×2 (×1 a ras de suelo), normales de cráter, luz de Tierra, encuadre lateral, cielo; en tableta los controles 3D se pliegan | **Medio.** Cambia el aspecto de la 3D justo antes de decidir 3D o 2D por defecto; comparte `ui/shell` y `en.json` con T-64. Tras integrar: medir fps en el portátil de la demo (`?fps=1`) y mirar si arregla P-06 (Sol detrás del conmutador) y P-07. **Con T-64 y T-74 dentro, decidir 3D o 2D por defecto.** |
| 3 | `t-92-par-demo` · [#56](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/56) (I1) | Filas «Sun now» / «Earth now» frente al horizonte real en Compare y texto verdadero del paso 2 | **Bajo.** 20 ficheros; choca con T-64 en `app.css`. **Arregla P-01.** No toca el paso 3 (P-02 sigue). |
| 4 | `t-91-regiones-2022` · [#58](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/58) (I1) | Las 8 regiones de la lista de 2022 que no siguieron en 2024, como puntos candidatos, con máscaras, perfiles y `sites.json` nuevos | **Medio.** Cambia datos publicados (`web/public/data/`): mirar que `check-contract` siga en verde y que el par de la demo y la historia no cambien. Choca con T-94 en `SOURCES.md` (las dos añaden filas). |
| 5 | `t-94-revision-final` · [#59](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/59) (esta) | README final, `SOURCES.md`, `AI_USAGE.md`, guion de capturas, traspaso con P-01–P-21, este fichero, D-140–D-145 | **Bajo.** Sin código de la aplicación. Revisar sobre todo el README (texto que leerá el jurado). |
| 6 | `t-90-extras-aeros` · [#60](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/60) (I3, borrador) | Las 9 propuestas de los ingenieros: historia que atenúa lo que no explica cada paso, halo en las regiones del Map, nota de elevación en Now, «Change requirements», leyenda y columna fija en Replan, iconos en las tarjetas de Sites, explicación de Link dates, una línea por modo, botón «Find the best site» | **Medio.** 24 ficheros, +553; sin pruebas cambiadas, 12 e2e nuevas; su `make test-all` dio 132/132. Inserciones pequeñas en `Panels.tsx` (de I1): **choca con T-64**. Pasar a «listo» antes de integrar. Ver si arregla P-02, P-08, P-10, P-11 (P-10, Share, no aparece en su tabla). |
| 7 | `t-93-energia-comunicaciones` · [#61](https://github.com/aeroinformagicos/lunar-landing-site-navigator/pull/61) (I1, borrador sobre T-64) | Vista «Power & comms» en la franja inferior: potencia de un panel de referencia, energía, batería para la noche más larga y horas de enlace, como estimación rotulada y con fuentes (`core/power.ts`, 11 pruebas unitarias) | **Alto/medio.** 62 ficheros, +1595, porque lleva T-64 dentro: integrar **solo después de #55** (la base de GitHub dice `main`; cambiarla o revisar el diff tras integrar T-64). Sus constantes nuevas ya están en `docs/constants.md` y `SOURCES.md` (choca, trivialmente, con T-94 en este último). **A1 debe revisar las fórmulas** antes de integrar; si no da tiempo, no integrar. |

## 2. Fallos pendientes, por urgencia

Dueño probable entre paréntesis. Si una rama de esta noche ya lo arregla, se dice.

### Bloquea la demo
1. **P-02 · Learn, paso 3 dice lo contrario de lo que se ve** (I3, historia; T-90 si lo trae). «A ridge 138 km away
   blocks the Sun», pero el perfil enseñado dice que el Sol está 1,31° por encima. A B la Tierra se la tapa la ladera del
   propio sitio (bloqueo a 0,0 km, Tierra 14,77° por debajo). Arreglo mínimo: texto del paso sobre la Tierra y vista
   `Toward Earth` del sitio B.
2. **P-03 · `None` en la página Validation** (I1, `make report`). Dos filas de B7 «mean |ours − NASA|» con
   `observed: "None"` en `web/public/data/validation_report.json`. Arreglo mínimo: que el informe escriba el valor de NASA
   que falta o «—», regenerar y subir el JSON. Es alerta roja de la hoja de Málaga.
3. **P-01 · Learn, paso 2 dice que B no tiene «ni Sol ni enlace»** y B tiene Sol al aterrizar. **Lo arregla T-92.**
4. **P-04 · Tableta 768 × 1024 rota** (cabecera montada, panel 3D sobre las cifras, Compare sin columna B). Solo bloquea
   si alguien del jurado la abre en tableta. **T-64 y T-74 deberían arreglarlo:** comprobar tras integrar.

### Se nota
5. **P-14 · `Frame: MOON_ME` a la vista** en el pie de Explore (`metrics.provenance`): la hoja de Málaga lo prohíbe
   fuera de Validation (I2/I1, una línea de `en.json`).
6. **P-05 · «The Sun is -2.52° above the horizon»** en el resumen llano (I1, `summary`): decir «in view, 1.31° above the
   real horizon» como hizo D-119 (j) en la 3D.
7. **P-15 · «Demo site A / B»** como nombres del par: suena a relleno (I1, catálogo; quizá T-92 o T-93).
8. **P-06 / P-07 · 3D:** Sol detrás del conmutador 3D/2D; panel de controles y rótulos de la escena sobre el resumen y
   las cifras a 1280 × 720 (I3; mirar tras T-74).
9. **P-11 · La tarjeta de la historia tapa** las últimas filas de Compare y del ranking (I3, historia).
10. **P-08 · Map:** capa Sun + Earth poco visible, rótulos que se pisan, mapa cortado al abrir Find the best site (I3,
    T-90).
11. **P-09 · Timeline:** «21.17°» sin signo menos y curvas fuera del gráfico (I1 si T-64 toca `timeline`; si no, I2).
12. **P-10 · Share solo en Plan** (I3, TopBar, T-90).
13. **P-12 · Móvil:** pastillas cortadas, barra de tiempo sobre las cifras (T-64 debería arreglarlo).
14. **P-13 / P-20 · Hoja de Málaga, etapas 4 y 6:** zonas pulsables de 14–36 px y textos de 12–13 px en escritorio.
    No da tiempo a todo; si sobra, subir a 14 px las etiquetas de Now at site y la navegación.

### Detalle
15. **P-21 / P-16:** el informe marca B1 y B9 como `Skipped` aunque pasan (Playwright, Lighthouse 100/100); siguen
    `Skipped` A5, A11, B5, B8, B10, B11.
16. **P-17:** `make setup` no instala Chromium de Playwright (sin él `make test-all` da 122 fallos).
17. **P-18:** `make test` tarda unos 3 min (objetivo < 60 s).
18. **P-19:** los saltos de pytest piden `make data-fetch`, que no existe; tampoco `ops/fetch_data.py` (T-03) ni
    `make offline` (T-38). El README ya lo dice.
19. Los paquetes d3 siguen en `web/package.json` sin que nada los importe.

## 3. Comprobaciones finales para la entrega

- [ ] **Repositorio sin claves antes de hacerlo público.** Esta noche (T-94 §4): ninguna clave ni `.env` en el árbol
  ni en la historia de todas las ramas. Repetir tras integrar todo: `git log --all -p | grep -nE "ghp_|github_pat_|AKIA|sk-|BEGIN .*PRIVATE KEY|CLOUDFLARE_API_TOKEN *[:=]"` (no debe salir nada) y `git log --all --name-only --pretty=format: | sort -u | grep -iE "\.env|\.pem|\.key$|wrangler\.toml|\.npmrc"`.
- [ ] **Correos personales en los metadatos de git** (D-141): tres miembros del equipo aparecen con su correo real en
  unos 245 commits. No se pueden quitar sin reescribir `main`. Cada uno decide si le parece bien antes de hacerlo
  público; si alguien no quiere, la única salida es publicar una copia sin historia (lo decide I3).
- [ ] **Ningún logotipo de la NASA** ni de sus misiones: comprobado en `web/` y `docs/`. Mirar también **las
  diapositivas y el vídeo**.
- [ ] **Marca de agua en las imágenes hechas con IA** (D-142): `docs/design/ref-2-emblema.jpg` y `ref-3-concepto.jpg`
  parecen generadas y no llevan marca; si salen en las diapositivas, añadir «AI-generated image» en la propia imagen. Lo
  mismo para cualquier imagen nueva hecha con IA. Las capturas de la web no la necesitan.
- [ ] **Enlaces de la página del proyecto** (Space Apps): web <https://aeroinformagicos-llsn.pages.dev>, repositorio de
  GitHub (público), vídeo y diapositivas. Abrirlos en una ventana privada y en un móvil (B10).
- [ ] Después de integrar: `make test`, `make check`, `make test-all` en verde; `node ops/slides_screenshots.mjs` y
  revisar las nueve capturas.
- [ ] Recorrer otra vez la hoja de Málaga sobre la versión publicada (T-94 §3 tiene el veredicto de esta noche: GO en
  1, 2, 3 y 5; «Aún no» en 4, 6, 7 y la alerta roja).
- [ ] Leer las decisiones firmadas por Claude Code esta noche (D-120–D-149) y las pendientes de A1 (D-114–D-116).
- [ ] Solo entonces: repositorio público y etiqueta `v1.0` (T-38). Esta noche no se ha hecho ninguna de las dos cosas.
