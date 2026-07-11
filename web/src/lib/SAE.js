export const saeAvailable = {
  "🤗-nomic-ai___nomic-embed-text-v1.5": {
    "label": "NOMIC_FWEDU_25k",
    "embedding_model_id": "🤗-nomic-ai___nomic-embed-text-v1.5",
    "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    "k_expansion": "64_32",
    "url": "https://enjalot.github.io/latent-taxonomy/models/NOMIC_FWEDU_25k/features.parquet?cachebust=1"
  },
  // "🤗-sentence-transformers___all-MiniLM-L6-v2": {
  // }
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

// Label parquets keyed by the SAE's own model repo (not the embedding model).
// Used for SAEs a scope declares directly (e.g. token-granularity SAEs run
// with ls-sae --checkpoint): the labels live on the latent-taxonomy site.
export const saeLabels = {
  'enjalot/sae-jina-colbert-v2-tokens-64K': {
    label: 'COLBERT_JINA_64K',
    url: 'https://enjalot.github.io/latent-taxonomy/models/COLBERT_JINA_64K/features.parquet?cachebust=1',
  },
  'enjalot/sae-all-MiniLM-L6-v2-stagej-49K': {
    label: 'MINILM_STAGEJ_49K',
    url: 'https://enjalot.github.io/latent-taxonomy/models/MINILM_STAGEJ_49K/features.parquet?cachebust=1',
  },
};

export function getLabelsForSaeModel(saeModelId) {
  return saeLabels[saeModelId] || null;
}
