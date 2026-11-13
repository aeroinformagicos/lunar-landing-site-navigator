# 02 · Arquitectura

Todo lo pesado se calcula fuera de línea en Python y la web solo lee ficheros estáticos: no hay servidor que pueda caerse en la demo.

## 1. Vista general

```
 ENTRADAS                    PIPELINE FUERA DE LÍNEA (Python, I1)                CONTRATO (I3)                WEB ESTÁTICA (TypeScript, I2)
 Núcleos SPICE (DE440) ───▶  ephem: tabla horaria + referencia spkcpo  ───▶  ephemeris.bin + meta       ───▶  core: interpolación, acimut y elevación
 DEM LOLA y SLDEM2015  ───▶  horizon: máscara y perfil por sitio       ───▶  horizon/*.json, profile/*  ───▶  core: visibilidad, ventanas, sucesos,
 Catálogo de sitios (A2) ─▶  cli sites                                 ───▶  sites.json                         requisitos, ranking, eclipses
                             horizon/cube: cubo por trozos (GPU o CPU) ───▶  cube/*, compact/*          ───▶  ui: panorama, línea temporal, corte,
                             layers: capas, sombreado, comparación     ───▶  layers/*, map/*                    mapa, comparación, replanificación
 Horizons, AVGVISIB,   ───▶  pruebas (pytest) ─▶ cli report            ───▶  validation_report.json     ───▶  ui: página de validación
 Firefly (solo pruebas)
```

Reglas: el pipeline nunca importa nada de `web/` ni al revés; lo único que comparten es `contract/` y `tests/golden/`. La referencia de visibilidad en Python (`pipeline/vis`) y el núcleo de la web (`web/src/core`) implementan el mismo algoritmo (`07_visibilidad.md` §12).

## 2. Árbol de directorios y dueños

```
/                                   I3   raíz del repositorio
├── CLAUDE.md                       I3   reglas para Claude Code (13_claude_md.md)
├── README.md  LICENSE  SOURCES.md  AI_USAGE.md        I3 (contenido de SOURCES: A2; de AI_USAGE: A2)
├── Makefile  package.json          I3   órdenes (§4); package.json raíz con los mismos scripts
├── .github/workflows/ci.yml        I3   integración continua (§6)
├── contract/                       I3   VERSION, schemas/*.schema.json, examples/data/…, sites.catalog.json (contenido: A2)
├── pipeline/                       I1
│   ├── requirements.txt  requirements-gpu.txt  pyproject.toml
│   ├── common/      constants.py  timeutil.py  geo.py  gzio.py
│   ├── ephem/       kernels.py  spice_ref.py  table.py  interp.py
│   ├── dem/         pds_label.py  grids.py  stack.py  crop.py
│   ├── horizon/     law.py  engine_ref.py  engine_torch.py  site_mask.py  profile.py  cube.py  compact.py
│   ├── vis/         sky.py  discs.py  events.py  metrics.py  eclipse.py  requirements.py  ranking.py
│   ├── layers/      layers.py  hillshade.py  compare_nasa.py
│   ├── cli/         __main__.py   (una suborden por tarea: §4.2)
│   └── tests/       test_*.py  conftest.py
├── web/                            I2
│   ├── package.json  vite.config.ts  tsconfig.json  index.html  playwright.config.ts
│   ├── public/      config.json  data/…   (origen ligero; lo escribe el pipeline, se versiona)
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── core/    constants.ts time.ts ephemeris.ts frames.ts law.ts horizon.ts visibility.ts events.ts
│   │   │            metrics.ts eclipse.ts requirements.ts ranking.ts grid.ts cube.ts gz.ts loaders.ts types.ts
│   │   │            __tests__/*.test.ts
│   │   ├── state/   store.ts  url.ts  selectors.ts
│   │   ├── ui/      layout/ scenario/ controls/ panorama/ timeline/ section/ map/ compare/ metrics/
│   │   │            summary/ replan/ optimal/ validation/ story/ common/
│   │   ├── workers/ optimal.worker.ts
│   │   ├── i18n/    en.json  t.ts
│   │   └── styles/  tokens.css  app.css
│   └── e2e/         *.spec.ts
├── ops/                            I3   fetch_data.py  data_manifest.json  fetch_golden.py  deploy.sh  deploy_heavy.sh  cloud/README.md
├── tests/golden/                   A1   *.csv  core_vectors.json  tolerances.json   (protegido: §6.3)
├── docs/                           A2, A3, I3
│   ├── spec/        esta especificación
│   ├── tasks/       T-xx.md (una tarjeta por fichero)
│   ├── decisions.md  constants.md  handoff/
└── data/                           (no se versiona)  kernels/  raw/  crops/  out/
```

Correspondencia con el plan: `web/core` y `web/ui` del plan son `web/src/core` y `web/src/ui`. Una sesión de Claude Code no edita directorios de otro carril.

`web/src/core` no importa React ni toca el DOM: es TypeScript puro y se prueba con Vitest sin navegador.

## 3. Dependencias con versión fijada

Las versiones son las publicadas en los registros (`referencias/versiones/`). La compatibilidad entre ellas se comprueba al ejecutar T-01 (instalación limpia + `make test`); si alguna combinación falla, se aplica la alternativa de la última columna y se anota en `docs/decisions.md`. Estado: PENDIENTE DE VERIFICAR (I3).

### 3.1 Pipeline (Python)

| Paquete | Versión | Para qué | Por qué este | Alternativa si falla |
| --- | --- | --- | --- | --- |
| Python | 3.12.x | Intérprete | NumPy 2.5 exige ≥ 3.12; SpiceyPy 8.3.0 publica ruedas hasta 3.13; PyTorch 2.15 desde 3.11 | 3.13 |
| `numpy` | 2.5.4 | Matrices, `memmap`, motor de referencia | Estándar; lee los `.IMG` directamente | Última 2.x que acepte SpiceyPy |
| `spiceypy` | 8.3.0 | SPICE (`furnsh`, `str2et`, `spkpos`, `spkcpo`, `pxform`) | Envoltorio de CSPICE con ruedas para Windows; es la biblioteca de las cifras de comprobación del plan | — |
| `torch` | 2.15.0 | Motor del cubo y capas (GPU RTX 4060 o CPU) | Se instala con `pip` con CUDA incluido en Windows; el mismo código corre en CPU | Motor de referencia NumPy con `multiprocessing` (más lento) |
| `pillow` | 13.0.0 | Escribir `hillshade_250m.png` y las figuras de validación | Ligero, sin dependencias nativas extra | — |
| `pytest` | 9.2.0 | Pruebas | Estándar | — |
| `jsonschema` | 4.26.0 | Validar los JSON contra `contract/schemas` | Implementa el borrador 2020-12 | — |
| `ruff` | 0.17.4 | Formato y análisis estático | Rápido, una sola herramienta | Prescindible |

- Lectura de PDS IMG: **sin biblioteca** (D-06). Lector propio en `pipeline/dem/pds_label.py` + `numpy.memmap`.
- `requirements.txt` fija todo con `==` menos `torch`. `requirements-gpu.txt` instala `torch==2.15.0` desde el índice de ruedas con CUDA de PyTorch (`--index-url https://download.pytorch.org/whl/cu132`). Comprobado en ese índice: existe `torch-2.15.0+cu132-cp312-cp312-win_amd64.whl` (y también la variante `cu134`, que sirve de alternativa cambiando la etiqueta de la URL). Si el controlador de la RTX 4060 no acepta esa versión de CUDA, se actualiza el controlador o se usa PyTorch en CPU. En máquinas sin GPU, `pip install torch==2.15.0` (CPU).
- Las pruebas rápidas no necesitan `torch`: los módulos del cubo lo importan dentro de las funciones y sus pruebas se saltan si no está.

### 3.2 Web (TypeScript)

| Paquete | Versión | Para qué | Por qué este | Alternativa si falla |
| --- | --- | --- | --- | --- |
| Node.js | 24.x | Herramientas | Vitest 5.1 exige `^22.12 \|\| ^24 \|\| >=26`; Vite 8 exige `^20.19 \|\| >=22.12` | 22.12 o posterior |
| `typescript` | 7.0.2 | Comprobación de tipos (`strict`) | Última publicada | Última 5.x |
| `vite` | 8.3.7 | Servidor de desarrollo y empaquetado | Arranque inmediato, salida estática | — |
| `@vitejs/plugin-react` | 6.3.0 | React en Vite | Oficial | — |
| `react`, `react-dom` | 19.3.1 | Marco de interfaz | El que Claude Code maneja con menos errores; componentes pequeños y probables | — |
| `zustand` | 5.1.0 | Estado global (escenarios, cursor, modo) | Mínimo, sin plantillas; fácil de serializar a la URL | `useReducer` + contexto |
| `d3-scale` 4.0.3, `d3-shape` 3.2.1, `d3-array` 3.2.5 | — | Escalas, curvas y utilidades de los gráficos (SVG y Canvas dibujados por React) | Gráficos a medida (panorama, corte) que ninguna biblioteca de gráficos trae hechos | — |
| `d3-zoom` 3.0.1, `d3-selection` 3.0.1 | — | Zoom y arrastre del mapa (ratón, táctil, teclado) | El mapa es una imagen en estereográfica polar: no hacen falta teselas ni biblioteca de mapas | — |
| `vitest` | 5.1.0 | Pruebas unitarias y de rendimiento del núcleo | Misma configuración que Vite | — |
| `@playwright/test` | 1.65.0 | Pruebas de extremo a extremo (B1, B2, B9) | Navegador real, también móvil emulado | — |
| `wrangler` | 4.160.0 | Subida directa a Cloudflare Pages | §6.2 | GitHub Pages |

Sin biblioteca de componentes, de traducción, de fechas ni de mapas. CSS propio con variables (`styles/tokens.css`). `package.json` fija versiones exactas (sin `^`) y se versiona `package-lock.json`.

## 4. Órdenes

### 4.1 `make` (y sus equivalentes `npm run <nombre>` en el `package.json` raíz, para portátiles sin `make`)

| Orden | Qué hace | Duración esperada |
| --- | --- | --- |
| `make setup` | Crea `.venv`, instala `pipeline/requirements.txt`, ejecuta `npm ci` en `web/` | 2–5 min |
| `make setup-gpu` | Añade `requirements-gpu.txt` | 5 min |
| `make data-fetch` | `ops/fetch_data.py` grupos G0–G3 (`03_datos_y_fuentes.md` §10 y §11) | Según la red |
| `make data-fetch-all` | Grupos G4–G6 | Largo, desatendido |
| `make golden` | `ops/fetch_golden.py`: descarga de Horizons los valores de referencia a `tests/golden/` | 2–4 min |
| `make test` | Pruebas rápidas: `pytest -m "not data and not slow"` + `vitest run` + validación de esquemas | **< 60 s** |
| `make test-all` | Todo: además las marcadas `data` y `slow` y las de Playwright | 10–30 min |
| `make ephem` | Genera `ephemeris.bin` y su meta en `web/public/data/` | < 1 min |
| `make sites` | Máscaras, perfiles y `sites.json` de todos los sitios con datos disponibles | < 10 min |
| `make vectors` | Regenera `tests/golden/core_vectors.json` (solo con aprobación de A1) | < 1 min |
| `make cube-bench` | Medida de coste con 1.024 puntos | 1–10 min |
| `make cube` | Calcula el cubo por trozos según `plan.json` (reanudable; `SHARD=k/n`, `LAW=full\|fast`, `LEVELS=1,2,3,4`) | `08_mapa_polar.md` §4 |
| `make layers` | Capas, sombreado, DEM de 500 m, `grid.json`, `regions.json` | 10 min – 4 h |
| `make night` | En cadena y desatendido: `make cube LEVELS=2,3,4` y después `make layers`; se detiene en el primer fallo (T-25) | Horas (de noche) |
| `make compact` | Máscaras compactas | < 5 min |
| `make report` | `validation_report.json` a partir de los resultados de las pruebas | < 10 s |
| `make dev` | `vite` en `web/` con los datos de `web/public/data/` | — |
| `make build` | `tsc --noEmit` + `vite build` → `web/dist/` | < 1 min |
| `make deploy` | Publica `web/dist/` (aplicación + origen ligero) | < 2 min |
| `make deploy-heavy` | Publica `data/out/heavy/` (origen pesado) | 5–30 min |
| `make offline` | Copia `web/dist/` + datos pesados a `dist-offline/` con `config.json` local | < 2 min |
| `make check` | `ruff`, `tsc --noEmit` y `check-contract` | < 30 s |

### 4.2 Subórdenes del pipeline (`python -m pipeline.cli <suborden>`)

`ephem`, `sites`, `site-mask`, `profile-csv`, `core-vectors`, `cube-plan`, `cube`, `layers`, `hillshade`, `regions`, `compact`, `compare-nasa`, `pick-demo`, `report`, `publish`, `check-contract`, `bench-sampler`. Todas aceptan `--data-dir` (por defecto `data/`) y `--out-dir`, imprimen un resumen corto (nunca vuelcan matrices) y devuelven código distinto de 0 si fallan.

## 5. Entorno de desarrollo

- Portátiles con Windows 11 (también vale Linux o macOS). Terminal: Git Bash. Hace falta `git`, Python 3.12, Node 24 y, si se quiere `make`, instalarlo aparte; si no, `npm run <orden>` desde la raíz. Qué portátiles tienen `make`: PENDIENTE DE VERIFICAR (I3).
- Variables de entorno: `LLSN_DATA_DIR` (por defecto `./data`), `LLSN_DEVICE` (`auto`, `cuda`, `cpu`), `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` (solo para desplegar; nunca en el repositorio).
- `data/` está en `.gitignore`. Se versiona el origen ligero (`web/public/data/`: efemérides de 5,26 MB, sitios, máscaras, perfiles e informe). Límite por fichero versionado: 10 MB.
- Sesiones de Claude Code: una por carril, en su directorio; no abren ficheros de `data/` (usan las subórdenes, que imprimen resúmenes).
- GPU: `LLSN_DEVICE=auto` usa `cuda` si existe. La prueba `python -c "import torch; print(torch.cuda.is_available())"` forma parte de T-24.

## 6. Integración continua y despliegue

### 6.1 Integración continua (`.github/workflows/ci.yml`)

En cada petición de integración y en cada integración en `main`:

1. Python 3.12: `pip install -r pipeline/requirements.txt`; `pytest -m "not data and not slow"`.
2. Los núcleos SPICE (133 MB) no están en el repositorio: el flujo los descarga con cuatro órdenes `curl -L --fail -o data/kernels/<fichero> <URL>` (URLs y tamaños de `03_datos_y_fuentes.md` §10.1, filas 1–4), comprueba el tamaño exacto de cada uno y los guarda en la caché de la acción. No usa `ops/fetch_data.py`, que llega con T-03 y no está en la ruta crítica. Las pruebas que los necesitan llevan la marca `kernels`: en local se saltan si faltan; el flujo define `LLSN_REQUIRE_KERNELS=1` y, con esa variable, `conftest.py` las hace fallar en vez de saltarlas (`11_validacion.md` §7).
3. Node 24: `npm ci`; `tsc --noEmit`; `vitest run`; `vite build`.
4. Validación de esquemas de `contract/examples/data/` y `web/public/data/`.
5. En `main`: despliegue de previsualización (§6.2) y `make report`.

Las pruebas `data` y `slow` (A3, A6, A7, B6, B7) corren en el portátil de I1 o en la nube, de noche, y sus resultados (`data/out/test_results/*.json`) se incorporan al informe con `make report`.

### 6.2 Alojamiento (D-19)

| Qué | Dónde | Cómo |
| --- | --- | --- |
| Aplicación + origen ligero | Proyecto de Cloudflare Pages «app» | `wrangler pages deploy web/dist` desde la integración continua en cada integración en `main` |
| Origen pesado (cubo, capas, mapa, compactas) | Proyecto de Cloudflare Pages «data» | `wrangler pages deploy data/out/heavy` desde la máquina de I3; fichero `_headers` con `Access-Control-Allow-Origin: *` |

Límites de Cloudflare Pages (documentación oficial): 20.000 ficheros por sitio y 25 MiB por fichero en el plan gratuito; admite repositorios privados. El cubo son 1.974 ficheros de ~0,2–0,3 MB. Que una subida directa de varios cientos de MB funcione sin problemas: PENDIENTE DE VERIFICAR (I3) con ficheros de relleno durante M0.

Alternativas, por orden: (1) GitHub Pages para la aplicación (sitio publicado ≤ 1 GB, 100 GB al mes; según la tabla de planes de GitHub, con el plan gratuito solo se publica desde repositorios públicos, y desde uno privado hace falta GitHub Pro o Team) y almacenamiento de objetos público (Oracle Cloud o Azure, con CORS abierto) para el origen pesado; (2) todo servido desde una máquina de Oracle Cloud. Como `heavy_base_url` está en `config.json`, cambiar de origen no exige recompilar.

Etiquetas de versión: `v0.1-base`, `v0.2`, `v1.0` (plan). Cada etiqueta guarda la URL de su despliegue en `docs/decisions.md`.

### 6.3 Ficheros protegidos

`tests/golden/**` y `tests/golden/tolerances.json` tienen a A1 como revisor obligatorio (`CODEOWNERS`); `contract/**`, a I3. Claude Code no los modifica salvo en una tarjeta que lo diga expresamente.

### 6.4 Copia local sin conexión

`make offline` deja en `dist-offline/` la web y todos los datos con `config.json` = `{"data_base_url": "data", "heavy_base_url": "data"}`. Se sirve con `python -m http.server 8080 --directory dist-offline` (hace falta servidor HTTP: los trabajadores web no funcionan abriendo el fichero directamente). Se copia a dos portátiles (hito 4).

## 7. Presupuesto de tamaño de lo que se sirve

| Elemento | Presupuesto | Notas |
| --- | --- | --- |
| JavaScript de la aplicación (comprimido) | ≤ 350 kB | React + D3 parcial + código propio; el modo Aprender, el mapa y la validación se cargan aparte (`import()` dinámico) |
| CSS | ≤ 30 kB | — |
| Tipografías | 0 | Tipografías del sistema |
| `manifest.json` + `sites.json` | ≤ 60 kB | — |
| `ephemeris.bin` | 5.260.176 B | Una vez; en caché del navegador |
| `horizon/<site>.json` | ≤ 80 kB cada uno | Solo los de los escenarios abiertos (2 al arrancar) |
| `profile/<site>.bin.gz` | ≤ 0,4 MB cada uno | Solo al abrir la pestaña Corte |
| `validation_report.json` | ≤ 200 kB | Solo al abrir la página de validación |
| **Total del origen ligero** | **< 25 MB** | 43 sitios |
| `map/` | ≤ 3 MB | Al abrir el mapa |
| `layers/<period>.bin.gz` | ≤ 0,8 MB cada uno; 62 ficheros | De uno en uno, al elegir el periodo |
| `cube/` | 1.974 ficheros; 0,3–0,6 GB en total | Un trozo (~0,25 MB) por clic |
| `compact/regions.bin.gz` | ≤ 3 MB | Al lanzar F32 |
| **Total del origen pesado** | **< 0,7 GB** | — |

Primera pantalla útil: aplicación + manifiesto + sitios + 2 máscaras ≈ 0,6 MB; las cifras aparecen cuando llega la tabla de efemérides (5,26 MB más). Objetivo de B9: interfaz visible en menos de 3 s en una conexión de 20 Mbit/s. Si la medida real no lo cumple, mejora prevista: pedir la tabla por rangos de bytes de un año (210 kB) con la cabecera `Range` (cambio interno de `loaders.ts`, sin tocar el contrato).

## 8. Arquitectura de la web

- **Estado (Zustand, `state/store.ts`)**: `mode`, `scenarios` (1–4), `activeScenarioId`, `cursorUnix`, `playing`, `playSpeed`, `tab`, `focusBody`, `showSmooth`, `requirements`, `mapLayer`, `mapPeriod`, `storyStep`. Todo lo demás (estado del cielo, métricas, sucesos) son **datos derivados**, calculados con selectores memorizados a partir del estado y de los datos cargados; no se guardan.
- **Datos cargados (`core/loaders.ts`)**: caché en memoria por URL; cada recurso tiene estado `idle | loading | ready | error` que las vistas reflejan (`10_interfaz.md` §9).
- **Flujo**: acción del usuario → cambio de estado → selectores recalculan con `core` (síncrono, < 20 ms) → React repinta. La reproducción usa `requestAnimationFrame` y avanza `cursorUnix`.
- **Trabajador**: solo F32 modo fecha (`workers/optimal.worker.ts`), creado con `new Worker(new URL(...), { type: 'module' })`.
- **URL (F16, `state/url.ts`)**: el estado serializable se escribe en el fragmento (`#s=…`) con `history.replaceState`; formato en `10_interfaz.md` §10.
- **Errores**: un límite de errores de React por vista; un fallo en una vista no tumba las demás. Los errores de datos se muestran en la tarjeta afectada con botón `Retry`.
- **Rendimiento**: los gráficos con más de 2.000 puntos se dibujan en Canvas; el resto en SVG. Nada de recalcular en cada fotograma lo que no depende del cursor.

## 9. Arquitectura del pipeline

- Cada subcomando es idempotente y reanudable: si la salida existe y es válida, se salta (`--force` para rehacer).
- Salidas del origen ligero directamente en `web/public/data/`; salidas pesadas en `data/out/heavy/` (misma estructura de rutas que el contrato).
- Semillas fijas en todo lo aleatorio (pruebas, puntos de A7).
- Registro: una línea por paso en la salida estándar y `data/out/logs/<suborden>.log`.
- Cómputo largo siempre fuera de la sesión de Claude Code: lo lanza una persona (I3) en una terminal aparte o en la nube; la sesión solo lee `bench.json` y los resúmenes.

## 10. Dónde corre cada cosa

| Cálculo | Máquina | Motivo |
| --- | --- | --- |
| Efemérides, máscaras de sitio, vectores, informe | Cualquier portátil (CPU) | Segundos o minutos |
| Nivel 1 del cubo y máscaras compactas | Portátil con RTX 4060 (o CPU) | Minutos; desbloquea F32 |
| Resto del cubo y capas | RTX 4060 de noche, o máquina de muchos núcleos en la nube (crédito de Oracle Cloud o Azure) | Horas; reanudable y repartible con `SHARD` |
| A7, B6, A6 | La misma máquina del cubo, de noche | Lentas |

Si Oracle no deja lanzar la máquina (riesgo del plan): RTX 4060 o Azure. Guía de arranque en `ops/cloud/README.md` (T-25): crear la máquina, clonar, `make setup`, copiar P1 y P2, `make cube SHARD=k/n`, sincronizar `data/out/heavy/cube/` de vuelta.
