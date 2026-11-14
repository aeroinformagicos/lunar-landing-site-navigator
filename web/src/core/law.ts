// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Radial sampling law of the horizon rays (06_horizonte.md §3, §8). Closed form, identical to
// pipeline/horizon/law.py so both languages get the same distances.

export type LawName = 'full' | 'fast';

interface LawParams {
  d0M: number; // step of the linear stretch, m
  nLin: number; // samples of the linear stretch
  g: number; // ratio of the geometric stretch
  nSamples: number; // N_S
}

export const LAWS: Readonly<Record<LawName, LawParams>> = Object.freeze({
  full: { d0M: 20, nLin: 1000, g: 1.001, nSamples: 3709 },
  fast: { d0M: 40, nLin: 500, g: 1.002, nSamples: 1855 },
});

export function lawNSamples(law: LawName): number {
  return LAWS[law].nSamples;
}

/** Distance in metres of sample i (0 … N_S − 1). */
export function lawDistance(law: LawName, i: number): number {
  const p = LAWS[law];
  if (!Number.isInteger(i) || i < 0 || i >= p.nSamples) {
    throw new RangeError(`Sample index ${i} outside 0..${p.nSamples - 1} for law ${law}`);
  }
  if (i < p.nLin) return p.d0M * (i + 1);
  return p.d0M * p.nLin * Math.pow(p.g, i - (p.nLin - 1));
}

/** Drawing distance of profile bin b (0 … 511) of the cross-section (06 §8). */
export function profileBinDistance(law: LawName, b: number, nBins = 512): number {
  const n = lawNSamples(law);
  const iLo = Math.ceil((b * n) / nBins);
  const iHi = Math.ceil(((b + 1) * n) / nBins) - 1;
  return lawDistance(law, Math.floor((iLo + iHi) / 2));
}
