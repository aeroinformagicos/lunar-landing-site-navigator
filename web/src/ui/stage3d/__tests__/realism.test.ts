// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-74: realism of the 3D view. Pure parts only (no WebGL): catalogue markers ready for T-91.
import { describe, expect, it } from 'vitest';
import { catalogueMarker } from '../scenePlan';

describe('catalogue markers (T-74 point 4, ready for T-91)', () => {
  it('a candidate region with a contour is drawn by its outline, not as a marker', () => {
    expect(catalogueMarker({ type: 'candidate_region', region_id: 'haworth' })).toBe(false);
  });
  it('a candidate point without a contour (region_id null) is a marker', () => {
    expect(catalogueMarker({ type: 'candidate_region', region_id: null })).toBe(true);
  });
  it('landings, validation and demo sites stay markers', () => {
    for (const type of ['landing', 'validation', 'demo'] as const) expect(catalogueMarker({ type, region_id: null })).toBe(true);
  });
});
