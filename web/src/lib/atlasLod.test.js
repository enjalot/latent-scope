import { describe, it, expect } from 'vitest';
import { atlasLod, POINTS_HANDOFF_CELL_PX } from './atlasLod.js';

const RES = [64, 128, 256];
const W = 800;

describe('atlasLod', () => {
  it('shows nothing when zoomed out (coarsest cells too small)', () => {
    // k=1: 64-cell = 800/64 = 12.5px < 14 -> heatmap should show, not atlas
    const lod = atlasLod(1, W, RES);
    expect(lod.resolution).toBeNull();
    expect(lod.active).toBe(false);
    expect(lod.deepest).toBe(false);
  });

  it('picks the coarse grid at medium zoom', () => {
    // k=1.5: 64-cell=18.75 (ok), 128-cell=9.4 (no) -> 64
    expect(atlasLod(1.5, W, RES).resolution).toBe(64);
  });

  it('advances to finer grids as you zoom', () => {
    expect(atlasLod(3, W, RES).resolution).toBe(128); // 128-cell=18.75
    expect(atlasLod(6, W, RES).resolution).toBe(256); // 256-cell=18.75
  });

  it('flags deepest once past the finest grid handoff', () => {
    // deepest when 256-cell px >= POINTS_HANDOFF_CELL_PX(40): k >= 40*256/800 = 12.8
    expect(atlasLod(6, W, RES).deepest).toBe(false);
    expect(atlasLod(13, W, RES).deepest).toBe(true);
    expect(atlasLod(13, W, RES).resolution).toBe(256); // atlas still shown under points
  });

  it('is order-independent and handles empties', () => {
    expect(atlasLod(3, W, [256, 64, 128]).resolution).toBe(128);
    expect(atlasLod(3, W, []).resolution).toBeNull();
    expect(atlasLod(3, 0, RES).resolution).toBeNull();
  });

  it('exposes the handoff constant', () => {
    expect(POINTS_HANDOFF_CELL_PX).toBeGreaterThan(0);
  });
});
