import { useMemo, useRef, useEffect } from 'react';
import { scaleLinear } from 'd3-scale';

// Spatial grid over the normalized umap space [-1,1]^2 so we draw only points
// in view rather than scanning every row on each pan/zoom.
const GRID = 64;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function toCell(v) {
  return clamp(Math.floor(((v + 1) / 2) * GRID), 0, GRID - 1);
}
function cellKey(cx, cy) {
  return cy * GRID + cx;
}

/**
 * Draws scope points as small circles on a transparent <canvas> ON TOP of the
 * image atlas, so they're visible (and pinpointable) when zoomed in past the
 * deepest grid. Interaction is unchanged: this layer is pointer-events:none, so
 * hover/zoom/select still go to the ScatterGL canvas underneath.
 *
 * Projection matches AnnotationPlot / AtlasOverlay:
 *   xScale = scaleLinear().domain(xDomain).range([0, width])
 *   yScale = scaleLinear().domain(yDomain).range([height, 0])
 */
function PointsOverlay({
  scopeRows,
  xDomain,
  yDomain,
  width,
  height,
  enabled,
  opacity = 1,
  pointSize = 1,
  color = '30, 30, 30',
}) {
  const canvasRef = useRef(null);

  // Bucket points into a spatial grid once per scopeRows.
  const grid = useMemo(() => {
    const cells = new Map();
    if (!scopeRows?.length) return cells;
    for (let i = 0; i < scopeRows.length; i++) {
      const row = scopeRows[i];
      if (!row || row.deleted) continue;
      const key = cellKey(toCell(row.x), toCell(row.y));
      let bucket = cells.get(key);
      if (!bucket) {
        bucket = [];
        cells.set(key, bucket);
      }
      bucket.push(row);
    }
    return cells;
  }, [scopeRows]);

  // Keep the latest draw inputs in a ref and repaint at most once per animation
  // frame, so a burst of pan/zoom updates coalesces into a single redraw.
  const drawRef = useRef(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // no 2d backend (e.g. jsdom in tests)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!enabled || !xDomain || !yDomain || !grid.size) return;

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const xlo = Math.min(xDomain[0], xDomain[1]);
    const xhi = Math.max(xDomain[0], xDomain[1]);
    const ylo = Math.min(yDomain[0], yDomain[1]);
    const yhi = Math.max(yDomain[0], yDomain[1]);

    const radius = clamp(2.2 * pointSize, 1.2, 6);

    const cx0 = toCell(xlo);
    const cx1 = toCell(xhi);
    const cy0 = toCell(ylo);
    const cy1 = toCell(yhi);

    // Batch every visible point into ONE path, then fill+stroke once — far
    // cheaper than per-point draw calls when many points are in view.
    ctx.beginPath();
    const TWO_PI = 2 * Math.PI;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = grid.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (let j = 0; j < bucket.length; j++) {
          const row = bucket[j];
          if (row.x < xlo || row.x > xhi || row.y < ylo || row.y > yhi) continue;
          const px = xScale(row.x);
          const py = yScale(row.y);
          ctx.moveTo(px + radius, py);
          ctx.arc(px, py, radius, 0, TWO_PI);
        }
      }
    }
    ctx.fillStyle = `rgba(${color}, ${opacity})`;
    ctx.fill();
    // A thin contrasting halo keeps dots legible over busy thumbnails.
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, opacity) * 0.6})`;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  };

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = 0;
      drawRef.current();
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, grid, xDomain, yDomain, width, height, opacity, pointSize, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
      }}
    />
  );
}

export default PointsOverlay;
