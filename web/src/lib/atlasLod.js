// Level-of-detail logic shared by the image map: which atlas resolution (if
// any) to show at the current zoom, and when individual points should take over.
//
// On-screen size of one grid cell = width * k / num_tiles (the [-1,1] box maps
// to `width` px at k=1 and scales with zoom). A finer grid only becomes legible
// once you've zoomed far enough that its cells are still big enough to read.

// A cell must reach this many on-screen px before its resolution is shown.
export const MIN_CELL_PX = 14;

// Once the finest resolution's cells exceed this many on-screen px they're badly
// upscaled (source cells are ~32px), so individual points become more useful —
// this is the "zoom past the deepest grid" handoff.
export const POINTS_HANDOFF_CELL_PX = 40;

/**
 * @param {number} k - current zoom (transform.k)
 * @param {number} width - viewport width in px
 * @param {number[]} resolutions - available grid resolutions (any order)
 * @param {number} [minCellPx]
 * @returns {{resolution: number|null, active: boolean, deepest: boolean}}
 *   resolution: finest grid whose cells are still >= minCellPx (null when too
 *     zoomed out — the heatmap should show instead).
 *   active: resolution != null.
 *   deepest: zoomed in past the finest grid's legibility — points should appear.
 */
export function atlasLod(k, width, resolutions, minCellPx = MIN_CELL_PX) {
  const res = [...(resolutions || [])].sort((a, b) => a - b);
  if (!res.length || !width || !k) {
    return { resolution: null, active: false, deepest: false };
  }
  let resolution = null;
  for (const r of res) {
    if ((width * k) / r >= minCellPx) resolution = r; // ascending -> keep finest that fits
  }
  const finest = res[res.length - 1];
  const deepest = (width * k) / finest >= POINTS_HANDOFF_CELL_PX;
  return { resolution, active: resolution != null, deepest };
}
