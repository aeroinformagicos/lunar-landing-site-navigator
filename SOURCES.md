<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Sources

Every external source (data, papers, libraries, code snippets) is listed here, in the same commit
in which it is first used. Content owner: A2.

## Data

| Source | Used for | URL | License / terms |
| --- | --- | --- | --- |
| NAIF generic SPICE kernels: `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | Ephemerides and the MOON_ME frame (CI downloads them; tests check exact sizes) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels | NASA/JPL NAIF, public |

## Software libraries

| Library | Version | Used for | License |
| --- | --- | --- | --- |
| NumPy | 2.5.4 | Arrays, DEM reading | BSD-3-Clause |
| SpiceyPy | 8.3.0 | SPICE toolkit wrapper | MIT |
| Pillow | 13.0.0 | Images | MIT-CMU (HPND) |
| pytest | 9.2.0 | Tests | MIT |
| jsonschema | 4.26.0 | Contract validation | MIT |
| Ruff | 0.17.4 | Lint | MIT |
| PyTorch | 2.15.0 | Horizon cube (GPU/CPU) | BSD-3-Clause |
| React, React DOM | 19.3.1 | Web UI | MIT |
| Vite, @vitejs/plugin-react | 8.3.7, 6.3.0 | Web build | MIT |
| TypeScript | 7.0.2 | Type checking | Apache-2.0 |
| Vitest | 5.1.0 | Web tests | MIT |
| Playwright | 1.65.0 | End-to-end tests | Apache-2.0 |
| Zustand | 5.1.0 | Web state | MIT |
| d3-array, d3-scale, d3-shape, d3-selection, d3-zoom | 3.2.5, 4.0.3, 3.2.1, 3.0.1, 3.0.1 | Charts and map zoom | ISC |
| Wrangler | 4.160.0 | Cloudflare Pages deployment | MIT OR Apache-2.0 |
