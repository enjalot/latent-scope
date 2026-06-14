const apiUrl = import.meta.env.VITE_API_URL;

/**
 * Build the URL for a single pre-generated sprite thumbnail served by the
 * backend (the optional sprite generation step).
 *
 * Sprites are individual sharded WebP files; the one for a given row is
 * fetched from
 * GET /api/datasets/<dataset>/sprite?column=<col>&index=<int>&size=<int>.
 *
 * @param {string} datasetId - dataset id (directory name)
 * @param {string} column - name of the image-typed column
 * @param {number} index - row index into the dataset
 * @param {number} [size=64] - sprite size the step was generated at
 * @returns {string} fully-qualified sprite URL
 */
export function spriteUrlFor(datasetId, column, index, size = 64) {
  const params = new URLSearchParams({ column, index, size });
  return `${apiUrl}/datasets/${encodeURIComponent(datasetId)}/sprite?${params.toString()}`;
}

/**
 * Fetch the sprite generation status for an image column.
 *
 * @param {string} datasetId
 * @param {string} column - image column name
 * @param {number} [size=64]
 * @returns {Promise<{generated: boolean, count?: number, total?: number,
 *   size?: number, missing_count?: number}>}
 */
export async function fetchSpriteStatus(datasetId, column, size = 64) {
  const params = new URLSearchParams({ column, size });
  const url = `${apiUrl}/datasets/${encodeURIComponent(datasetId)}/sprites/status?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    return { generated: false };
  }
  return response.json();
}
