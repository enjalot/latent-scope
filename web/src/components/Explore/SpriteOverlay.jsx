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

  const visibleSprites = useMemo(() => {
    if (!enabled || !manifest?.generated) return [];
    if (k < ZOOM_THRESHOLD) return [];
    if (!xDomain || !yDomain || !scopeRows?.length) return [];

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const result = [];
    for (let i = 0; i < scopeRows.length; i++) {
      const row = scopeRows[i];
      if (!row || row.deleted) continue;
      // xDomain/yDomain ARE the visible data-domain: cull to it.
      if (row.x < xDomain[0] || row.x > xDomain[1]) continue;
      if (row.y < yDomain[0] || row.y > yDomain[1]) continue;
      const index = row.ls_index;
      if (missingSet && missingSet.has(index)) continue;
      result.push({
        index,
        left: xScale(row.x) - spritePx / 2,
        top: yScale(row.y) - spritePx / 2,
      });
      // Over the cap: bail out and render none (dots remain), bounding memory.
      if (result.length > MAX_SPRITES) return [];
    }
    return result;
  }, [enabled, manifest, k, xDomain, yDomain, scopeRows, width, height, spritePx, missingSet]);

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
