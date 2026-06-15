import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { spriteUrlFor } from '../../lib/spriteUrl';

// Zoom level (ScatterGL transform.k) past which sprites replace dots. Below
// this the map is zoomed out far enough that individual images would be tiny
// and too numerous, so we render dots-only.
const ZOOM_THRESHOLD = 4;

// Hard cap on how many <img> the browser is asked to decode at once. When more
// than this many points are visible we render none and let the dots show,
// keeping browser memory bounded regardless of dataset size.
const MAX_SPRITES = 600;

// Base on-screen sprite size (px); scales modestly with zoom but the source
// file is always the generated `size` (e.g. 64px).
const BASE_SPRITE_PX = 32;
const MIN_SPRITE_PX = 32;
const MAX_SPRITE_PX = 96;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Spatial grid resolution over the normalized umap space [-1, 1]^2. 64 matches
// the scope's own tile grid; cells are ~0.03 wide so a zoomed-in viewport
// touches only a handful.
const GRID = 64;

function toCell(v) {
  return clamp(Math.floor(((v + 1) / 2) * GRID), 0, GRID - 1);
}

function cellKey(cx, cy) {
  return cy * GRID + cx;
}

/**
 * Viewport-culled DOM image overlay for the scatter map. Renders absolutely
 * positioned <img> elements only for points currently visible, past a zoom
 * threshold, capped at MAX_SPRITES. The container is pointer-events:none so the
 * scatter canvas underneath keeps receiving mouse/zoom events.
 *
 * Projection matches AnnotationPlot exactly:
 *   xScale = scaleLinear().domain(xDomain).range([0, width])
 *   yScale = scaleLinear().domain(yDomain).range([height, 0])
 */
function SpriteOverlay({
  dataset,
  imageColumn,
  scopeRows,
  xDomain,
  yDomain,
  width,
  height,
  transform,
  enabled,
  manifest,
}) {
  const size = manifest?.size || 64;
  const missingSet = manifest?.missing;
  const k = transform?.k || 1;

  const spritePx = useMemo(() => clamp(BASE_SPRITE_PX * (k / ZOOM_THRESHOLD), MIN_SPRITE_PX, MAX_SPRITE_PX), [k]);

  // Spatial grid over the normalized umap space [-1, 1]^2 so viewport culling
  // scans only the cells in view rather than every row. Built once per
  // scopeRows, queried on each pan/zoom — keeps per-interaction work
  // O(visible) instead of O(N) for large scopes.
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

  const visibleSprites = useMemo(() => {
    if (!enabled || !manifest?.generated) return [];
    if (k < ZOOM_THRESHOLD) return [];
    if (!xDomain || !yDomain || !grid.size) return [];

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    // The visible data-domain (domains may run either direction depending on
    // the zoom math, so normalize to lo/hi).
    const xlo = Math.min(xDomain[0], xDomain[1]);
    const xhi = Math.max(xDomain[0], xDomain[1]);
    const ylo = Math.min(yDomain[0], yDomain[1]);
    const yhi = Math.max(yDomain[0], yDomain[1]);
    const cx0 = toCell(xlo);
    const cx1 = toCell(xhi);
    const cy0 = toCell(ylo);
    const cy1 = toCell(yhi);

    const result = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = grid.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (let j = 0; j < bucket.length; j++) {
          const row = bucket[j];
          if (row.x < xlo || row.x > xhi || row.y < ylo || row.y > yhi) continue;
          if (missingSet && missingSet.has(row.ls_index)) continue;
          result.push({
            index: row.ls_index,
            left: xScale(row.x) - spritePx / 2,
            top: yScale(row.y) - spritePx / 2,
          });
          // Over the cap: render none (dots remain), bounding browser memory.
          if (result.length > MAX_SPRITES) return [];
        }
      }
    }
    return result;
  }, [enabled, manifest, k, xDomain, yDomain, grid, width, height, spritePx, missingSet]);

  if (!visibleSprites.length) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {visibleSprites.map((s) => (
        <img
          key={s.index}
          loading="lazy"
          width={spritePx}
          height={spritePx}
          src={spriteUrlFor(dataset.id, imageColumn, s.index, size)}
          alt=""
          // A sprite may 404 (missing/undecodable source image not in the
          // manifest's missing set) — hide it rather than show a broken icon.
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

export default SpriteOverlay;
