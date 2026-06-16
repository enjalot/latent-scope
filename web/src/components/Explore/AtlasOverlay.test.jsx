import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { default: AtlasOverlay } = await import('./AtlasOverlay.jsx');

const manifest = {
  generated: true,
  cell_size: 32,
  samples: 1,
  domain: [-1, 1],
  resolutions: [
    { num_tiles: 64, atlas_px: 2048, filled_cells: 800, sheets: ['r64-c32/sheet_000.webp'] },
    { num_tiles: 128, atlas_px: 4096, filled_cells: 2000, sheets: ['r128-c32/sheet_000.webp'] },
    { num_tiles: 256, atlas_px: 8192, filled_cells: 4000, sheets: ['r256-c32/sheet_000.webp'] },
  ],
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

describe('AtlasOverlay', () => {
  it('renders nothing when disabled', () => {
    const { container } = render(
      <AtlasOverlay {...base} enabled={false} transform={{ k: 10 }} />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when zoomed out (cells too small)', () => {
    // k=1: 64-grid cell = 800*1/64 = 12.5px < MIN_CELL_PX(14) -> nothing
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1 }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the coarse (64) sheet at medium zoom', () => {
    // k=1.5: 64-cell=18.75px (ok), 128-cell=9.4px (<14) -> pick 64
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 1.5 }} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('res=64');
  });

  it('switches to the fine (128) sheet at higher zoom', () => {
    // k=3: 128-cell=18.75px (ok) -> prefer the finest that fits
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 3 }} />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toContain('res=128');
  });

  it('reaches the deepest (256) sheet when zoomed in far', () => {
    // k=6: 256-cell=18.75px (ok)
    const { container } = render(<AtlasOverlay {...base} enabled transform={{ k: 6 }} />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toContain('res=256');
  });

  it('covers the [0,width] box and applies the zoom as a CSS transform', () => {
    // The sheet is positioned at the identity box and pan/zoom is a CSS
    // transform mirroring the d3 transform (translate + scale).
    const { container } = render(
      <AtlasOverlay {...base} enabled transform={{ k: 1.5, x: 20, y: 10 }} />
    );
    const img = container.querySelector('img');
    expect(img.style.left).toBe('0px');
    expect(img.style.top).toBe('0px');
    expect(img.style.width).toBe('800px');
    expect(img.style.height).toBe('800px');
    expect(img.style.transform).toBe('translate(20px, 10px) scale(1.5)');
    expect(img.style.transformOrigin).toBe('0 0');
  });
});
