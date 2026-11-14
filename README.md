<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Lunar Landing Site Navigator

A static web app that shows, for any lunar site and date, the Sun and the Earth above the **real**
lunar horizon: how long sunlight and the direct link with Earth last, and what changes when the site
or the date changes. Built by team **Aeroinformágicos** for the NASA Space Apps Challenge 2026
("Lunar Landing Site Navigator" challenge).

All heavy computation runs offline in Python (SPICE ephemerides and LOLA / SLDEM2015 terrain); the
web app only reads static files, so there is no server to go down.

**Live app:** <https://aeroinformagicos-llsn.pages.dev> · heavy map data are served from
<https://aeroinformagicos-llsn-data.pages.dev> (CORS open, read-only static files).

## How a site and date are judged

A scenario is a site, a landing time and a mission length (14 days by default). The traffic light
checks three requirements, all **editable in the Replan tab**:

- the Sun's centre is above the real horizon at landing;
- the Earth's centre is above the real horizon at landing (direct line of sight for radio);
- **no night lasts more than 24 h** during the mission (editable from 0 to 400 h).

The 24 h limit is a team default chosen to make differences between nearby sites visible, not a
rule of any mission. For reference, NASA chose the Artemis III candidate regions for access to
continuous sunlight over a 6.5-day period (NASA, 19 August 2022), a figure later refined to about
5.75–6.25 days depending on the mission epoch (NASA Technical Reports Server, 20250011660). Set the
limit that matches your own mission.

## Quick start

Requirements: Git, Python 3.12, Node.js 24 and, optionally, GNU Make (without it, use
`npm run <task>` from the repository root).

```bash
make setup     # creates .venv, installs pipeline/requirements.txt, runs npm ci in web/
make test      # fast tests (< 60 s): pytest + vitest + contract schemas
make dev       # local web app
make build     # production build in web/dist/
```

Input data (SPICE kernels and digital elevation models, several GB) are **not** in the repository.
Set `LLSN_DATA_DIR` to the folder that holds `kernels/`, `raw/lola/`, `raw/sldem2015/` and
`raw/nasa_illum/` (defaults to `./data`).

## Reproduce everything from scratch

All commands run from the repository root (`make <task>` or `npm run <task>`) with `LLSN_DATA_DIR`
set. Times were measured on the team's laptop (Windows 11, RTX 4060 Laptop GPU, PyTorch 2.15 with
CUDA) on 14 November 2026; "not timed" means nobody measured that step yet. On Linux, read
`.venv/bin/python` for `.venv/Scripts/python`.

| Step | Command | What it produces | Measured time |
| --- | --- | --- | --- |
| 1. Input data (22.8 GB) | download by hand, see below | `kernels/`, `raw/lola/`, `raw/sldem2015/`, `raw/nasa_illum/` | depends on the network |
| 2. Environment | `make setup` (and `make setup-gpu` for CUDA) | `.venv`, `web/node_modules` | not timed |
| 3. Reference values | `make golden` | JPL Horizons tables in `tests/golden/` (already committed) | 27 s |
| 4. Ephemeris table | `make ephem` | `web/public/data/ephemeris.bin` + meta | 13 s |
| 5. Site masks | `make sites` | horizon masks, profiles, `sites.json` in `web/public/data/` | 0.8–3.3 s per terrain mask, ~1 min for the 20 masks once the SLDEM2015 crops exist |
| 6. Horizon cube, level 1 | `make cube LEVELS=1` | 113 of the 1,974 chunks in `$LLSN_DATA_DIR/out/heavy/cube/` | 2 min 39 s |
| 7. Cube levels 2–4 + map layers | `make night` (= `make cube LEVELS=2,3,4`, then `make layers`) | the other 1,861 chunks; Sun / Earth layers, `map/grid.json`, hillshade, regions | cube 43 min 58 s; layers 9.2 min |
| 8. Compact masks | `make compact` | `compact/regions.bin.gz`, `compact/overview.bin.gz` | not timed (seconds per chunk; under 5 min expected) |
| 9. NASA map comparison (B7) | `.venv/Scripts/python -m pipeline.cli compare-nasa` | `test_results/B7.json` and two figures | not timed |
| 10. Demo pair | `.venv/Scripts/python -m pipeline.cli pick-demo` | `out/demo_candidates.json` | 412 s |
| 11. Slow validation tests | `make test-all` | `out/test_results/*.json` (A6, A7, B4, B6 and the rest) | Python part 3 min 12 s |
| 12. Validation report | `make report` | `web/public/data/validation_report.json` | seconds |
| 13. Publish heavy data | `make deploy-heavy` | Cloudflare Pages project `aeroinformagicos-llsn-data` (339 MB, 2,045 files) and `heavy_base_url` in `web/public/config.json` | not timed |
| 14. Publish the app | `make deploy` (CI does it on every merge to `main`) | Cloudflare Pages project `aeroinformagicos-llsn` | not timed |

Every long step can be resumed: running the same command again skips what is already done.
`ops/cloud/README.md` explains how to split the cube with a cloud machine. Check any data folder
against the data contract with `.venv/Scripts/python -m pipeline.cli check-contract <dir>`.

**Input data.** Download each file with `curl -L -C - -o <folder>/<file> <url>` (repeat the command
to resume a cut download); each `.IMG` has a `.LBL` label at the same URL with that extension.

| Folder | Base URL | Files |
| --- | --- | --- |
| `kernels/` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` | `lsk/naif0012.tls`, `spk/planets/de440.bsp`, `pck/moon_pa_de440_200625.bpc`, `fk/satellites/moon_de440_250416.tf` |
| `raw/lola/` | `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/` | `LDEM_80S_40M`, `LDEM_75S_120M`, `LDEM_60S_120M` (`.IMG` + `.LBL`) |
| `raw/sldem2015/` | `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/` | the `SLDEM2015_512_*_FLOAT` tiles listed in `docs/spec/03_datos_y_fuentes.md` §10.1 (1.4 GB each; only needed for sites away from the pole) |
| `raw/nasa_illum/` | `https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/` | `AVGVISIB_85S_060M_201608`, `AVGVISIB_85S_060M_201608_EARTH`, `AVGVISIB_75S_120M_201608`, `AVGVISIB_75S_120M_201608_EARTH`, `LPSR_85S_060M_201608` |

The exact byte size of every file is in `docs/spec/03_datos_y_fuentes.md` §10.1; a file with fewer
bytes is incomplete.

## Repository layout

| Path | Content |
| --- | --- |
| `pipeline/` | Python offline pipeline: ephemerides, terrain, horizon masks, reference visibility |
| `web/` | React + TypeScript static app (`src/core` is the pure computation core) |
| `contract/` | Data contract between pipeline and web: version, JSON schemas, examples |
| `ops/` | Task runner, data download, deployment |
| `tests/golden/` | Reference values from independent sources (JPL Horizons, published events) |
| `docs/` | Team documentation (in Spanish): specification, tasks, decisions |

## Validation and limitations

The validation page of the app (`#/validation`) is generated from the automated test report. It opens
with three checks against independent sources: Sun and Earth positions against JPL Horizons, the
total solar eclipse seen by Blue Ghost Mission 1 on 14 March 2025 against Firefly Aerospace's
published times, and our south pole maps against NASA's illumination and Earth visibility maps.

- **Rise and set times:** rise and set times are only as accurate as the terrain map. Where the
  horizon is set by low relief close to the site, a few metres of error in the map shift them by
  tens of minutes at mid-latitudes and by hours near the poles, where the Sun skims the horizon.
- **Terrain away from the poles is not checked against an observed event.** We tried to compare the
  sunset at the Blue Ghost Mission 1 site with Firefly's mission report, but Firefly published no
  sunset time, only when the last data arrived, and the result there depends on relief smaller than
  the 59 m terrain map can resolve. That check was retired. Near the south pole, our maps are
  compared with NASA's (computed overnight; the result appears on the validation page).

## Data sources

See [SOURCES.md](SOURCES.md).

## Use of AI

This project was built with the help of generative AI, as allowed by the Space Apps 2026 rules:

- **Tool:** Claude Code (Anthropic) wrote most of the source code, tests and configuration from a
  written specification prepared by the team (`docs/spec/`).
- **Human review:** every change goes through a pull request reviewed and merged by a team member;
  scientific results are checked against independent references (JPL Horizons, published landing
  events, NASA illumination maps) by the team's validation lead, never against our own code.
- **Disclosure in the code:** every source file starts with the line
  `AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos`, and commits carry an
  `AI-assisted: Claude Code` trailer.
- **Log:** [AI_USAGE.md](AI_USAGE.md) records, task by task, what the AI generated and what a person
  reviewed.
- No AI-generated images use NASA logos or branding.

## License

Code: [MIT](LICENSE). Derived data are published with the citation of their sources (SOURCES.md).
