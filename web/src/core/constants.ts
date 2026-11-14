// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Constants of the web skeleton (T-11). T-12/T-13 add the physical constants from docs/spec/00_indice.md §3.
export const APP_TITLE = 'Lunar Landing Site Navigator';

/** Major version of the data contract this build reads (contract/VERSION, 09_contrato_datos.md). */
export const CONTRACT_MAJOR = 1;

/** Horizon vectors: 720 azimuths every 0.5°, j = 0 is north (09 §5). */
export const N_AZ = 720;
export const AZ_STEP_DEG = 0.5;

/** Exact byte sizes after decompression (09 §3, §6). */
export const EPHEMERIS_BYTES = 5_260_176;
export const PROFILE_BYTES = 737_312;

/** Defaults used when config.json is missing (09 §1: local copy, both keys are `data`). */
export const DEFAULT_DATA_BASE_URL = 'data';
export const DEFAULT_HEAVY_BASE_URL = 'data';

/** Network failures retry once, automatically, after 2 s (10_interfaz.md §9). */
export const NETWORK_RETRY_DELAY_MS = 2000;

/** Scenarios A–D (10 §5). */
export const MAX_SCENARIOS = 4;
export const SCENARIO_LETTERS = ['A', 'B', 'C', 'D'] as const;
export const DEFAULT_OBSERVER_HEIGHT_M = 2;

/** Playback speeds in simulated seconds per real second: `1 h/s`, `6 h/s`, `1 d/s` (10 §4). */
export const PLAY_SPEEDS = [3600, 21_600, 86_400] as const;

/** Radii (00_indice.md §3; ephemeris.meta.json `constants`, 09 §3.2). */
export const R_MOON_KM = 1737.4;
export const R_SUN_KM = 695_700;
export const R_EARTH_KM = 6378.137;
