import { useMemo, useState, useEffect } from 'react';
import { scaleLinear } from 'd3-scale';
import { atlasSheetUrl } from '../../lib/atlasUrl';

// Minimum on-screen size (px) a single atlas cell must reach before we show
// that resolution. On-screen cell px = width * k / num_tiles, so a finer grid
// (more cells) only kicks in once you've zoomed far enough that its cells are
// still legible. Below the coarsest grid's threshold we render nothing and let
// the dots show — this is what "replace the dots when you zoom in a bit" means.
const MIN_CELL_PX = 14;

/**
 * Renders a representative-image sprite-sheet atlas as a SINGLE <img> stretched
 * across the map's [-1, 1] coordinate box, so it pans/zooms with the scatter for
 * free. The generator bakes in the vertical flip, so the sheet maps directly
 * onto the domain box with no per-cell math here.
 *
 * As you zoom in we swap to a finer resolution (e.g. 64 -> 128); only one sheet
 * <img> is mounted at a time (keyed on resolution) so at most one atlas texture
 * is decoded, bounding browser memory regardless of grid size.
 *
 * Projection matches AnnotationPlot / SpriteOverlay:
 *   xScale = scaleLinear().domain(xDomain).range([0, width])
 *   yScale = scaleLinear().domain(yDomain).range([height, 0])
 */
function AtlasOverlay({
  dataset,
  scopeId,
  imageColumn,
  xDomain,
  yDomain,
  width,
  height,
  transform,
  enabled,
  manifest,
  sheet = 0,
}) {
  const k = transform?.k || 1;

  // Available resolutions, ascending (coarsest first).
  const resolutions = useMemo(() => {
    if (!manifest?.generated) return [];
    return (manifest.resolutions || [])
      .map((r) => r.num_tiles)
      .sort((a, b) => a - b);
  }, [manifest]);

  // Pick the finest resolution whose on-screen cell size is still >= MIN_CELL_PX.
  // None qualifying (zoomed out) -> render nothing.
  const resolution = useMemo(() => {
    if (!enabled || !resolutions.length || !width) return null;
    let chosen = null;
    for (const r of resolutions) {
      if ((width * k) / r >= MIN_CELL_PX) chosen = r; // ascending -> keep finest that fits
    }
    return chosen;
  }, [enabled, resolutions, width, k]);

  // Reset the loaded flag whenever the source sheet changes so we don't flash a
  // stale image during a resolution swap.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [resolution, sheet, scopeId, imageColumn]);

  const box = useMemo(() => {
    if (resolution == null || !xDomain || !yDomain) return null;
    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);
    // Atlas covers the full normalized [-1, 1]^2 space. Image top corresponds
    // to data-y = +1 (the flip is baked into the sheet).
    const left = xScale(-1);
    const right = xScale(1);
    const top = yScale(1);
    const bottom = yScale(-1);
    return { left, top, w: right - left, h: bottom - top };
  }, [resolution, xDomain, yDomain, width, height]);

  if (resolution == null || !box) return null;

  const src = atlasSheetUrl(dataset.id, scopeId, imageColumn, resolution, sheet);

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
      <img
        key={`${resolution}-${sheet}`}
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden';
        }}
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.w,
          height: box.h,
          pointerEvents: 'none',
          // Avoid a flash of the wrong-sized previous sheet mid-swap.
          opacity: loaded ? 1 : 0,
          transition: 'opacity 120ms ease',
        }}
      />
    </div>
  );
}

export default AtlasOverlay;
