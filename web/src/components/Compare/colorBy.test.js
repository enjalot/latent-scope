import { describe, it, expect } from 'vitest';
import { buildColorByConfig, buildColorPoints, MISSING_COLOR } from './colorBy';

const XY = [
  [0.1, 0.2],
  [0.3, 0.4],
  [0.5, 0.6],
];

describe('Compare colorBy — missing value handling (#131 review)', () => {
  it('numeric: missing rows go to the reserved neutral slot, not the minimum', () => {
    const cfg = buildColorByConfig('score', {
      type: 'numeric',
      values: [10, null, 50],
      extent: [10, 50],
    });
    expect(cfg.missingColor).toBe(MISSING_COLOR); // neutral reserved when missing present
    const pts = buildColorPoints(XY, cfg);
    // valueB is the 4th channel. Missing (index 1) -> 0 (neutral slot).
    expect(pts[1][3]).toBe(0);
    // Real min (index 0) is pushed off 0 so it never collides with neutral.
    expect(pts[0][3]).toBeGreaterThan(0);
    expect(pts[2][3]).toBeCloseTo(1, 5); // real max maps to top of ramp
  });

  it('numeric: no neutral reserved when there are no missing values', () => {
    const cfg = buildColorByConfig('score', {
      type: 'numeric',
      values: [10, 30, 50],
      extent: [10, 50],
    });
    expect(cfg.missingColor).toBeUndefined();
    const pts = buildColorPoints(XY, cfg);
    expect(pts[0][3]).toBe(0); // min maps straight to 0 (full ramp available)
  });

  it('categorical: real cats shift to 1..n and missing (-1) maps to neutral index 0', () => {
    const cfg = buildColorByConfig('source', {
      type: 'categorical',
      values: [0, 2, -1],
      categorical: { categories: ['a', 'b', 'c'], counts: [5, 3, 1] },
    });
    // neutral prepended at index 0; real categories occupy 1..n
    expect(cfg.colorRange[0]).toBe(MISSING_COLOR);
    expect(cfg.colorDomain).toEqual([0, 1, 2, 3]);
    const pts = buildColorPoints(XY, cfg);
    expect(pts[0][2]).toBe(1); // category 0 -> valueA 1
    expect(pts[1][2]).toBe(3); // category 2 -> valueA 3
    expect(pts[2][2]).toBe(0); // missing -1 -> valueA 0 (neutral)
    // legend gains a "(no value)" swatch
    expect(cfg.legend.categories.at(-1)).toMatchObject({ label: '(no value)', color: MISSING_COLOR });
  });
});
