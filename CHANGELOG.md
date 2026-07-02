# Changelog

All notable changes to Latent Scope are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses semantic-ish
versioning.

## [1.0.0] — 2026-07

The 1.0 release. Consolidates a year of work since `v0.6.0` (Feb 2025) — images,
ColBERT, LanceDB, and a modernized foundation — and adds GPU acceleration, more
clustering algorithms, named experiments, and data-driven map coloring. See
[`PATH_TO_1.0.md`](PATH_TO_1.0.md) for the roadmap and
[`MIGRATIONS.md`](MIGRATIONS.md) for upgrade notes.

### Added
- **Image datasets end to end.** Auto-detect image columns (HF `{bytes,path}`
  dicts, raw bytes, or URLs), embed them, and render an **image map**: a
  continuous level-of-detail from heatmap → tiled representative-image sprite
  atlas → individual points (`ls-sprite-atlas`). (#87, #24)
- **ColBERT late-interaction (multi-vector) embeddings** via `pylate` — per-token
  vectors stored fp16, searched with MaxSim. See
  `examples/colbert_quickstart/`. (#64)
- **GPU acceleration** (#63): cuML-accelerated `ls-umap` (UMAP),
  `ls-cluster --method hdbscan` (HDBSCAN), and `--method kmeans` (KMeans) when an
  NVIDIA GPU + RAPIDS are present. Controlled by `LATENT_SCOPE_DEVICE`
  (`cpu`|`cuda`|`auto`, default `auto`) with a guarded import and graceful CPU
  fallback. Optional install: `pip install "latentscope[gpu]"`. See
  `docs/gpu-acceleration.md`.
- **More clustering algorithms** (#41): `ls-cluster --method {evoc,hdbscan,kmeans,gmm}`
  plus `--cluster_on {umap,embedding}` to choose the 2D-projection vs high-dim
  input space. See `docs/clustering.md`.
- **Named experiments + gallery.** `ls-umap` / `ls-cluster` accept
  `--name` / `--description` (stored in the step metadata, editable inline); the
  Setup UI shows a browsable thumbnail gallery of a dataset's umaps/clusterings
  instead of a bare id list.
- **Color by any column** (#131): color the Explore *and* Compare maps by any
  numeric (continuous ramp) or categorical column, with a legend. New
  `GET /api/datasets/<ds>/column/<col>` endpoint.
- **Compare improvements**: shared **lasso/brush selection** across panes (#132),
  side-by-side + transition views, linked zoom, shared hover, drift metrics, and
  a cluster-comparison view. (#27, #61, #111, #114)
- **Cluster evaluation metrics** (silhouette / Calinski-Harabasz / Davies-Bouldin)
  surfaced per clustering. (#112)
- **Token counting** when embedding — per-doc total/mean/min/max in the metadata
  and Setup UI. (#77)
- Custom **OpenAI-compatible embedding endpoints** and additional models. (#44, #98, #108)
- **Mobile explore** with pan-to-query. (#106)
- **Publish/download scopes via Hugging Face** (`ls-upload-dataset` /
  `ls-download-dataset`). (#78)
- Data-importing guide, GPU/clustering/exploring docs. (#60, #33)
- First **automated tests** (pytest + vitest) and **CI** (GitHub Actions). (#116)

### Changed
- **Vector storage moved from HDF5 to LanceDB** (per-dataset table; late-interaction
  models add fp16 per-token vectors). Old HDF5 embeddings migrate on first load.
- **`ls-serve` now ships a production WSGI server** (`waitress`) as a core
  dependency, instead of falling back to the Flask development server.
- **Packaging modernized**: `setup.py` → `uv` + `pyproject.toml`; dependency
  versions pinned with the test suite as the gate. (#105, #110)
- **Job runner hardened**: list-based commands (never `shell=True`) to remove a
  command-injection vector. (#101)
- Memory/storage efficiency pass; frontend lint-to-zero, fetch-layer cleanup,
  race guards, and code-splitting. (#100, #121, #122)

### Fixed
- Null / NaN values in the embedding column no longer crash a run (`pd.isna`
  coercion). (#94)
- Point Size / Point Opacity sliders now reach the GPU scatter layer. (#95)
- Emoji in Hugging Face model names handled. (#97)
- Nearest-neighbor search across multiple datasets. (#50, #69)
- Windows path fixes. (#53)
- Color-by change now repaints the Explore scatter immediately (missing REGL
  redraw dependency).
- `examples/colbert_quickstart/run.sh` runs for pip-installed users, not only a
  dev checkout.

### Dependencies
- Added optional `gpu` extra (`cuml-cu12` / `cuvs-cu12`), pinned to a
  CUDA-12.8-validated RAPIDS `25.2.*` (newer RAPIDS needs CUDA ≥12.9). GPU torch
  must come from the cu128 index — see `docs/gpu-acceleration.md`.

## [0.6.0] — 2025-02
- Prior release. See git history before `v0.6.0`.
