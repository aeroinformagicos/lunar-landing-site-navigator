# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Physical constants shared by the whole pipeline.

Every constant here is listed in docs/constants.md with its source.
T-07 added what the DEM code needs; T-04 adds the ephemeris constants
(docs/spec/05_efemerides.md §1).
"""

# Reference sphere of the Moon: A_AXIS_RADIUS of every LOLA / SLDEM2015 label.
R_MOON_KM = 1737.4
R_MOON_M = 1_737_400.0

# Radii of the Sun and the Earth (Horizons header: `Target radii` and `R_eq`), km.
R_SUN_KM = 695700.0
R_EARTH_KM = 6378.137

# The only reference frame of the project: mean Earth / polar axis, from moon_de440_250416.tf.
FRAME = "MOON_ME"
# Aberration correction: light time plus stellar aberration.
ABCORR = "LT+S"
# Step of the ephemeris table, seconds (hourly table).
STEP_S = 3600
# Default observer height above the terrain, metres.
OBSERVER_HEIGHT_M = 2.0

# Zenith convention (decision D-62, same value as web/src/core/frames.ts): a horizontal part
# below this fraction of the vector length counts as zenith or nadir and the azimuth is 0°.
ZENITH_REL = 1e-12
