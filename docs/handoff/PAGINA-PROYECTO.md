<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Página del proyecto en Space Apps · textos para pegar

Preparado el 15/11/2026 en `rc-final` a partir del `SOURCES.md` final y de
`web/public/data/validation_report.json` regenerado con `make report` (commit `ad700fb`). Cada URL se abrió
el 15/11/2026: «OK» = cargó (HTTP 200 o leída con WebFetch); «bloquea robots» = respondió 403 a una
petición automática (la página existe; se leyó con WebFetch o con el navegador).

## NASA Data

| Link Text | URL | Estado |
| --- | --- | --- |
| LOLA polar digital elevation models (PDS, imbrium) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ | OK |
| SLDEM2015 terrain tiles (LOLA + SELENE, imbrium) | https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/ | OK |
| LOLA polar illumination and Earth visibility maps (imbrium) | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ | OK |
| NASA PGDA product 54: SLDEM2015 | https://pgda.gsfc.nasa.gov/products/54 | OK |
| NASA PGDA product 69: Lunar Polar Illumination | https://pgda.gsfc.nasa.gov/products/69 | OK |
| NAIF SPICE generic kernels (DE440, lunar frames) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | OK |
| JPL Horizons | https://ssd.jpl.nasa.gov/horizons/ | OK |
| NASA GSFC lunar eclipses 2021–2030 (F. Espenak) | https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html | OK |
| NSSDCA, Anthropogenic Impacts and Spacecraft on the Moon (landing sites) | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html | OK |
| LROC image 1358: SLIM landing site | https://lroc.im-ldi.com/images/1358 | OK |
| LROC image 1407: Blue Ghost lander seen from above | https://lroc.im-ldi.com/images/1407 | OK |
| NASA, candidate landing regions (2022 list) | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ | OK |
| NASA, update on the candidate landing regions (2024 list) | https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ | OK |

Nota: el catálogo toma las coordenadas de los Apolo de la tabla NSSDCA de impactos y naves
(`lunar_artifact_impacts.html`), no de `lunar_sites.html`, y la de IM-2 también de NSSDCA, no de LROC 1408;
por eso esas dos URL no van en la lista.

## Space Agency Partner & Other Data

| Link Text | URL | Estado |
| --- | --- | --- |
| Barker et al. 2016, SLDEM2015 (Icarus 273) | https://doi.org/10.1016/j.icarus.2015.07.039 | OK |
| Mazarico et al. 2011, lunar polar illumination (Icarus 211) | https://doi.org/10.1016/j.icarus.2010.10.030 | OK |
| Park et al. 2021, DE440 and DE441 (AJ 161:105) | https://doi.org/10.3847/1538-3881/abd414 | OK |
| JAXA SELENE (Kaguya) data archive | https://darts.isas.jaxa.jp/planet/pdap/selene/ | OK |
| IAU / USGS Gazetteer of Planetary Nomenclature | https://planetarynames.wr.usgs.gov/ | OK |
| USGS ScienceBase record of the 2024 candidate regions | https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 | bloquea robots (403) |
| nasanow.org, Artemis regions (secondary: centres and sizes) | https://www.nasanow.org/artemis | OK |
| Firefly Aerospace, Blue Ghost Mission 1 updates | https://fireflyspace.com/?p=3379 | bloquea robots (403) |
| Firefly Aerospace, end of Blue Ghost Mission 1 surface operations | https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon | bloquea robots (403); leída con WebFetch |
| LROC QuickMap (tool used to draw the 2022 region boxes) | https://quickmap.lroc.asu.edu/ | OK |
| Software libraries (versions and licences) | ver la tabla de bibliotecas de `SOURCES.md`, enlazar el fichero del repositorio | — |
| Cloudflare Pages (hosting) | https://pages.cloudflare.com/ | OK |
| Claude Code (AI coding assistant) | https://www.anthropic.com/claude-code | OK |

## Frases corregidas (en inglés, listas para pegar)

**Sun criterion.** "Sun" and "Earth contact" mean that the **centre** of the solar or terrestrial disc is
above the real horizon. The share of the solar disc that clears the terrain is shown separately; it never
changes whether a moment counts as sunlit.

**Horizons.** Sun and Earth positions agree with JPL Horizons across 256 values (azimuth and elevation of
the Sun and the Earth, 8 sites × 8 dates): largest difference 0.000025° (tolerance 0.02°).

**Blue Ghost eclipse.** For the total solar eclipse seen by Blue Ghost Mission 1 on 14 March 2025, our four
contact times agree with those published by Firefly Aerospace within 47 seconds (largest difference
0.78 min, tolerance 5 min).

**NASA maps.** Our south pole maps match NASA's LOLA illumination and Earth visibility maps (Mazarico et
al. 2011): over the 367,236 cells of the 85° S maps, Pearson r = 0.992 for the Sun and 0.994 for the Earth,
with a mean absolute difference of 0.98 and 1.03 percentage points.

**Blue Ghost sunset (A3).** The only observed event away from the poles is an open discrepancy. Firefly
gives no exact sunset time, only that the last data arrived around 23:15 UTC, "just over 5 hours into the
lunar night", which puts sunset around 18:00–18:15 UTC. Our model has the centre of the Sun on the horizon
at 18:54 UTC, about 40 minutes later. The horizon there is an 11 m rise 800 m away, smaller than our 59 m
terrain map can resolve; moving the site by one pixel moves our sunset by up to 51 minutes. We show it as
an open discrepancy, not as a pass.

**Artemis.** The app shows NASA's candidate landing regions near the lunar south pole (2024 list). Since
27 February 2026 NASA plans the first crewed landing for Artemis IV (2028); the regions keep their 2024
names.

*(Comprobar antes de pegar: la fecha del 27/02/2026 y «Artemis IV (2028)» vienen del encargo; no se han
contrastado con una fuente en esta sesión y no están en `SOURCES.md`.)*

**Real terrain and smooth Moon.** Sites with terrain data are computed on the real horizon: Blue Ghost 1
and SLIM on SLDEM2015 (59 m), IM-2 on the LOLA polar model, Chandrayaan-3 on the LOLA 60° S model.
Where we have no terrain data, such as the Apollo and Luna sites, the app uses a smooth Moon and says so in
red.
