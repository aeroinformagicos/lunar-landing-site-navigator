<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Lunar Sightline

**Will this landing site have power and a line to Earth?** A static web app that shows, for any lunar
site and date, the Sun and the Earth above the **real** lunar horizon: how long sunlight and the direct
radio link with Earth last, which ridge blocks them, and what changes when the site or the date changes.
Built by team **Aeroinformágicos** for the NASA Space Apps Challenge 2026 ("Lunar Landing Site
Navigator" challenge). In the app the interface is branded **Lunar Sightline**.

All heavy computation runs offline in Python (SPICE ephemerides and LOLA / SLDEM2015 terrain); the
web app only reads static files, so there is no server to go down.

- **Live app:** <https://lunarsightline.pages.dev> (the first address,
  <https://aeroinformagicos-llsn.pages.dev>, still serves the same app)
- **Heavy map data** (horizon cube, map layers, terrain for the 3D view):
  <https://aeroinformagicos-llsn-data.pages.dev> (read-only static files, CORS open). The app reads the
  real map from there (`heavy_base_url` in `web/public/config.json`); the small files in
  `web/public/data/layers` and `web/public/data/cube` are synthetic sample data for the automated tests.
- **Previous interface**, kept as a safety net: <https://lunarsightline.pages.dev/?ui=v1>
- **How we check the numbers:** <https://lunarsightline.pages.dev/#/validation>

## How to use it

The first visit opens on a welcome card with two south-pole sites, 710 m apart, already loaded:

- **Take the 60-second tour** (`Learn`): seven steps that show why one of the two sites works and the
  other does not, what happens when the launch slips 12 days, how the tool proposes another region,
  and how the numbers are checked.
- **Explore on my own** (`Explore`): pick a site (`Sites`: landed missions, NASA's 2024 candidate
  regions near the south pole, other points, or any latitude and longitude) and a landing date and
  mission length (`Setup`). The **3D / 2D** switch shows the terrain around the site with the Sun and
  Earth paths (3D) or the real horizon line with the Sun and Earth on it (2D). The panel on the right
  gives the Sun and Earth elevation now, the margin over the terrain and the next sunset or Earthset;
  the strip at the bottom gives hours of sunlight, hours of Earth contact, the longest night and a
  verdict (`Works`, `Tight`, `Doesn't work`) with its reason in plain words. `Play` and the slider move
  through the mission.
- **Views** in the bottom strip: `Horizon` (the default), `Map` (south pole maps of the share of time
  with Sun, Earth or both, from our own horizon cube, and `Find the best site`), `Timeline` (Sun and
  Earth elevation and every rise and set during the mission) and `Terrain profile` (the terrain cut
  toward the Sun or the Earth, with the blocking point and its distance).
- **Plan** adds `Replan`: a matrix of sites by landing delay, the next valid window and a ranking of
  candidate regions for the chosen date, with editable requirements. **Compare** puts the scenarios
  side by side with a verdict; **Share** copies a link that restores the same state.
- Every figure says which terrain it was computed with. Where there is no terrain data the app says
  so in red and uses a smooth Moon.

## How a site and date are judged

A scenario is a site, a landing time and a mission length (14 days by default). The traffic light
checks three requirements, all **editable in the Replan tab**:

- the Sun's centre is above the real horizon at landing;
- the Earth's centre is above the real horizon at landing (direct line of sight for radio);
- **no night lasts more than 24 h** during the mission (editable from 0 to 400 h).

The 24 h limit is a team default chosen to make differences between nearby sites visible, not a
rule of any mission. For reference, in 2022 NASA chose the candidate regions then planned for Artemis III for access to
continuous sunlight over a 6.5-day period (NASA, 19 August 2022), a figure later refined to about
5.75–6.25 days depending on the mission epoch (NASA Technical Reports Server, 20250011660). Set the
limit that matches your own mission.

## Quick start

Requirements: Git, Python 3.12, Node.js 24 and, optionally, GNU Make (without it, use
`npm run <task>` from the repository root).

```bash
make setup     # creates .venv, installs pipeline/requirements.txt, runs npm ci in web/
make test      # fast tests (about 3 min): pytest + vitest + contract schemas
make dev       # local web app
make build     # production build in web/dist/
make check     # static analysis, data contract and bundle size budgets
make test-all  # everything, including the slow and the browser tests
```

The browser tests need Playwright's Chromium once: `cd web && npx playwright install chromium`.

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
| 14. Publish the app | `make deploy` (CI does it on every merge to `main`) | Cloudflare Pages projects `lunarsightline` and `aeroinformagicos-llsn` | not timed |

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
bytes is incomplete. There is no download script (`ops/fetch_data.py` was planned in task T-03
and not written), so the files are fetched by hand as above. There is no offline copy command
(`make offline`) either: to run the app without a network, build it with `make build` and serve
`web/dist/` with any static server; the map layers and the 3D terrain still come from the heavy origin.

## Data

| Data | Used for |
| --- | --- |
| JPL DE440 planetary and lunar ephemerides, through the NAIF SPICE kernels `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` (frame `MOON_ME`) | Sun and Earth positions seen from the site, 1969–1972 and 2024–2044 |
| LOLA polar digital elevation models (40 m within 80° S, 120 m to 60° S) | Horizon masks near the south pole, the horizon cube and the map layers |
| SLDEM2015 (LOLA + SELENE Terrain Camera, 59 m at the equator) | Horizon masks between 60° S and 60° N |
| NASA LOLA illumination and Earth visibility maps (Mazarico et al. 2011, PGDA) | Independent check of our south pole maps (cases A7 and B7) |
| NSSDCA landing table, IAU/USGS gazetteer, NASA's 2024 candidate regions | Site catalogue |

The full list, with URLs, licences and the software libraries, is in [SOURCES.md](SOURCES.md).

Conventions used everywhere: lunar radius 1737.4 km; planetocentric latitude, east longitude; azimuth
from north through east; light-time and stellar aberration correction (`LT+S`); observer 2 m above the
ground; "Sun" and "Earth contact" mean the **centre** of the disc above the real horizon; times in UTC.

## Repository layout

| Path | Content |
| --- | --- |
| `pipeline/` | Python offline pipeline: ephemerides, terrain, horizon masks, reference visibility |
| `web/` | React + TypeScript static app (`src/core` is the pure computation core) |
| `contract/` | Data contract between pipeline and web: version, JSON schemas, examples |
| `ops/` | Task runner, JPL Horizons reference download, deployment, slide screenshots |
| `tests/golden/` | Reference values from independent sources (JPL Horizons, published events) |
| `docs/` | Team documentation (in Spanish): specification, tasks, decisions |

## Validation

The validation page of the app (`#/validation`) is generated from the automated test report
(`web/public/data/validation_report.json`: 21 checks; 11 pass, 2 need a person's judgement, one of them
an open discrepancy, and 8 are not automated). It opens with three checks against independent sources:

- **Sun and Earth positions vs JPL Horizons:** 256 azimuth and elevation values (8 sites × 8 dates);
  largest difference 0.000025° (tolerance 0.02°).
- **Total solar eclipse seen by Blue Ghost Mission 1 (14 March 2025)** vs the times published by
  Firefly Aerospace: the four contacts agree within 1 minute (tolerance 5 min).
- **Our south pole maps vs NASA's illumination and Earth visibility maps:** at 20 random points, each
  with its own horizon, Pearson r = 0.997 (Sun) and 0.996 (Earth); over the 367,236 cells of the 85° S
  maps, r = 0.992 and 0.994.

Other automated checks: sunrise and sunset vs JPL Horizons (largest difference 0.5 s), the horizon of
a smooth sphere and of a mountain worked out by hand, geometric sanity checks 2024–2044, invariants of
the horizon engine, Blue Ghost 1 replanning (works at the real landing, fails 14 days later because of
the night), 13 solar eclipses at (0°, 0°) in 2025–2030 against NASA's eclipse catalogue, and the map
layers against per-site horizons (largest difference 0.005°). The 122 browser tests, which include the
interface figures against the Python reference, run with `make test-all`.

## Limitations

- **Rise and set times** are only as accurate as the terrain map. Where the horizon is set by low
  relief close to the site, a few metres of error in the map shift them by tens of minutes at
  mid-latitudes and by hours near the poles, where the Sun skims the horizon.
- **Longest night near Shackleton:** our best cell gives 147 days of continuous light (published: about
  240 days, same order) but a longest night of 11.25 days against about 1.5 days published. The check
  is shown as "Manual", not as a pass. Our maps use one horizon per 500 m cell at 2 m height; the
  published figure is for the best points at the scale of the LOLA grid.
- **The only observed event away from the poles, the Blue Ghost 1 sunset (16 March 2025), differs from
  our prediction by about 40 minutes.** Firefly gives no exact time, only that the last data arrived
  around 23:15 UTC, "just over 5 hours into the lunar night", which puts sunset around 18:00–18:15 UTC;
  our model has the centre of the Sun on the horizon at 18:54 UTC. The horizon there is an 11 m rise
  800 m away, smaller than the 59 m terrain map can resolve: moving the site by one pixel moves our
  sunset by up to 51 minutes. The validation page shows it as an open discrepancy, not as a pass.
- **The 3D view is illustrative:** the terrain is the 500 m polar grid (or, away from the pole, a
  reconstruction from the site's horizon profile); every figure comes from the horizon calculation,
  not from the 3D scene. Beyond the mapped area the 3D view shows a smooth Moon and says so.
- **Maps** cover the south pole on a 500 m grid. The default requirements are a team choice, editable
  in `Replan` (see above).
- **Dates:** the ephemeris table covers 1969–1972 and 2024–2044.
- **Phones:** the app works on a phone in one column; the 3D view and `Plan` work best on a wider
  screen.

## Use of AI

This project was built with the help of generative AI, as allowed by the Space Apps 2026 rules:

- **Tool:** Claude Code (Anthropic) wrote most of the source code, tests, configuration and
  deployment scripts, and helped write the team's specification (`docs/spec/`, in Spanish), the task
  cards and this documentation, always from instructions and decisions written by the team.
- **What people did:** the team chose the problem, the physics, the scientific conventions, the test
  cases, their tolerances and the reference values, which come from independent sources (JPL Horizons,
  Firefly Aerospace's published times, NASA's eclipse catalogue and illumination maps), never from our
  own code. Every change goes through a pull request reviewed and merged by a team member. Decisions
  the AI took while working unsupervised are signed as such in `docs/decisions.md` and wait for a
  person to read them.
- **Disclosure in the code:** every source file starts with the line
  `AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos`, and commits carry an
  `AI-assisted: Claude Code` trailer. The app's footer says so too.
- **Log:** [AI_USAGE.md](AI_USAGE.md) records, task by task, what the AI generated and what a person
  reviewed, including the reviews that are still pending.
- No NASA logo or mission insignia appears in the app; NASA is named only as a data source. Any
  AI-generated image used in the presentation is marked as AI-generated.

## License

Code: [MIT](LICENSE), © 2026 Aeroinformágicos. Derived data (ephemeris table, horizon masks, maps) are
published with the citation of their sources ([SOURCES.md](SOURCES.md)); the input data keep their own
terms (NASA and JPL data are public).
