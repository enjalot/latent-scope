import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { default: PointsOverlay } = await import('./PointsOverlay.jsx');

const scopeRows = [
  { x: 0.1, y: 0.1, ls_index: 0, deleted: false },
  { x: -0.5, y: 0.3, ls_index: 1, deleted: false },
  { x: 0.0, y: 0.0, ls_index: 2, deleted: true },
];

const base = {
  scopeRows,
  xDomain: [-1, 1],
  yDomain: [-1, 1],
  width: 400,
  height: 400,
};

afterEach(cleanup);

describe('PointsOverlay', () => {
  it('renders a pointer-events:none canvas when enabled', () => {
    const { container } = render(<PointsOverlay {...base} enabled />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('still renders the canvas element when disabled (drawing is skipped)', () => {
    // The component never crashes without a 2d backend (jsdom) and always
    // mounts the canvas so toggling does not remount.
    const { container } = render(<PointsOverlay {...base} enabled={false} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
