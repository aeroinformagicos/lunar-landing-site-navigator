<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# A3 retirado · Traspaso

Rama `t-22-a3-retirada`, salida de `t-22-a3-investigacion` (PR #36, **aún sin integrar**) con `main`
fusionado. Decisión **D-95, pendiente de la firma de A1: no se integra sin ella.**

## Qué se hizo
- **A3 retirado** de la validación, por mal planteado y no por el resultado (motivo y cifras en D-95 y en
  `docs/handoff/A3-investigacion.md`).
  - Se borra `pipeline/tests/test_a3_blueghost_sunset.py`.
  - En `validation_report.json`, A3 sigue en «Show all checks» como `skipped`, con el motivo, las
    cifras y el número de la decisión. Un `A3.json` antiguo en `out/test_results/` se ignora.
  - **El modelo no cambia**, ni ninguna prueba de validación o tolerancia. `tests/golden/` no se toca:
    las filas A3 de `events_published.csv` y `A3_min` de `tolerances.json` se quedan sin uso.
- **Contrato 1.1.0** (autorizado por el equipo en lugar de I3):
  - el titular `A3` se sustituye por `A1`, posiciones del Sol y la Tierra frente a JPL Horizons;
  - orden de las tarjetas: `A1`, `B3`, `A7B7`;
  - cambian el esquema, `contract_check`, el informe de ejemplo (`make_examples.py`, regenerado con
    `--out`; la copia de `web/public/data` no se toca), `report`, la página (`report.ts`) y la
    especificación (`09` §7 y la línea de versión).
- **Tarjeta A1:** cuatro filas, el Sol y la Tierra (acimut y elevación) en Blue Ghost 1 el 2025-03-14 a
  las 06:00 UTC (un instante de A1, en pleno eclipse), nuestro valor frente a Horizons. En la nota, el
  número de valores y la diferencia máxima.
- **A7B7 sin resultados:** nota `Computed tonight: …`, y `Pending` en color neutro (`--c-text-muted`)
  en lugar del amarillo de «margen bajo».
- **Limitación** `limits.rise_set` en la ayuda de las tres cifras, bajo la línea de Horizons de la página
  de validación y en el README (sección «Validation and limitations»). El README dice además que el
  relieve fuera del polo queda sin contrastar con un hecho observado.
- **Especificación:** `01` F9, `02` §6, `09` §7, `10` §6.7, `11` §1, §3, §4, §7 y §8, `90` (E-14, el riesgo
  de A3 y P-04).

## Pruebas
- `test_report.py`: tarjeta A1 (filas y nota), A3 retirado aunque haya un `A3.json` con `fail`, A7B7 con
  `Computed tonight` y `small_deg`.
- `report.test.ts`: orden A1, B3, A7B7 y nota de A7B7 en el ejemplo.
- Playwright: `validation.spec.ts` (tres tarjetas, A3 en la tabla con su motivo, limitación) y
  `timeline.spec.ts` (limitación en la ayuda), sobre el informe servido.
- **Tres pruebas cambian solo el literal de la versión del contrato** (`1.0.0` → `1.1.0`):
  `test_smoke.py`, `test_site_mask.py` (manifiesto de `publish`) y `test_cube_engine.py` (`cube.json`).
  Comprueban la versión misma; ningún criterio cambia. La reanudación del cubo y de los sitios solo
  compara la versión mayor: la corrida de la noche no se ve afectada.

## Cifras
Informe regenerado: 21 casos, 4 `pass` (A1, A2, A8, B3), 0 `fail`, 17 `skipped` (A3 entre ellos);
Horizons: 256 valores, diferencia máxima 2,5·10⁻⁵°. Tarjetas: A1 `Match`, B3 `Match`, A7B7 `Pending`.

## Qué queda / para quién
- **A1:** firmar D-95 (o rechazarla) en `docs/decisions.md`: cambiar «PENDIENTE DE FIRMA DE A1» por la
  firma con fecha y hora. Hasta entonces, no integrar.
- **I3:** integrar antes la PR #36 (esta rama sale de ella); revisar el contrato 1.1.0.
- **A2:** si se quiere, marcar en `tests/golden/events_published.csv` que las filas A3 ya no se usan
  (cambio de `tests/golden/`, que necesita la aprobación de A1).
- **A3 (persona):** revisar el texto `limits.rise_set` y el README.
