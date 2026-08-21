// Pretrained basemap (parametric UMAP) projector helpers.
//
// Unlike SAE.js the registry is not hardcoded here: the server exposes
// /models/basemap_models (from latentscope/models/basemap_models.json),
// including whether each model's checkpoint is present on the machine.
// These helpers match registry entries to an embedding's model id.

// Strip the provider prefix and restore "/" so ids from any era compare equal:
// "🤗-sentence-transformers___all-MiniLM-L6-v2" -> "sentence-transformers/all-MiniLM-L6-v2"
export const normalizeModelId = (id) =>
  (id || '').replace(/^(huggingface-|🤗-|transformers-|custom_embedding-)/, '').replace(/___/g, '/');

// Filter the fetched basemap registry down to models compatible with an
// embedding model id (and whose checkpoints exist on this machine).
export function getBasemapsForModel(basemapModels, embeddingModelId) {
  const norm = normalizeModelId(embeddingModelId);
  return (basemapModels || []).filter(
    (m) => m.available && normalizeModelId(m.embedding_model) === norm
  );
}
