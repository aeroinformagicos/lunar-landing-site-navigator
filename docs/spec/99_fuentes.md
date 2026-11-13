# 99 · Fuentes

Todas las fuentes citadas en la especificación. Las copias locales están en `referencias/`. La tarea T-01 vuelca esta lista en `SOURCES.md`, que A2 mantiene durante el evento.

## 1. Datos y núcleos

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-01 | NAIF/JPL, núcleos genéricos de SPICE: `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` (N. Bachman, 2025), `naif0012.tls` | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` | `03` §2, `05` |
| F-02 | Park, R. S., et al. (2021), «The JPL Planetary and Lunar Ephemerides DE440 and DE441», *The Astronomical Journal* 161:105 | `https://iopscience.iop.org/article/10.3847/1538-3881/abd414/meta` | `03` §2 |
| F-03 | LOLA GDR polares, conjunto PDS `LRO-L-LOLA-4-GDR-V1.0` (LRO LOLA Team, GSFC): `LDEM_80S_40M` (V2.0), `LDEM_75S_120M` (V2.0), `LDEM_60S_120M` (V2.0); `LDEM_85S_40M` solo como referencia de la opción inicial | `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/` y `https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/` | `03` §4 |
| F-04 | Catálogos de proyección del archivo LOLA: `DSMAP_POLAR.CAT`, `DSMAP.CAT` | `https://imbrium.mit.edu/CATALOG/` | `03` §3 |
| F-05 | SLDEM2015, teselas de 512 ppd y ficheros `README` | `https://imbrium.mit.edu/DATA/SLDEM2015/` | `03` §5 |
| F-06 | Barker, M. K., Mazarico, E., Neumann, G. A., Zuber, M. T., Haruyama, J., Smith, D. E., «A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera», *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039; página del PGDA, producto 54 | `https://pgda.gsfc.nasa.gov/products/54` | `03` §5 |
| F-07 | Productos de iluminación de LOLA (`AVGVISIB_*`, `LPSR_*`, 2016) y `README_ILLUMINATION_2016.TXT` | `https://imbrium.mit.edu/EXTRAS/ILLUMINATION/` | `03` §6, `08` §8 |
| F-08 | PGDA, producto 69, «Lunar Polar Illumination» | `https://pgda.gsfc.nasa.gov/products/69` | `03` §6, `08` §8 |
| F-09 | Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), «Illumination conditions of the lunar polar regions using LOLA topography», *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030 | `https://ntrs.nasa.gov/citations/20120010094` | A6, A7, `08` |
| F-10 | Gläser, P., Oberst, J., Neumann, G. A., Mazarico, E., Speyerer, E. J., Robinson, M. S. (2018), «Illumination conditions at the lunar poles: Implications for future exploration», *Planetary and Space Science* 162 | `https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20170007365.pdf` | A6 (pendiente) |
| F-11 | PGDA, producto 78, «High-Resolution LOLA Topography for Lunar South Pole Sites» (refinamiento de P2; no se usa en la base) | `https://pgda.gsfc.nasa.gov/products/78` | `90` |
| F-12 | Barker, M. K., et al. (2021), «Improved LOLA Elevation Maps for South Pole Landing Sites» | `https://ntrs.nasa.gov/citations/20205009660` | Contexto |

## 2. Efemérides de referencia

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-13 | JPL Horizons, documentación de la API (versión 1.3 del documento; la respuesta declara `API VERSION: 1.2`) | `https://ssd-api.jpl.nasa.gov/doc/horizons.html` | `03` §8, `11` §2 |
| F-14 | JPL Horizons, manual | `https://ssd.jpl.nasa.gov/horizons/manual.html` | `11` |
| F-15 | JPL Horizons, respuestas de prueba (observador en la superficie lunar) | `https://ssd.jpl.nasa.gov/api/horizons.api` (copias en `referencias/horizons/`) | `05` §8.3 |
| F-16 | Espenak, F., «Lunar Eclipses: 2021 – 2030», NASA GSFC | `https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html` | B4 |

## 3. Sitios

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-17 | NSSDCA (D. R. Williams), «Table of Anthropogenic Impacts and Spacecraft on the Moon» | `https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html` | `04` §2 |
| F-18 | NSSDCA, «Apollo Landing Site Coordinates» (coordenadas de Wagner et al., *Icarus* 283, 92–103, 2017) | `https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html` | `04` §2 |
| F-19 | NASA (2024), «NASA Provides Update on Artemis III Moon Landing Regions», nota de prensa 24-136 | `https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/` | `04` §3 |
| F-20 | George, T., Rubio, M. A., Lawrence, S. J., Curell, P. (2026), «Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions», 57th LPSC, resumen 1901 | `https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf` y `https://ntrs.nasa.gov/citations/20250011660` | `04` §3, `90` |
| F-21 | nasanow.org, «Artemis» (centros y tamaños de las regiones; cita el registro del USGS) | `https://www.nasanow.org/artemis` | `04` §3 |
| F-22 | USGS ScienceBase, registro `671a6fa8d34efed5620f89f8` (rejillas de navegación de las regiones candidatas) — no leído directamente | `https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8` | `04` §3 (pendiente) |
| F-23 | LROC, «Viewing Peak Near Cabeus B … controlled NAC mosaic» (centro del mosaico) | `https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLOB` | `04` §3 |
| F-24 | «Evaluating potential landing sites for the Artemis III mission using a multi-criteria decision making approach», *Acta Astronautica* (2024) (coordenadas del sitio DM2) | `https://www.sciencedirect.com/science/article/pii/S0094576524006234` | `04` §3 |
| F-25 | Gazetteer of Planetary Nomenclature (IAU/USGS), ficha 5450, Shackleton | `https://planetarynames.wr.usgs.gov/Feature/5450` | `03` §4.4, `04` §4 |
| F-26 | Wikipedia, «Chang'e 7» (coordenadas del sitio candidato) | `https://en.wikipedia.org/wiki/Chang%27e_7` | `04` §4 |
| F-27 | Wikipedia, «List of artificial objects on the Moon» (solo contraste) | `https://en.wikipedia.org/wiki/List_of_artificial_objects_on_the_Moon` | `04` §2 |
| F-28 | LROC, «IM-2 Athena Seen Obliquely» (2025) | `https://lroc.im-ldi.com/images/1408` | `04` §2 |
| F-29 | LROC, «JAXA SLIM Landing» (cota y hora del alunizaje de SLIM) | `https://lroc.im-ldi.com/images/1358` | `03` §5.4, `04` §2 |
| F-44 | Zuber, M. T., et al. (2012), «Constraints on the volatile distribution within Shackleton crater at the lunar south pole», *Nature* 486, 378–381, doi:10.1038/nature11216 | `https://ntrs.nasa.gov/api/citations/20120013758/downloads/20120013758.pdf` | `03` §4.4 |
| F-30 | LROC, «Firefly Blue Ghost Landing Region» y «Blue Ghost Lunar Lander Seen From Above» | `https://www.lroc.im-ldi.com/images/1400`, `https://www.lroc.asu.edu/images/1407` | Contexto |

## 4. Hechos de misión usados en la validación

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-31 | Firefly Aerospace (2025), «Firefly Aerospace Successfully Completes 14 Days of Surface Operations on the Moon» | `https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon` | A3 |
| F-32 | Firefly Aerospace (2025), diario de la misión Blue Ghost 1 | `https://fireflyspace.com/?p=3379` | B3, `04` |
| F-33 | Intuitive Machines, partes de misión de IM-2; NBC News, fin de misión de IM-2 (citadas en el plan) | `https://intuitivemachines.com/im-2`, `https://www.nbcnews.com/science/space/moon-landing-private-spacecraft-second-time-week-rcna194919` | Pitch (plan) |
| F-34 | Space.com y SpaceNews, retraso de Chang'e 7 (citadas en el plan) | `https://www.space.com/space-exploration/launches-spacecraft/bad-weather-delays-launch-of-chinas-historic-change-7-mission-to-moons-south-pole`, `https://spacenews.com/china-delays-change-7-lunar-south-pole-landing-mission-launch/` | Pitch (plan) |
| F-35 | Aerospace America, «NASA rethinks Artemis path forward» (citada en el plan) | `https://aerospaceamerica.aiaa.org/nasa-rethinks-artemis-path-forward-accelerating-launch-cadence-and-adding-2027-mission/` | `04` §3 |

## 5. Reto y normas

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-36 | NASA Space Apps Challenge 2026, reto «Lunar Landing Site Navigator» | `https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/` | `01` §7 |
| F-37 | Documentos del equipo: `contexto/plan_para_especificacion.md`, `contexto/contexto_para_especificacion.md`, `contexto/reto.md` | Locales | Toda la especificación |

## 6. Herramientas

| Id | Fuente | URL | Usada en |
| --- | --- | --- | --- |
| F-38 | Registro PyPI: `spiceypy` 8.3.0, `numpy` 2.5.4, `torch` 2.15.0, `pillow` 13.0.0, `pytest` 9.2.0, `jsonschema` 4.26.0, `ruff` 0.17.4 | `https://pypi.org/` | `02` §3 |
| F-39 | Registro npm: `react` 19.3.1, `vite` 8.3.7, `typescript` 7.0.2, `vitest` 5.1.0, `zustand` 5.1.0, módulos `d3-*`, `@playwright/test` 1.65.0, `@vitejs/plugin-react` 6.3.0, `wrangler` 4.160.0 | `https://registry.npmjs.org/` | `02` §3 |
| F-40 | Cloudflare Pages, límites | `https://developers.cloudflare.com/pages/platform/limits/` | `02` §6.2 |
| F-41 | GitHub Pages, límites; y tabla de planes de GitHub | `https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits`, `https://docs.github.com/en/get-started/learning-about-github/githubs-plans` | `02` §6.2 |
| F-45 | Índice de ruedas de PyTorch con CUDA (`cu132`) | `https://download.pytorch.org/whl/cu132` | `02` §3.1 |
| F-42 | Okabe, M. e Ito, K., paleta de colores apta para daltonismo («Color Universal Design») | Sin enlace abierto en la redacción: valores hexadecimales PENDIENTES DE VERIFICAR (A3) | `10` §2 |
| F-43 | «LunarRF: A Terrain-Aware Propagation Engine…» (preimpresión, 2026): superficies de las rejillas de navegación de las regiones, solo como contraste | `https://arxiv.org/html/2610.34554v1` — URL y contenido PENDIENTES DE VERIFICAR (A2) | Ninguno: ningún fichero de la especificación la cita. No se pasa a `SOURCES.md` salvo que A2 la verifique y se use |

## 7. Notas de uso

- Los datos de la NASA y del JPL son públicos; en la página del proyecto van en el campo «NASA data used»: F-01, F-03, F-05, F-07, F-13, F-16, F-17.
- Wikipedia y nasanow.org son fuentes secundarias: lo tomado de ellas está marcado como pendiente de verificar (`90_dudas_y_riesgos.md` §3.2).
- Cada fuente nueva que aparezca durante el evento se añade a `SOURCES.md` en el mismo commit en que se usa.
