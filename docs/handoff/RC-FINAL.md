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

LISTO PARA LA VISTA PREVIA FINAL
