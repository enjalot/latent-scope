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

const imgSrc = (c) => c.querySelector('img')?.getAttribute('src') || '';

describe('AtlasOverlay (tiled)', () => {
  it('renders nothing when disabled', () => {
    const { container } = render(<AtlasOverlay {...base} enabled={false} transform={{ k: 10 }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when zoomed out', () => {
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1 }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the coarse (64) tile at medium zoom', () => {
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1.5 }} />);
    expect(imgSrc(container)).toContain('res=64');
    expect(imgSrc(container)).toContain('tx=0');
  });

  it('advances to finer levels as you zoom', () => {
    const a = render(<AtlasOverlay {...base} enabled transform={{ k: 3 }} />);
    expect(imgSrc(a.container)).toContain('res=128');
    cleanup();
    const b = render(<AtlasOverlay {...base} enabled transform={{ k: 6 }} />);
    expect(imgSrc(b.container)).toContain('res=256');
  });

  it('positions tiles in a transformed inner layer', () => {
    const { container } = render(
      <AtlasOverlay {...base} enabled transform={{ k: 1.5, x: 20, y: 10 }} />
    );
    const img = container.querySelector('img');
    const inner = img.parentElement; // the transformed layer holding the tiles
    expect(inner.style.transform).toBe('translate(20px, 10px) scale(1.5)');
    expect(inner.style.transformOrigin).toBe('0 0');
    // single tile spans the full box
    expect(img.style.left).toBe('0px');
    expect(img.style.width).toBe('800px');
  });
});
