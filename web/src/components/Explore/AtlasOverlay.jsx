import { useMemo, useState, useEffect } from 'react';
import { scaleLinear } from 'd3-scale';
import { atlasSheetUrl } from '../../lib/atlasUrl';
import { atlasLod } from '../../lib/atlasLod';

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
 * Projection matches AnnotationPlot / PointsOverlay:
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

  // Available resolutions.
  const resolutions = useMemo(() => {
    if (!manifest?.generated) return [];
    return (manifest.resolutions || []).map((r) => r.num_tiles);
  }, [manifest]);

  // Finest resolution legible at this zoom; null (zoomed out) -> render nothing
  // (the heatmap shows instead).
  const resolution = useMemo(() => {
    if (!enabled) return null;
    return atlasLod(k, width, resolutions).resolution;
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
