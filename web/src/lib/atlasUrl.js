const apiUrl = import.meta.env.VITE_API_URL;

/**
 * Build the URL for a single atlas sheet — one WebP image covering the whole
 * heatmap grid at a given resolution, with a representative image painted into
 * each cell. Served by the optional sprite-atlas step.
 *
 * GET /api/datasets/<dataset>/scopes/<scope>/atlas/sheet?column=&res=&sheet=
 *
 * @param {string} datasetId
 * @param {string} scopeId
 * @param {string} column - image-typed column name
 * @param {number} res - grid resolution (e.g. 64 or 128)
 * @param {number} [sheet=0] - sample sheet index
 * @returns {string} fully-qualified sheet URL
 */
export function atlasSheetUrl(datasetId, scopeId, column, res, sheet = 0) {
  const params = new URLSearchParams({ column, res, sheet });
  return (
    `${apiUrl}/datasets/${encodeURIComponent(datasetId)}` +
    `/scopes/${encodeURIComponent(scopeId)}/atlas/sheet?${params.toString()}`
  );
}

/**
 * Fetch the atlas manifest/status for a scope + image column.
 *
 * @param {string} datasetId
 * @param {string} scopeId
 * @param {string} column
 * @returns {Promise<{generated: boolean, cell_size?: number, samples?: number,
 *   domain?: [number, number],
 *   resolutions?: Array<{num_tiles: number, atlas_px: number,
 *     filled_cells: number, sheets: string[]}>}>}
 */
export async function fetchAtlasStatus(datasetId, scopeId, column) {
  const params = new URLSearchParams({ column });
  const url =
    `${apiUrl}/datasets/${encodeURIComponent(datasetId)}` +
    `/scopes/${encodeURIComponent(scopeId)}/atlas/status?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    return { generated: false };
  }
  return response.json();
}
