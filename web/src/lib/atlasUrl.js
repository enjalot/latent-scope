const apiUrl = import.meta.env.VITE_API_URL;

function scopeBase(datasetId, scopeId) {
  return (
    `${apiUrl}/datasets/${encodeURIComponent(datasetId)}` +
    `/scopes/${encodeURIComponent(scopeId)}`
  );
}

/**
 * URL for a single atlas tile (tile (tx,ty) of a resolution's pyramid).
 *
 * GET /api/datasets/<ds>/scopes/<scope>/atlas/sheet?column=&res=&tx=&ty=&sheet=
 */
export function atlasTileUrl(datasetId, scopeId, column, res, tx, ty, sheet = 0) {
  const params = new URLSearchParams({ column, res, tx, ty, sheet });
  return `${scopeBase(datasetId, scopeId)}/atlas/sheet?${params.toString()}`;
}

/**
 * Fetch the atlas manifest/status for a scope + image column. The resolutions
 * each carry their populated tiles + tiles_per_axis.
 */
export async function fetchAtlasStatus(datasetId, scopeId, column) {
  const params = new URLSearchParams({ column });
  const res = await fetch(`${scopeBase(datasetId, scopeId)}/atlas/status?${params.toString()}`);
  if (!res.ok) return { generated: false };
  return res.json();
}

/**
 * Plan an atlas without generating it: per-resolution populated cell/tile counts
 * + a density grid for the heatmap.
 *
 * @param {number[]} resolutions
 */
export async function fetchAtlasPlan(datasetId, scopeId, column, resolutions, cellSize = 32) {
  const params = new URLSearchParams({
    column,
    resolutions: resolutions.join(','),
    cell_size: cellSize,
  });
  const res = await fetch(`${scopeBase(datasetId, scopeId)}/atlas/plan?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}
