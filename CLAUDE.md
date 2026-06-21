# CLAUDE.md — Latent Scope

Guidance for AI agents (Claude Code and others) working on this codebase. If you
are an agent asked to "run the pipeline" or "show me the results", jump to
[Agent quickstart](#agent-quickstart-run-it-for-the-user).

---

## What Latent Scope does

Latent Scope is a Python + React tool for embedding, projecting, clustering,
labeling, and exploring datasets through the lens of their latent space. The
backend is a Flask server; the frontend is a React/Vite SPA. Pipeline steps run
as CLI subprocesses (`ls-embed`, `ls-umap`, …) that can be driven from the web
UI or scripted directly.

```
ingest → embed → umap → cluster → label → scope → (sprite atlas) → explore
```

### Capabilities (what an agent can offer a user)

- **Text and image datasets.** Ingest CSV/Parquet/JSON/JSONL/XLSX or a pandas
  DataFrame. Image columns (HF `{bytes,path}` dicts, raw bytes, or URLs) are
  auto-detected and embeddable (issue #87).
- **Dense embeddings** from many providers (sentence-transformers/HF,
  OpenAI, Cohere, Voyage, Mistral, Together, and any OpenAI-compatible endpoint).
- **ColBERT late-interaction (multi-vector) embeddings** via `pylate` — per-token
  vectors stored fp16, searched with MaxSim (issue #64). See
  `examples/colbert_quickstart/`.
- **LanceDB vector storage** (replaced HDF5). Embeddings live in a per-dataset
  LanceDB table; old HDF5 embeddings are migrated on demand.
- **UMAP projection + HDBSCAN/EVoC clustering**, with LLM cluster labeling.
- **Explore UI**: GPU scatterplot with hover/select, density heatmap, cluster
  outlines, similarity + late-interaction search, filtering, tagging.
- **Image map (sprite atlas)**: for image datasets the map is a continuous
  level-of-detail — heatmap when zoomed out, a tiled representative-image
  pyramid as you zoom in, then individual points on top for hovering. Built by
  the optional post-scope `ls-sprite-atlas` step (issue #24).

---

## Agent quickstart: run it for the user

The data directory is set by the `LATENT_SCOPE_DATA` environment variable. On a
dev checkout, use `uv run` (it resolves `.venv` automatically).

**Run the full pipeline on a CSV (text):**
```bash
export LATENT_SCOPE_DATA=~/latent-scope-data        # or wherever data should live
uv run ls-ingest mydata --path /path/to/data.csv --text_column text
uv run ls-embed   mydata text transformers-BAAI___bge-small-en-v1.5
uv run ls-umap    mydata embedding-001 25 0.1
uv run ls-cluster mydata umap-001 5 3 0.0 --method hdbscan
uv run ls-scope   mydata embedding-001 umap-001 cluster-001 default "My scope" "description"
```
`cluster` auto-writes a `…-labels-default` parquet, so `ls-scope … default …`
works **without** an LLM. For nicer labels run `ls-label` with a chat model first
and pass that labels id instead of `default`.

**Show the user the results (single command, recommended):**
```bash
uv run ls-serve $LATENT_SCOPE_DATA            # serves API + built web UI at http://localhost:5001
```
Open `http://localhost:5001`, pick the dataset, open the scope. This serves the
**pre-built** web assets — no Node required. Use this when the user just wants to
look at results.

**Live frontend dev (two processes, only when changing React):**
```bash
uv run ls-serve $LATENT_SCOPE_DATA            # API on :5001
cd web && npm install && npm run dev          # Vite dev server on :5173 -> proxies to :5001
```

**End-to-end example to copy from:** `examples/colbert_quickstart/run.sh` builds
a tiny topical dataset, embeds it with a small ColBERT model on CPU, runs the
whole pipeline, and verifies late-interaction search. Run it with
`bash examples/colbert_quickstart/run.sh`.

> CPU-only / shared-GPU machines: prefix commands with `CUDA_VISIBLE_DEVICES=`
> to force CPU. Small HF models (e.g. `bge-small-en-v1.5`,
> `answerai-colbert-small-v1`) embed fine on CPU.

See [`docs/data-importing.md`](docs/data-importing.md) for the full set of input
formats, column detection rules, and how to import precomputed embeddings.

---

## Repository Layout

```
latentscope/                 # Python package
  __init__.py                # Public API (lazy imports for heavy deps)
  models/
    __init__.py              # get_embedding_model(), get_chat_model()
    providers/               # transformers, openai, cohere, voyage, late_interaction (ColBERT), ...
    embedding_models.json    # registry (dense + colbert-* late-interaction models)
    chat_models.json
  scripts/                   # Pipeline step implementations (each has a CLI + a function)
    ingest.py, embed.py, umapper.py, cluster.py, label_clusters.py, scope.py,
    sprites.py,              # per-row image sprites (legacy serving)
    sprite_atlas.py          # tiled representative-image atlas pyramid (image map)
  server/                    # Flask application
    app.py                   # create_app() factory; LRU caches
    jobs.py                  # subprocess job runner + routes (list-based, never shell=True)
    datasets.py              # dataset/scope/atlas routes
    search.py                # nn search + nn_late_interaction (MaxSim)
    tags.py, bulk.py, admin.py, models.py, estimate.py
  util/
    configuration.py         # LATENT_SCOPE_DATA, API keys, dotenv helpers
    embedding_store.py       # LanceDB read/write/migrate + MaxSim search
web/                         # React + Vite frontend
  src/components/Explore/     # scatter (ScatterGL), atlas overlay, points overlay, config panel
  src/components/Setup/       # pipeline step UIs (Embedding, Umap, Cluster, Scope, SpriteAtlas)
tests/                       # pytest suite (fake providers -> no downloads/GPU needed)
examples/colbert_quickstart/ # runnable ColBERT late-interaction demo
docs/data-importing.md       # data import tutorial (#60)
PATH_TO_1.0.md               # the current roadmap (supersedes development-plan.md)
```

---

## Key Design Decisions

### App Factory Pattern
`server/app.py` uses `create_app(data_dir, read_only)`. The data directory lives
in `app.config['DATA_DIR']` (not module globals); blueprints read it via
`current_app.config['DATA_DIR']`. Keeps the server testable and embeddable.

### Lazy Imports in `__init__.py`
Heavy ML deps (torch, transformers, umap-learn, hdbscan, pylate) are imported
only when their functions are called, so `import latentscope` (e.g. to start the
server) does not require the full ML stack.

### Embedding storage: LanceDB (`util/embedding_store.py`)
Each embedding set is a LanceDB table: `ls_index`, `vector` (fp32 mean), and for
late-interaction models `token_vectors` (fp16 per-token) + `num_tokens`. Dense
search uses ANN cosine; late-interaction uses `search_late_interaction()`
(ANN prefilter → MaxSim re-rank). `migrate_hdf5_to_lancedb()` upgrades old data.

### Job Runner Security (`server/jobs.py`)
**Always use list-based commands, never `shell=True`.** Arguments include
user-supplied values (dataset names, paths) that are injection vectors:
```python
command = ['ls-embed', dataset, text_column, model_id]   # CORRECT
subprocess.Popen(command, ...)
# NEVER: subprocess.Popen(f'ls-embed "{dataset}" ...', shell=True)
```

### Sprite atlas (`scripts/sprite_atlas.py`)
Optional post-scope step. Builds a per-resolution tiled image pyramid keyed to
the heatmap grid (cell membership recomputed from each point's x/y, mirroring
`scope.py`'s `make_tiles`). The manifest stores an `input_fingerprint` of the
scope points; the `/atlas/status` endpoint revalidates against the current
`{scope}-input.parquet` so a stale atlas (after a scope overwrite) is not served.

---

## Running Tests

```bash
uv run pytest tests/ -q          # ~150 tests, no model downloads (fake providers)
```
Real-model tests are opt-in: `LS_TEST_REAL_MODELS=1 uv run pytest -q`.
Fixtures (`tests/conftest.py`): `tmp_data_dir`, `app`/`client`,
`readonly_app`/`readonly_client`.

Frontend:
```bash
cd web && npm run test           # vitest
cd web && npm run lint           # eslint
cd web && npm run production     # build
```

---

## Linting & Formatting

```bash
uv run ruff check latentscope/        # lint  (E/W/F/I/UP, line length 100)
uv run ruff check --fix latentscope/  # auto-fix
uv run ruff format latentscope/       # format
```

---

## Adding New Models

- **Embedding models:** add an entry to `models/embedding_models.json`; add a
  provider class in `models/providers/` if it's a new provider. Late-interaction
  models use the `colbert-` prefix and the `late_interaction` provider.
- **Chat models:** add an entry to `models/chat_models.json`.
- Model IDs must not contain emoji. HuggingFace IDs use the `transformers-`
  prefix with `___` replacing `/` (e.g. `transformers-BAAI___bge-small-en-v1.5`).

---

## Roadmap

See [`PATH_TO_1.0.md`](PATH_TO_1.0.md) for the current path to a 1.0 release
(the older `development-plan.md` is kept for history but is superseded).
