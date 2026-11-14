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
| LOLA illumination products 2016 (`AVGVISIB_*`, `LPSR_*`): labels only so far. Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", *Icarus* 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 | Label-parsing test fixtures (the data come later, for validation) | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ | NASA, public ("EXTRAS", not supported by PDS); cite the paper |
| Gazetteer of Planetary Nomenclature (IAU / USGS), feature 5450, Shackleton | Crater centre for the DEM orientation test | https://planetarynames.wr.usgs.gov/Feature/5450 | Public |
| Zuber, M. T., et al. (2012), "Constraints on the volatile distribution within Shackleton crater at the lunar south pole", *Nature* 486, 378-381, doi:10.1038/nature11216 | Published depth of Shackleton (4.1 km) for the DEM reading test | https://ntrs.nasa.gov/api/citations/20120013758/downloads/20120013758.pdf | Cited, not redistributed |
| LROC, "JAXA SLIM Landing" (lander at 13.3160° S, 25.2510° E, -912 m elevation) | Known height for the SLDEM2015 reading test | https://lroc.im-ldi.com/images/1358 | Cited, not redistributed |
| NSSDCA, "Table of Anthropogenic Impacts and Spacecraft on the Moon" | Coordinates and dates of `blue-ghost-1` and `apollo-11` in the example `sites.json` | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html | NASA, public |
| Firefly Aerospace, Blue Ghost Mission 1 updates | Landing time of `blue-ghost-1`; eclipse and sunset times quoted in the example validation report | https://fireflyspace.com/?p=3379 | Cited, not redistributed |
| NASA candidate landing regions near the lunar south pole (2024 list): centres and sizes via nasanow.org, citing USGS ScienceBase record 671a6fa8d34efed5620f89f8 | `map/regions.json` of the example data | https://www.nasanow.org/artemis ; https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 | Public; centres pending verification by A2 |
| JPL Horizons | Named as the reference of case A1 in the example validation report | https://ssd.jpl.nasa.gov/horizons/ | NASA JPL, public |
| Cloudflare Pages documentation: "Limits" (files per site, size per file) and "Headers" (`_headers` file format) | `make deploy-heavy`: limits checked before publishing and the CORS `_headers` file of the heavy origin | https://developers.cloudflare.com/pages/platform/limits/ and https://developers.cloudflare.com/pages/configuration/headers/ | Cloudflare documentation (reference only, nothing copied) |

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
