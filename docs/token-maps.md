# Token maps (late-interaction token granularity)

ColBERT-style late-interaction embeddings store one vector **per token**, not
one per document (see [data-importing.md](data-importing.md) for embedding
with a `colbert-*` model). Normally Latent Scope mean-pools those vectors and
maps one point per document. A **token map** instead projects *every token*
as its own point, while every point stays linked to its parent document — so
the map shows what individual tokens are doing, and the table still shows
readable documents with the selected token highlighted in context.

Token maps pair naturally with **token-level sparse autoencoders**: an SAE
trained on the same model's token embeddings labels each token point with
interpretable features, and feature search lights up every token in the
corpus where a feature fires.

## Pipeline

Starting from a late-interaction embedding (here `embedding-001`):

```bash
# 1. Token metadata: re-tokenizes the text column and validates the token
#    strings + char offsets align 1:1 with the stored token vectors.
ls-tokenize mydata embedding-001

# 2. Token UMAP: one 2D point per token. Fits on up to --fit_sample tokens
#    (default 1M, uniformly sampled), then batch-transforms the rest.
ls-umap mydata embedding-001 25 0.1 --granularity tokens

# 3. Cluster the token map. Default labels are the cluster's most frequent
#    token strings (no LLM needed). Token umaps must cluster on the 2D map
#    (hdbscan/kmeans/gmm), not on the row-level embedding matrix.
ls-cluster mydata umap-001 5 3 0.0 --method hdbscan

# 4. (Optional) token-level SAE features. --checkpoint loads a local
#    directory containing cfg.json + sae.safetensors; without it the
#    model_id is fetched from the HF hub.
ls-sae mydata embedding-001 my-sae-model 64_32 --granularity tokens \
       --checkpoint /path/to/checkpoint_dir

# 5. Scope. Granularity is inherited from the umap; all components must
#    agree (a token umap requires a token cluster, and a token SAE if given).
ls-scope mydata embedding-001 umap-001 cluster-001 default "Token map" \
         "one point per token" --sae_id sae-001
```

`ls-serve` and the Explore UI detect `granularity: "tokens"` in the scope:
hovering shows the token itself, selecting a point shows the parent document
in the table with the token highlighted in its context window, and (with an
SAE) per-token features drive the feature modal, filter, and map coloring.

## How alignment works

pylate encodes documents as `[CLS] [DocumentMarker] …subwords… [SEP]`,
truncated to the model's `document_length`, then **drops punctuation tokens**
(a 32-symbol skiplist) — the dropped positions get no output vector.
`ls-tokenize` replays that pipeline with `return_offsets_mapping` and writes
one metadata row per *kept* token: parent row index, position, token string,
and the character span in the original text. It refuses to write anything if
any document's re-tokenized count disagrees with the stored `num_tokens` —
that indicates the model/tokenizer/pylate version changed since embedding.

Char spans refer to the raw text column value. Tokens with no surface form
(CLS, the marker, SEP — and any tokens inside a `--prefix` you embedded
with) have span `-1..-1`.

## Data contracts

- `tok-<embedding_id>` LanceDB table: `token_index` (global, cumulative in
  ls_index order — the same order token vectors are stored and streamed),
  `ls_index` (parent doc), `token_pos`, `token_str`, `char_start`, `char_end`.
- Token umap/cluster parquets: one row per token, positionally aligned with
  `token_index`; meta JSONs carry `granularity: "tokens"`.
- Token scope parquet: `ls_index` **is the token index** (still equal to the
  row position, preserving the frontend invariant), with `parent_index`,
  `token_pos`, `token_str` columns. The `-input.parquet` holds the scope
  columns + char spans; document text is *not* duplicated per token.
- Token SAE h5: `top_acts` / `top_indices` shaped `[n_tokens, k]`, rows in
  `token_index` order.
- `POST /api/tokens/indexed {dataset, embedding_id, indices, sae_id?}`
  resolves token indices to parent-document rows + token metadata (and
  token-level `sae_acts`/`sae_indices`).

## Scale notes

- Token counts are ~100–300× row counts. The pipeline streams token vectors
  in bounded batches everywhere (nothing materializes the full token set
  except the 2D output), and the UMAP fit is capped by `--fit_sample`.
- With [GPU acceleration](gpu-acceleration.md) (cuML), fitting + transforming
  ~1M tokens takes minutes; CPU umap-learn works but is markedly slower —
  reduce `--fit_sample` if needed.
- The Explore scatterplot is comfortable around 1M points. Beyond that
  (10M+), rendering LOD work is still on the roadmap — start with a corpus
  in the low millions of tokens.

## Current limitations

- Nearest-neighbor text search returns *document* indices and is disabled in
  token scopes (mapping MaxSim's per-token matches onto the token map is
  planned follow-up); cluster, feature, and lasso-free point selection work.
- Scoped (per-scope LanceDB) vector search is skipped for token scopes.
- LLM cluster labeling (`ls-label`) is document-oriented; token clusters use
  the token-frequency default labels for now.
- Token SAEs require a `latentsae` version with BatchTopK + `load_from_disk`
  support for modern checkpoints.
