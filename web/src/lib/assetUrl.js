import { apiUrl } from './apiService';

/** Build a URL for a dataset-relative file served by Latent Scope. */
export function assetUrlFor(datasetId, relativePath) {
  if (!datasetId || !relativePath) return null;
  const segments = String(relativePath).split('/');
  if (
    String(relativePath).startsWith('/') ||
    String(relativePath).includes('\\') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  const encodedPath = segments.map(encodeURIComponent).join('/');
  return `${apiUrl}/files/${encodeURIComponent(datasetId)}/${encodedPath}`;
}
