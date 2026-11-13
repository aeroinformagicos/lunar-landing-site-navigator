# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Physical constants shared by the whole pipeline.

Every constant here is listed in docs/constants.md with its source.
T-07 adds only what the DEM code needs; T-04 adds the ephemeris constants
(docs/spec/05_efemerides.md §1).
"""

# Reference sphere of the Moon: A_AXIS_RADIUS of every LOLA / SLDEM2015 label.
R_MOON_KM = 1737.4
R_MOON_M = 1_737_400.0
