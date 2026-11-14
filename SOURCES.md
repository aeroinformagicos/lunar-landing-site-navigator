<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Sources

Every external source (data, papers, libraries, code snippets) is listed here, in the same commit
in which it is first used. Content owner: A2.

## Data

| Source | Used for | URL | License / terms |
| --- | --- | --- | --- |
| NAIF generic SPICE kernels: `naif0012.tls`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | Ephemerides and the MOON_ME frame (CI downloads them; tests check exact sizes) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels | NASA/JPL NAIF, public |
| LOLA polar gridded data records, PDS data set `LRO-L-LOLA-4-GDR-V1.0` (LRO LOLA Team, NASA GSFC): `LDEM_80S_40M`, `LDEM_75S_120M`, `LDEM_60S_120M` (all V2.0) and their labels | Terrain near the south pole; the three labels are test fixtures | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ | NASA PDS, public |
| LOLA archive projection catalogues `DSMAP_POLAR.CAT` and `DSMAP.CAT` | Polar stereographic and simple cylindrical pixel formulas | https://imbrium.mit.edu/CATALOG/ | NASA PDS, public |
| SLDEM2015, 512 ppd tiles (`SLDEM2015_512_*_FLOAT.IMG`) and their labels. Barker, M. K., Mazarico, E., Neumann, G. A., Zuber, M. T., Haruyama, J., Smith, D. E. (2016), "A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera", *Icarus* 273, 346-355, doi:10.1016/j.icarus.2015.07.039 | Terrain between 60° S and 60° N (per-site crops); three labels are test fixtures | https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/ | NASA PDS / PGDA, public; cite the paper |
| LOLA illumination products 2016 (`AVGVISIB_*`, `LPSR_*`) and their labels. Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", *Icarus* 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 | Label-parsing test fixtures; `AVGVISIB_85S_060M_201608`, `AVGVISIB_75S_120M_201608` and their `_EARTH` versions are read by `compare-nasa` (case B7, figures of the validation page) and by the NASA-based fallback map layers (plan B-4); `LPSR_85S_060M_201608` only in a reading check | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ | NASA, public ("EXTRAS", not supported by PDS); cite the paper |
| Gazetteer of Planetary Nomenclature (IAU / USGS), feature 5450, Shackleton | Crater centre for the DEM orientation test; coordinates of `shackleton-floor` in `contract/sites.catalog.json` | https://planetarynames.wr.usgs.gov/Feature/5450 | Public |
| Zuber, M. T., et al. (2012), "Constraints on the volatile distribution within Shackleton crater at the lunar south pole", *Nature* 486, 378-381, doi:10.1038/nature11216 | Published depth of Shackleton (4.1 km) for the DEM reading test | https://ntrs.nasa.gov/api/citations/20120013758/downloads/20120013758.pdf | Cited, not redistributed |
| LROC, "JAXA SLIM Landing" (lander at 13.3160° S, 25.2510° E, -912 m elevation) | Known height for the SLDEM2015 reading test; landing time of `slim` in `contract/sites.catalog.json` | https://lroc.im-ldi.com/images/1358 | Cited, not redistributed |
| NSSDCA, "Table of Anthropogenic Impacts and Spacecraft on the Moon" | Coordinates and dates of `blue-ghost-1` and `apollo-11` in the example `sites.json`; coordinates and dates of the 27 landings of `contract/sites.catalog.json` (as transcribed in `docs/spec/04_catalogo_sitios.md` §2) | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html | NASA, public |
| Firefly Aerospace, Blue Ghost Mission 1 updates | Landing time of `blue-ghost-1`; eclipse and sunset times quoted in the example validation report | https://fireflyspace.com/?p=3379 | Cited, not redistributed |
| NASA candidate landing regions near the lunar south pole (2024 list): centres and sizes via nasanow.org, citing USGS ScienceBase record 671a6fa8d34efed5620f89f8 | `map/regions.json` of the example data; the 9 candidate regions of `contract/sites.catalog.json` and the real `map/regions.json` | https://www.nasanow.org/artemis ; https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 | Public; centres pending verification by A2 |
| Wikipedia, "Chang'e 7" ("peak near the southeast ridge of Shackleton crater", -88.8°, 123.4° E) | Coordinates of `change-7-candidate` in `contract/sites.catalog.json` (a reported candidate, not an official site; Wikipedia takes them from a social-media post) | https://en.wikipedia.org/wiki/Chang%27e_7 | CC BY-SA 4.0 (facts only, no text reused) |
| JPL Horizons (observer on the lunar surface, airless) | Reference of case A1; the 15 azimuth/elevation rows of `tests/golden/horizons_smoke.csv` (queried by the team, values in `docs/spec/05_efemerides.md` §8.3); the 128 rows of `tests/golden/horizons_azel.csv` (case A1) and the 1-minute Sun series of `tests/golden/horizons_sun_series.csv` (case A2), downloaded by `ops/fetch_golden.py` through the Horizons API, with the untouched responses in `tests/golden/raw/` | https://ssd.jpl.nasa.gov/horizons/ ; API: https://ssd.jpl.nasa.gov/api/horizons.api (documentation https://ssd-api.jpl.nasa.gov/doc/horizons.html) | NASA JPL, public |
| Firefly Aerospace (2025), "Firefly Aerospace Successfully Completes 14 Days of Surface Operations on the Moon" | Last data and "5 hours into the lunar night" of Blue Ghost 1 (case A3 rows of `tests/golden/events_published.csv`); the eclipse rows (case B3) quote the mission updates listed above | https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon | Cited, not redistributed |
| Espenak, F., "Lunar Eclipses: 2021 - 2030", NASA GSFC | Dates, times of greatest eclipse (TD), types and umbral magnitudes of `tests/golden/eclipses_nasa.csv` (case B4) | https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html | NASA, public |
| NASA (19 August 2022), "NASA Identifies Candidate Regions for Landing Next Americans on Moon" | Context for the default night limit in the README and decision D-116 (Artemis III regions chosen for continuous sunlight over a 6.5-day period) | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ | NASA, public |
| NASA Technical Reports Server 20250011660, "Artemis III Site Selection Update: Downselection From Thirteen to Nine Candidate Regions" | Context for the default night limit (surface stay of about 5.75-6.25 days by epoch), README and decision D-116 | https://ntrs.nasa.gov/citations/20250011660 | NASA, public |
| NASA PGDA, product 69, "Lunar Polar Illumination" | Source cited for cases A7 and B7 and for the `A7B7` headline of `validation_report.json`; its AVGVISIB maps are compared with ours in B7 | https://pgda.gsfc.nasa.gov/products/69 | NASA, public |
| LROC, "Blue Ghost Lunar Lander Seen From Above" (M. Robinson, 7 March 2025): lander at 18.5623° N, 61.8103° E, -3650 m elevation, on the rim of a 12 m crater | Independent check of the site height and position in the A3 investigation (`docs/handoff/A3-investigacion.md`) | https://lroc.im-ldi.com/images/1407 | Cited, not redistributed |
| Gazetteer of Planetary Nomenclature (IAU / USGS), feature 15996, Mons Latreille (18.47° N, 61.92° E, 6.4 km); height of about 150 m from Wikipedia, "Mons Latreille" | Orientation check of the SLDEM2015 crop of `blue-ghost-1` in the A3 investigation | https://planetarynames.wr.usgs.gov/Feature/15996 ; https://en.wikipedia.org/wiki/Mons_Latreille | USGS, public; Wikipedia CC BY-SA 4.0 (cited) |
| Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), "The JPL Planetary and Lunar Ephemerides DE440 and DE441", *The Astronomical Journal* 161:105, doi:10.3847/1538-3881/abd414 | Ephemerides and lunar orientation behind `de440.bsp` and `moon_pa_de440_200625.bpc`; reference [1] of `moon_de440_250416.tf`, whose own check value is the first SPICE test | https://doi.org/10.3847/1538-3881/abd414 | Cited, not redistributed |
| Josefsson, S. (2006), RFC 4648 "The Base16, Base32, and Base64 Data Encodings", §5 "Base 64 Encoding with URL and Filename Safe Alphabet" | Encoding of the shareable link `#s=<base64url(JSON)>` (F16) in `web/src/state/url.ts` | https://www.rfc-editor.org/rfc/rfc4648#section-5 | IETF standard (reference only, nothing copied) |
| Cloudflare Pages documentation: "Limits" (files per site, size per file) and "Headers" (`_headers` file format) | `make deploy-heavy`: limits checked before publishing and the CORS `_headers` file of the heavy origin | https://developers.cloudflare.com/pages/platform/limits/ and https://developers.cloudflare.com/pages/configuration/headers/ | Cloudflare documentation (reference only, nothing copied) |
| McEwen, A. S. (1991), "Photometric functions for photoclinometry and other applications", *Icarus* 92, 298-311; phase-function coefficients as implemented in the USGS ISIS photometric model `LunarLambertMcEwen` | Lunar-Lambert reflectance of the regolith in the 3D view (illustrative shading only; no figure depends on it) | https://isis.astrogeology.usgs.gov/9.0.0/Object/Programmer/_lunar_lambert_mc_ewen_8cpp_source.html | Cited; ISIS is public domain (USGS) |

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
| three.js (`three`, `@types/three`), https://threejs.org | 0.187.0 | 3D view: WebGL 2 renderer, shader materials, geometry (loaded on demand) | MIT |
| Wrangler | 4.160.0 | Cloudflare Pages deployment | MIT OR Apache-2.0 |
| @fontsource/inter, @fontsource/jetbrains-mono | 5.3.0, 5.3.0 | Fonts of the v2 interface (Inter, JetBrains Mono), bundled, latin subset only | OFL-1.1 (fonts); MIT (package) |
