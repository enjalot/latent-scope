const apiUrl = import.meta.env.VITE_API_URL;

/**
 * Build the URL for a binary image cell served by the backend.
 *
 * Binary image columns are excluded from row payloads (/indexed, /query);
 * the image for a given row is fetched from
 * GET /api/datasets/<dataset>/image?column=<col>&index=<int>&size=<int>.
 *
 * @param {string} datasetId - dataset id (directory name)
 * @param {string} column - name of the image-typed column
 * @param {number} index - row index into the dataset
 * @param {number} [size] - optional max dimension; server returns a WebP
 *   thumbnail when set (capped at 1024 server-side)
 * @returns {string} fully-qualified image URL
 */
export function imageUrlFor(datasetId, column, index, size) {
  const params = new URLSearchParams({ column, index });
  if (size != null) {
    params.set('size', size);
  }
  return `${apiUrl}/datasets/${encodeURIComponent(datasetId)}/image?${params.toString()}`;
}
