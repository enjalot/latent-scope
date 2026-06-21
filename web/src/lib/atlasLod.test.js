import { describe, it, expect } from 'vitest';
import { atlasLod, MIN_CELL_PX, POINTS_HANDOFF_CELL_PX } from './atlasLod.js';

const RES = [64, 128, 256];
const W = 800;

// on-screen cell px = W*k/R ; pick k so a given resolution's cell hits `px`.
const kFor = (R, px) => (px * R) / W;

describe('atlasLod', () => {
  it('shows nothing when zoomed out (coarsest cells too small)', () => {
    const lod = atlasLod(kFor(64, MIN_CELL_PX - 2), W, RES); // 64-cell just under threshold
    expect(lod.resolution).toBeNull();
    expect(lod.active).toBe(false);
    expect(lod.deepest).toBe(false);
  });

  it('picks the coarse grid once its cells reach the switch threshold', () => {
    expect(atlasLod(kFor(64, MIN_CELL_PX + 1), W, RES).resolution).toBe(64);
  });

  it('advances to finer grids as you zoom', () => {
    expect(atlasLod(kFor(128, MIN_CELL_PX + 1), W, RES).resolution).toBe(128);
    expect(atlasLod(kFor(256, MIN_CELL_PX + 1), W, RES).resolution).toBe(256);
  });

  it('flags deepest once the finest cells pass the points handoff', () => {
    expect(atlasLod(kFor(256, POINTS_HANDOFF_CELL_PX - 4), W, RES).deepest).toBe(false);
    const deep = atlasLod(kFor(256, POINTS_HANDOFF_CELL_PX + 4), W, RES);
    expect(deep.deepest).toBe(true);
    expect(deep.resolution).toBe(256); // atlas still shown under the points
  });

  it('honors custom switch + handoff thresholds', () => {
    // A bigger switch threshold keeps the coarser level longer.
    expect(atlasLod(kFor(128, 17), W, RES, 16).resolution).toBe(128);
    expect(atlasLod(kFor(128, 17), W, RES, 24).resolution).toBe(64); // 128-cell 17 < 24 -> stay on 64
    // A bigger handoff lets you zoom farther before points.
    expect(atlasLod(kFor(256, 60), W, RES, 16, 40).deepest).toBe(true);
    expect(atlasLod(kFor(256, 60), W, RES, 16, 120).deepest).toBe(false);
  });

  it('is order-independent and handles empties', () => {
    expect(atlasLod(kFor(256, 20), W, [256, 64, 128]).resolution).toBe(256);
    expect(atlasLod(3, W, []).resolution).toBeNull();
    expect(atlasLod(3, 0, RES).resolution).toBeNull();
  });

  it('exposes tunable defaults', () => {
    expect(MIN_CELL_PX).toBeGreaterThan(0);
    expect(POINTS_HANDOFF_CELL_PX).toBeGreaterThan(MIN_CELL_PX);
  });
});
