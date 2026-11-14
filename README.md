<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Lunar Landing Site Navigator

A static web app that shows, for any lunar site and date, the Sun and the Earth above the **real**
lunar horizon: how long sunlight and the direct link with Earth last, and what changes when the site
or the date changes. Built by team **Aeroinformágicos** for the NASA Space Apps Challenge 2026
("Lunar Landing Site Navigator" challenge).

All heavy computation runs offline in Python (SPICE ephemerides and LOLA / SLDEM2015 terrain); the
web app only reads static files, so there is no server to go down.

> Status: project skeleton (task T-01). Features arrive task by task.

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
