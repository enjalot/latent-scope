// Level-of-detail logic shared by the image map: which atlas resolution (if
// any) to show at the current zoom, and when individual points should take over.
//
// On-screen size of one grid cell = width * k / num_tiles (the [-1,1] box maps
// to `width` px at k=1 and scales with zoom). A finer grid only becomes legible
// once you've zoomed far enough that its cells are still big enough to read.

// A cell must reach this many on-screen px before its (finer) resolution kicks
// in. Source cells are `cell_size` (default 32px), so a level switches to the
// next finer one when the current cells reach ~2x this — keep this near or below
// the source size to switch before cells upscale (sharp); raise it to let each
// level's images grow bigger before switching (softer, but larger images).
export const MIN_CELL_PX = 16;

// How big the finest resolution's cells may grow on screen before individual
// points take over. Raise it to zoom farther into the finest images before the
// points appear (they grow blurrier the further past the source size you go).
export const POINTS_HANDOFF_CELL_PX = 80;

/**
 * @param {number} k - current zoom (transform.k)
 * @param {number} width - viewport width in px
 * @param {number[]} resolutions - available grid resolutions (any order)
 * @param {number} [minCellPx] - on-screen px at which a level becomes active
 * @param {number} [pointsHandoffPx] - finest-cell px at which points take over
 * @returns {{resolution: number|null, active: boolean, deepest: boolean}}
 *   resolution: finest grid whose cells are still >= minCellPx (null when too
 *     zoomed out — the heatmap should show instead).
 *   active: resolution != null.
 *   deepest: zoomed in past the finest grid's handoff — points should appear.
 */
export function atlasLod(
  k,
  width,
  resolutions,
  minCellPx = MIN_CELL_PX,
  pointsHandoffPx = POINTS_HANDOFF_CELL_PX
) {
  const res = [...(resolutions || [])].sort((a, b) => a - b);
  if (!res.length || !width || !k) {
    return { resolution: null, active: false, deepest: false };
  }
  let resolution = null;
  for (const r of res) {
    if ((width * k) / r >= minCellPx) resolution = r; // ascending -> keep finest that fits
  }
  const finest = res[res.length - 1];
  const deepest = (width * k) / finest >= pointsHandoffPx;
  return { resolution, active: resolution != null, deepest };
}
