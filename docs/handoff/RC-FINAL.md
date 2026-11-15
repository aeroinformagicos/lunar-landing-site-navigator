<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# RC-FINAL · revisión de los aeroespaciales (15/11/2026, 10:45–11:10)

Rama `rc-final`. Decisiones D-150 y D-151, firmadas «Decidido por Claude Code por delegación de I1».

## P-xx que bloqueaban la demo
- **P-02** (Learn, paso 3): **arreglado** (D-150, commit `99e6a6a`). El paso enseña el perfil hacia la Tierra y
  dice que el terreno junto al módulo tapa la Tierra (antes: «a ridge 138 km away blocks the Sun», falso).
- **P-03** (`None` en Validation): **ya estaba arreglado** en `rc-final`: las filas B7 «mean |ours − NASA|»
  tienen `expected: null` y la página lo pinta como «—» (`detailValue`).
- **P-04** (tableta 768 × 1024): **no comprobado** en esta sesión por falta de tiempo; T-64 y T-74 (ya
  integradas) dicen arreglarlo. Pendiente de mirarlo a mano antes de la demo.
- Visto de paso, sin tocar: **P-05** sigue en la web publicada («The Sun is -2.52° above the horizon»).

## Encargo
1. **SOURCES.md:** añadidos PGDA 54 (fila de SLDEM2015), DOI enlazados de Barker 2016 y Mazarico 2011,
   PGDA 69 junto a Mazarico, la nota de la NASA del 28/10/2024 como fuente principal de las 9 regiones
   (nasanow.org queda como secundaria para centros y tamaños, que sí salieron de ahí) y «LROC image 1358 …
   SLIM landing site». NSSDC `lunar_sites.html` y LROC 1408 **no** se añaden: el catálogo usa la tabla NSSDCA
   de impactos y naves para los Apolo y para IM-2. QuickMap y la nota 22-089 siguen citadas.
2. **A3:** hecho (D-151, commit `ad700fb`). Cita de Firefly comprobada con WebFetch («just over 5 hours into
   the lunar night with the final data received around 6:15 pm CDT» = 23:15 UTC) y cifras del traspaso A3
   comprobadas (18:20 / 18:54 / 19:28 UTC; lisa 20:11). A3 sale `manual`; resumen del informe: 11 pass,
   2 manual, 0 fail, 8 skipped. Pruebas de `test_report.py` y e2e de Validation ajustadas.
3. **Textos:** README dice dónde está el mapa real y que `web/public/data/layers` y `cube` son datos de ejemplo
   de las pruebas; Limitations cuenta la diferencia de unos 40 min de A3; recuento de la validación
   actualizado; la cifra de 6,5 días queda como dato de 2022 («candidate regions then planned for
   Artemis III»). No se encontró «256 positions», ni «will land», ni texto de «medio Sol cuenta la mitad».
4. **Mapa:** no es un error. Playwright (Edge) sobre https://aeroinformagicos-llsn.pages.dev, pestaña Map:
   `config.json` → `heavy_base_url = https://aeroinformagicos-llsn-data.pages.dev`; `layers.json`,
   `mean186.bin.gz`, `grid.json`, hillshade y el cubo llegan de ese origen y el mapa real se ve (regiones,
   relieve). Los aeroespaciales abrieron el fichero de ejemplo del origen de la aplicación, que la app no usa.
   La vista previa local usa el mismo `web/public/config.json`; no se lanzó el servidor local por tiempo.
   Ficheros de ejemplo no borrados.
5. **Página del proyecto:** `docs/handoff/PAGINA-PROYECTO.md`. Tres URL responden 403 a peticiones
   automáticas (Firefly ×2, ScienceBase); la de Firefly del final de misión se leyó bien con WebFetch.
   **Comprobar antes de pegar:** la fecha del 27/02/2026 y «Artemis IV (2028)» vienen del encargo, sin fuente
   abierta en esta sesión.

## Pendiente
- P-04 a mano en tableta; P-05 y el resto de P-xx.
- `make test-all` no se ha pasado en esta sesión (cambian `story.spec.ts` y `validation.spec.ts`; necesita
  `make build` antes, ver nota de memoria).


---

# Segunda tanda (rama `i1-fix`, 15/11/2026, 11:46–12:40)

Rama `i1-fix` desde `rc-final`, un commit por arreglo, `make test` en verde antes de cada uno, integrada en
`rc-final` con `--no-ff` (sin conflictos con los cambios de UX de I2, D-170–D-173). Decisiones D-152 a D-160,
firmadas «Decidido por Claude Code por delegación de I1». Cada error se reprodujo antes con Playwright (Edge) sobre
la vista previa local y se volvió a capturar después.

| Punto | Estado | Commit · decisión | Notas |
| --- | --- | --- | --- |
| 1a Learn: la tarjeta tapa la vista (P-11) | **Arreglado** | `2fd3c65` · D-153 | La hoja central y el panel derecho terminan encima de la tarjeta (`--story-h`) y se desplazan dentro; comprobado a 1440 × 900, 1280 × 720 y 390 × 844 (en el móvil la tarjeta tapaba además `Next`) |
| 1b Map: Opacity no se llena al 100 % | **Arreglado** | `a3010c9` · D-152 | Deslizador propio 0–100, relleno = valor |
| 1c Map: Opacity cambia de fila | **Arreglado** | `a3010c9` · D-152 | Fila propia bajo los botones de capa, porcentaje de ancho fijo y cifras tabulares |
| 1d 3D: Sol cuadrado; rótulo cortado | **Arreglado** | `baa8e08` · D-154 | Causa: al arrastrar rápido baja la calidad a «bajo» (sin halo) y el brillo no se desvanecía en el borde del cuadro de 1,6 radios. No conseguí encuadrar el Sol en una captura con `?q=bajo`: causa y arreglo salen del código. Los nombres largos de los marcadores parten línea |
| 1e Setup: «Today» del calendario nativo | **Arreglado** | `5ff8882` · D-155 | `Apply` junto al campo y Enter; se ve la fecha aplicada o «Not applied yet…» |
| P-04 tableta 768 × 1024 | **Arreglado** (Compare) / ya estaba (cabecera, Explore) | `6c0400c` · D-160 | La hoja central ocupa todo el ancho. Queda: en modo hoja, la fila de cifras de abajo parte sus rótulos y «1.1 h» roza el borde derecho |
| P-05 «-2.52° above the horizon» | **Arreglado** | `38ecac5` · D-156 | Redacción de D-119 j |
| P-09 Timeline | **Arreglado** | `e43ad88` · D-157 | Signo menos visible (margen 44 → 62 px) y marco del gráfico en todo el eje |
| P-14 `Frame: MOON_ME` | **Arreglado** | `916143d` · D-158 | |
| P-15 nombres del par | **Arreglado** | `b6a1ba3` · D-159 | «Malapert Massif · site A/B», «Malapert A/B»; ids, defaults y golden sin tocar |
| P-06 / P-07 solapes de la 3D | **Pendiente** | — | Reproducido a 1280 × 720: el panel de controles 3D, abierto de entrada, pisa el final del resumen. Plegarlo bajo 1400 px rompería las e2e de 3D (usan 1280 × 720 por defecto) y no daba tiempo a ajustarlas |
| P-12 móvil | **Parcial** | `2fd3c65` | Learn en el móvil arreglado; el resto de P-12 sin revisar |
| P-08, P-10, P-13, P-20 | **Pendiente** | — | Sin tiempo |
| e2e de la tanda anterior | **Arreglado** | `0989a93` | `story.spec.ts` (expresión del paso 3) y `validation.spec.ts` (el informe de ejemplo `e2e/fixtures` aún tenía A3 retirado) fallaban; ahora pasan |

Pruebas: `make test` en verde antes de cada commit; e2e de lo tocado (story, validation, shell, eclipse, section,
timeline, map) en verde; tras integrar (`c7d1b6d`), `make check` en verde y `make test-all`: pytest 625 + 2 xfail,
vitest 440, e2e 138 de 139. La que faltaba era `e2e/v2/extras.spec.ts:59`, que esperaba el valor antiguo `1` del
deslizador de opacidad (ahora 0–100, D-152); corregida y repetida sola: 10/10 en verde. Ninguna prueba 3D intermitente
falló en esta vuelta.

## Para hacer público el repositorio (comprobado, sin commits)
- Claves en toda la historia (`git log --all -p` con el grep de MAÑANA §3): solo dos coincidencias falsas, la propia
  orden en `MAÑANA.md` y `${{ secrets.CLOUDFLARE_API_TOKEN }}` del flujo de CI (referencia, no valor). Ningún fichero
  `.env`, `.pem`, `.key`, `wrangler.toml` ni `.npmrc` en la historia.
- Correos de autor y committer: tres personales (uma.es, dos gmail) en 310 commits, más las direcciones `noreply` de
  GitHub. Sigue pendiente lo de D-141: cada persona dice si le parece bien.
- README (con «Use of AI» y «License»), SOURCES, AI_USAGE y LICENSE (MIT) presentes y al día.

LISTO PARA LA VISTA PREVIA
