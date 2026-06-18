import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { default: AtlasOverlay } = await import('./AtlasOverlay.jsx');

// Single-tile-per-resolution manifest (tile_cells == num_tiles) keeps culling
// trivial so the tests focus on LOD selection + transform.
function resEntry(num_tiles) {
  return {
    num_tiles,
    tile_cells: num_tiles,
    tiles_per_axis: 1,
    tiles: [{ tx: 0, ty: 0, filled_cells: 10 }],
  };
}
const manifest = {
  generated: true,
  cell_size: 32,
  resolutions: [resEntry(64), resEntry(128), resEntry(256)],
};

const base = {
  dataset: { id: 'ds' },
  scopeId: 'scopes-001',
  imageColumn: 'image',
  xDomain: [-1, 1],
  yDomain: [-1, 1],
  width: 800,
  height: 800,
  manifest,
};

afterEach(cleanup);

// All rendered resolutions (across backdrop + target layers).
const renderedRes = (c) =>
  [...c.querySelectorAll('img')].map((i) => +(i.getAttribute('src').match(/res=(\d+)/) || [])[1]);
const finestRes = (c) => Math.max(0, ...renderedRes(c));

describe('AtlasOverlay (tiled)', () => {
  it('renders nothing when disabled', () => {
    const { container } = render(<AtlasOverlay {...base} enabled={false} transform={{ k: 10 }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when zoomed out', () => {
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1 }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows only the coarse (64) tile at medium zoom (no coarser backdrop)', () => {
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1.5 }} />);
    expect(renderedRes(container)).toEqual([64]);
  });

  it('targets finer levels as you zoom, with the coarser one as backdrop', () => {
    const a = render(<AtlasOverlay {...base} enabled transform={{ k: 3 }} />);
    expect(finestRes(a.container)).toBe(128);
    expect(renderedRes(a.container)).toContain(64); // backdrop
    cleanup();
    const b = render(<AtlasOverlay {...base} enabled transform={{ k: 6 }} />);
    expect(finestRes(b.container)).toBe(256);
    expect(renderedRes(b.container)).toContain(128); // backdrop
  });

  it('positions tiles in a transformed inner layer', () => {
    const { container } = render(
      <AtlasOverlay {...base} enabled transform={{ k: 1.5, x: 20, y: 10 }} />
    );
    const img = container.querySelector('img');
    const inner = img.parentElement; // the transformed layer holding the tiles
    expect(inner.style.transform).toBe('translate(20px, 10px) scale(1.5)');
    expect(inner.style.transformOrigin).toBe('0 0');
    expect(img.style.left).toBe('0px');
    expect(img.style.width).toBe('800px');
  });
});
