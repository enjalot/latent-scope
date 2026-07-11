export const saeAvailable = {
  "🤗-nomic-ai___nomic-embed-text-v1.5": {
    "label": "NOMIC_FWEDU_25k",
    "embedding_model_id": "🤗-nomic-ai___nomic-embed-text-v1.5",
    "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    "k_expansion": "64_32",
    "url": "https://enjalot.github.io/latent-taxonomy/models/NOMIC_FWEDU_25k/features.parquet?cachebust=1"
  },
  // Matryoshka SAE (nested 512/2048/8192/49152, k=64) over all-MiniLM-L6-v2.
  // Requires latentsae >= 0.2.0 for Matryoshka inference. The label parquet is
  // served by the latent-taxonomy site (same pattern as nomic above).
  "🤗-sentence-transformers___all-MiniLM-L6-v2": {
    "label": "MINILM_STAGEJ_49K",
    "embedding_model_id": "🤗-sentence-transformers___all-MiniLM-L6-v2",
    "model_id": "enjalot/sae-all-MiniLM-L6-v2-stagej-49K",
    "k_expansion": "64_128",
    "url": "https://enjalot.github.io/latent-taxonomy/models/MINILM_STAGEJ_49K/features.parquet?cachebust=1"
  }
}

// Strip the provider prefix from an embedding model id so lookups are
// prefix-agnostic: the canonical "huggingface-" and the legacy "🤗-" /
// "transformers-" ids all resolve to the same HF model name.
const stripHFPrefix = (id) => (id || '').replace(/^(huggingface-|🤗-|transformers-)/, '');

// Look up the pretrained SAE for an embedding model id, tolerant of which HF
// prefix the id carries (the SAE map is keyed by the legacy emoji id).
export function getSaeForModel(modelId) {
  const norm = stripHFPrefix(modelId);
  for (const [key, sae] of Object.entries(saeAvailable)) {
    if (stripHFPrefix(key) === norm) return sae;
  }
  return null;
}
