# Late Interaction Model Support — Implementation Plan

Late interaction models (ColBERT, ColPali, etc.) produce one vector *per token or patch* rather
than a single vector per input row. This document describes how to support them in latent-scope
without breaking the existing single-vector pipeline.

---

## Core Design Decisions

### 1. Embedding as the Lance base; rest of pipeline stays as files

The pipeline branches freely: multiple embeddings per dataset, multiple UMAPs per embedding,
multiple clusters per UMAP. A single Lance table per **scope** (the final merge) already exists;
that stays. The new addition is a Lance table per **embedding** that holds the raw vectors.

```
dataset/
  embeddings/
    embedding-001.h5          ← kept for backward compat (single-vector)
    embedding-001.json         ← metadata (add interaction_type, storage_sizes)
    embedding-001.lance/       ← NEW: Lance table for all embeddings going forward
  umaps/
    umap-001.parquet           ← unchanged (row-level x,y)
    umap-001.pkl               ← unchanged (saved UMAP model)
    umap-001.json              ← unchanged
  clusters/                    ← unchanged
  scopes/
    scopes-001.lance/          ← unchanged (final merged, ANN-indexed table)
```

**For single-vector models:** Lance table has `row_id + vector`. The .h5 file is still written
for backward compat with existing UMAP/cluster code until those scripts are updated.

**For late-interaction models:** Lance table has `row_id + token_vectors + mean_vector`.
No .h5 is needed — `mean_vector` replaces it for all downstream steps.

### 2. Mean pool is the bridge to the existing pipeline

Every late-interaction embedding run computes and stores a mean-pool of the token vectors.
This single vector per row is what UMAP, clustering, and the scope ANN index use — the
existing pipeline is completely unchanged.

The per-token vectors are a parallel layer used only for:
- Late-interaction (MaxSim) search
- Token-level UMAP exploration (optional, separate step)

### 3. LanceDB multi-vector is used natively — no custom MaxSim

LanceDB ≥ 0.20 supports `list<list<float32>>` columns with built-in MaxSim late interaction.
The search API is identical: `tbl.search(query_tokens).metric("cosine")`.
No custom Python reranking loop is needed.

---

## Storage Schema

### Single-vector embedding (current + going forward)
```
embedding-001 lance:
  row_id    int64
  vector    fixed_size_list<float32>[D]
```

### Late-interaction embedding
```
embedding-001 lance:
  row_id        int64
  token_vectors list<fixed_size_list<float32>[D]>   ← MaxSim search target
  mean_vector   fixed_size_list<float32>[D]          ← UMAP / ANN fallback
```

### Scope lance table (late-interaction)
```
scopes-001 lance:
  ...all existing columns...
  vector        list<fixed_size_list<float32>[D]>    ← renamed from mean, now multi-vec
  mean_vector   fixed_size_list<float32>[D]          ← kept for ANN index fallback
```

---

## Size Estimation (pre-flight)

Before embed runs, estimate output sizes and show them in the UI:

```
N  = row count from input.parquet  (known)
D  = model output dimension        (from embedding_models.json)
T  = avg tokens per row            (sample 50 rows, tokenize, take mean)
                                   or use max_seq_length as upper bound

Single-vector:
  embeddings (float32) = N × D × 4 bytes
  embeddings (float16) = N × D × 2 bytes

Late-interaction:
  token vectors (float32) = N × T_avg × D × 4 bytes
  token vectors (float16) = N × T_avg × D × 2 bytes
  mean vectors             = N × D × 4 bytes  (always float32)
```

Show both uncompressed and estimated Lance-compressed sizes.
Lance's built-in compression typically yields 1.3–1.8× on float32 embeddings.

---

## Detection of Late-Interaction Models

### From HuggingFace (🤗- prefix models)

Detection happens in `TransformersEmbedProvider.load_model()` after the model loads.
Two complementary checks:

**Check 1 — sentence-transformers Pooling module:**
```python
from sentence_transformers.models import Pooling
has_pooling = any(isinstance(m, Pooling) for m in self.model.modules())
# ColBERT/ColPali: no Pooling module → late interaction
```

**Check 2 — probe output shape:**
```python
sample = self.model.encode(["test"], convert_to_tensor=False)
# sample[0] is (D,) for single-vector, (T, D) for late-interaction
is_late = hasattr(sample[0][0], '__len__')
```

Probe wins in ambiguous cases. Result stored as `self.interaction_type = "late" | "single"`.

### From embedding_models.json (known models)
Add explicit field to catalog entries:
```json
{
  "id": "transformers-colbert-ir___colbertv2.0",
  "interaction_type": "late",
  "dimensions": 128,
  "max_seq_length": 128,
  "providers": ["transformers"]
}
```

### From custom models
User specifies `"interaction_type": "late"` in their custom model config JSON.

### Fallback
If detection fails or is ambiguous, default to `"single"` and warn.

---

## Files to Change

### `requirements.txt`
- `lancedb~=0.19.0` → `lancedb~=0.30.0`

### `latentscope/models/embedding_models.json`
- Add `interaction_type` field to all existing entries (default `"single"`)
- Add ColBERT and ColPali model entries with `"interaction_type": "late"`

### `latentscope/models/providers/transformers.py`
- `TransformersEmbedProvider.load_model()`: run detection, set `self.interaction_type`
- `TransformersEmbedProvider.embed()`: for late interaction, return `list[np.ndarray]`
  where each element is shape `(T_i, D)` — ragged is fine
- `TransformersEmbedProvider.embed_mean()`: new helper, returns `(B, D)` mean pool
  for a batch (used by embed.py to write mean_vector column)

### `latentscope/scripts/embed.py`

**New functions:**
- `estimate_embed_cost(dataset_id, text_column, model_id, sample_n=50)` → dict with
  `{rows, dimensions, avg_tokens, token_bytes_f32, token_bytes_f16, mean_bytes}`
- `write_lance_embedding(dataset_path, embedding_id, row_id, vector_or_tokens, mean_vector=None)`
  — appends to the embedding Lance table

**Modified `embed()` function:**
- After model.load_model(), check `model.interaction_type`
- For `"single"`: write .h5 as today + write Lance table with `vector` column
- For `"late"`: write Lance table with `token_vectors` + `mean_vector` columns;
  also write .h5 with mean_vectors for backward compat with umapper
- Log actual compressed sizes to metadata JSON after write

**Updated `embedding-XXX.json` metadata:**
```json
{
  "id": "embedding-001",
  "model_id": "...",
  "interaction_type": "late",
  "dimensions": 128,
  "avg_tokens_per_row": 47.3,
  "total_tokens": 4730000,
  "storage": {
    "lance_bytes": 1247832064,
    "h5_mean_bytes": 51200000
  }
}
```

### `latentscope/scripts/umapper.py`
- Detect `interaction_type` from embedding metadata JSON
- For `"late"`: read `mean_vector` from Lance table instead of `embeddings` from .h5
  (`tbl.to_lance().to_batches(columns=["mean_vector"])`)
- For `"single"`: read from .h5 as today (no change)
- UMAP output (row-level x,y parquet) is identical in both cases

### `latentscope/scripts/scope.py` — `export_lance()`
- For `"late"` embeddings: read `token_vectors` from embedding Lance table;
  write as the `vector` column of the scope Lance table (LanceDB multi-vector)
- Also write `mean_vector` column for ANN fallback
- ANN index is created on `mean_vector` (single-vector, fast);
  multi-vector `vector` column uses LanceDB's native multi-vector indexing

### `latentscope/server/search.py`
- For `"late"` scopes: encode query with the original model to get token vectors;
  pass token vector array to `tbl.search()` — LanceDB handles MaxSim automatically
- API response shape is unchanged (`indices`, `distances`, `search_embedding`)
- `search_embedding` in response becomes the mean of query tokens (for display)

### `latentscope/server/app.py` (row detail endpoint)
- When fetching a row that has `token_vectors`, optionally return them
  (controlled by query param `?include_tokens=true`)
- This powers the token-level exploration UI

---

## Frontend Changes

### Embed step (`web/src/components/Setup/Embed.jsx` or similar)

**Pre-flight cost panel** — shown before embed starts:
```
Model: colbert-ir/colbertv2.0  [late interaction]
Rows: 100,000
Est. avg tokens/row: ~47
─────────────────────────────────────────────
Token vectors (float32):  ~2.4 GB
Token vectors (float16):  ~1.2 GB  ← recommended
Mean vectors:             ~51 MB
─────────────────────────────────────────────
[float16]  [float32]   ← precision selector
```

**Interaction type badge** on each embedding card in the UI.

### UMAP step
No UI changes required — UMAP uses mean_vectors transparently.
Optionally: show a note "using mean-pool of token vectors" when embedding is late-interaction.

### Search / exploration
**Token detail view** — when clicking a data point that came from a late-interaction embedding,
show a mini scatter of its token projections (using the saved UMAP model's transform output
computed on demand or pre-computed in the experiments step).

This is optional / phase 2. Core search works immediately via MaxSim with no UI changes.

---

## Tests and Fixtures

### Test fixtures
```
tests/fixtures/
  tiny_late_interaction/
    input.parquet              ← 20 rows, "text" column
  mock_colbert_output.py       ← generates (T, D) numpy arrays deterministically
```

A mock provider is better than loading a real model in tests:
```python
class MockLateInteractionProvider:
    interaction_type = "late"
    def embed(self, texts, **kwargs):
        # returns list of (T_i, D) arrays, T_i varies by text length
        return [np.random.randn(max(3, len(t.split())), 16).astype(np.float32)
                for t in texts]
    def embed_mean(self, texts, **kwargs):
        return np.stack([v.mean(0) for v in self.embed(texts)])
```

### Test cases

**`tests/test_embed_late_interaction.py`**
- `test_detection_from_pooling_module()` — mock ST model with/without Pooling module
- `test_detection_from_output_shape()` — mock provider returning (T, D) vs (D,)
- `test_embed_writes_lance_schema()` — embed with mock provider, check Lance table columns
- `test_embed_writes_mean_h5()` — late interaction embed writes valid .h5 mean vectors
- `test_cost_estimation()` — `estimate_embed_cost()` returns plausible numbers
- `test_metadata_json_fields()` — check `interaction_type`, `avg_tokens_per_row`, `storage` keys

**`tests/test_umapper_late_interaction.py`**
- `test_umap_reads_mean_from_lance()` — umapper reads mean_vector column, produces (N, 2) output

**`tests/test_search_late_interaction.py`**
- `test_maxsim_search_via_lance()` — scope with multi-vector column, search returns indices

**`tests/test_scope_late_interaction.py`**
- `test_export_lance_multivector_schema()` — check `vector` column is `list<list<float32>>`

---

## Suggested Implementation Order

```
Phase 1 — Functional late-interaction end-to-end (no UI changes)
  1. requirements.txt: bump lancedb to 0.30.0
  2. embedding_models.json: add interaction_type field + ColBERT entries
  3. transformers.py: detection + late-interaction embed() return shape
  4. embed.py: write Lance table for late interaction; .h5 mean for compat
  5. scope.py: export multi-vector Lance table
  6. search.py: pass token query to Lance for MaxSim
  7. Tests: fixtures + embed/search tests

Phase 2 — UMAP reads from Lance
  8. umapper.py: read mean_vector from Lance (removes h5 dependency for late interaction)
  9. Tests: umapper tests

Phase 3 — Cost estimation + UI
  10. embed.py: estimate_embed_cost()
  11. API endpoint for cost estimation
  12. Frontend: pre-flight cost panel, interaction type badge

Phase 4 — Token exploration
  13. app.py: token_vectors in row detail response
  14. Frontend: token mini-scatter in detail panel
```

---

## Experiment: Token Projection via Saved UMAP

See `experiments/umap_token_projection.py`.

**Quick simulation run** (no model needed):
```bash
python experiments/umap_token_projection.py mydata embedding-001 umap-001 \
    --simulate --n_tokens 8 --noise_scale 0.05
```

**Real ColBERT run** (requires pylate or sentence-transformers):
```bash
pip install pylate
python experiments/umap_token_projection.py mydata embedding-001 umap-001 \
    --model colbert-ir/colbertv2.0 --max_rows 1000
```

Output: `data/mydata/experiments/token_projection_embedding-001_umap-001.parquet`
with columns `[row_id, token_idx, x, y, mean_x, mean_y, spread]` — directly overlayable
on the existing UMAP scatter.

The key question this experiment answers: **how spread out are token projections relative to
the full UMAP coordinate space?** If `relative_spread < 0.05`, tokens form tight clouds that
are useful for per-document token exploration. If spread is larger, token projections may
overlap across documents and are better used for corpus-level token topology analysis.
