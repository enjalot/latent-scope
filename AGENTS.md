# AGENTS.md — Driving Latent Scope for a user

Cross-provider guidance for AI coding agents (Claude, Codex, Cursor, Copilot, Amp,
…) on how to **use Latent Scope effectively on a user's behalf** — take a raw
dataset, turn it into an explorable latent-space map, and show the user the
result. Claude Code reads this via `.claude/skills/latent-scope/`; other agents
read this file directly. It is the source of truth; keep provider-specific files
(`CLAUDE.md`) pointing here.

> If the user asks you to *contribute to* Latent Scope (fix a bug, add a
> feature), see the "Developing" section at the bottom and `CLAUDE.md`. Most of
> this file is about *using the tool* to analyze a user's data.

---

## What it is

Latent Scope embeds a dataset, projects it to 2D, clusters and labels it, and
serves an interactive map. Pipeline:

```
ingest → embed → umap → cluster → label → scope → (sprite atlas) → explore
```

Each step is a CLI (`ls-embed`, `ls-umap`, …) that reads/writes files under
`$LATENT_SCOPE_DATA/<dataset>/`. The web UI (`ls-serve`) drives the same steps
and shows the result. Text **and** image datasets; dense, ColBERT
late-interaction, and image (CLIP) embeddings; LanceDB vector storage.

Reach for it when a user has a table/corpus of text or images and wants to
*see the structure* — clusters, outliers, themes, similarity — rather than a
single metric.

---

## Golden path: run it for a user

On a dev checkout use `uv run` (resolves `.venv`). If installed via pip, drop the
`uv run` prefix. **Set the data dir and HF cache first:**

```bash
export LATENT_SCOPE_DATA=~/latent-scope-data     # where datasets live
export HF_HOME=~/hf-cache                         # model/dataset cache
```

**Full pipeline on a text CSV:**
```bash
uv run ls-ingest   mydata --path /path/to/data.csv --text_column text
uv run ls-embed    mydata text huggingface-jinaai___jina-embeddings-v5-text-nano  # see "Choosing a model"
uv run ls-umap     mydata embedding-001 25 0.1
uv run ls-cluster  mydata umap-001 25 5 0.0 --method hdbscan
uv run ls-scope    mydata embedding-001 umap-001 cluster-001 default "My scope" "description"
```
`ls-cluster` auto-writes `…-labels-default`, so `ls-scope … default …` works
**without** an LLM. For nicer labels run `ls-label` with a chat model first and
pass that labels id instead of `default`.

**Show the user the result (one command):**
```bash
uv run ls-serve $LATENT_SCOPE_DATA        # API + built web UI at http://localhost:5001
```
Open `http://localhost:5001`, pick the dataset, open the scope. This serves the
**pre-built** web assets — no Node needed. On a LAN box, others reach it at
`http://<host>.local:5001`.

**Copyable end-to-end example:** `examples/colbert_quickstart/run.sh` builds a
tiny dataset, embeds it on CPU, runs the whole pipeline, and verifies search.

---

## The steps in detail

| step | command (positional args) | writes |
| --- | --- | --- |
| ingest | `ls-ingest <ds> --path <file> --text_column <col>` (or a DataFrame via the library API) | `input.parquet`, `meta.json` (column detection) |
| embed | `ls-embed <ds> <col> <model_id> [--task] [--prefix] [--dimensions] [--batch_size] [--max_seq_length]` | `embeddings/embedding-NNN.*` (LanceDB) |
| umap | `ls-umap <ds> <embedding_id> <neighbors> <min_dist> [--name --description]` | `umaps/umap-NNN.*` (x,y in [-1,1]) |
| cluster | `ls-cluster <ds> <umap_id> <samples> <min_samples> <epsilon> [--method] [--cluster_on] [--name]` | `clusters/cluster-NNN.*` + `…-labels-default.parquet` |
| label | `ls-label <ds> <text_col> <cluster_id> <chat_model_id> <samples> <context>` | `clusters/<cluster>-labels-NNN.parquet` |
| scope | `ls-scope <ds> <embedding_id> <umap_id> <cluster_id> <labels_id> "<label>" "<desc>"` | `scopes/scopes-NNN.*` + per-scope LanceDB |
| atlas | `ls-sprite-atlas <ds> <scope_id> <image_column>` (image datasets only) | tiled image pyramid for the image map |

List available models: `ls-list-models`. Import precomputed embeddings:
`ls-embed-importer`. Publish/pull scopes to HuggingFace: `ls-upload-dataset` /
`ls-download-dataset --revision <tag>`.

---

## Choosing an embedding model

Model ids use `<provider>-<org>___<model>` (canonical HF prefix is
**`huggingface-`**; `___` replaces `/`). The Setup UI has an HF model search, so
**any** HF sentence-transformers model is usable without pre-registering it. A
few good defaults:

- **`huggingface-jinaai___jina-embeddings-v5-text-nano`** — small, multilingual,
  strong. This is the current demo/SAE-target model. It's **task-conditioned**
  (see below) and works out of the box.
- **`huggingface-BAAI___bge-small-en-v1.5`** — tiny, CPU-fast, English. Good when
  you just need a quick map on a machine with no GPU.
- **Images:** `clip-openai___clip-vit-base-patch32` (CLIP) — embed the *image*
  column, not the text column.

### Task-conditioned models (jina-v3 / v5)

Some models (jina) select a LoRA adapter per **task** and refuse to encode until
one is chosen. Latent Scope handles this automatically: it reads the model's
`task_names` and defaults to **`retrieval`**, so the popular base checkpoints
"just work". Override with `ls-embed … --task {retrieval,clustering,classification,text-matching}`
(the Setup UI shows a Task dropdown). For a *clustering/exploration* map,
`retrieval` (general) or `clustering` (specialized) are both good.

### Prefixes / prompts

Retrieval models embed *documents* with a document prompt and *queries* with a
query prompt. Latent Scope auto-applies the model's **document** prompt when
embedding a corpus (so leave `--prefix` blank for jina), and uses the **query**
prompt for search — you don't manage this. An explicit `--prefix` **overrides**
the auto prompt (they don't stack), for models that use raw instruction prefixes
(e.g. nomic's `"clustering: "`).

---

## Device & performance (read this before a big run)

- `LATENT_SCOPE_DEVICE` = `cpu` | `cuda` | `auto` (default `auto`). Controls
  cuML-accelerated UMAP/HDBSCAN/KMeans.
- **GPU (Linux + NVIDIA):** `pip install "latentscope[gpu]"` (RAPIDS). Validated
  set on a **CUDA 12.8** driver: `torch …+cu128` (from the cu128 index —
  the default PyPI torch is cu130 and won't see a 12.8 driver), plus
  `cuml/cuvs/cudf-cu12==25.2.*` (newer RAPIDS needs CUDA ≥12.9). See
  `docs/gpu-acceleration.md`.
- **Apple Silicon (Mac):** the **embedding** step uses **MPS** automatically —
  fast. `umap`/`cluster` run on CPU (no cuML on Mac); fine at these sizes.
- **CPU-only embedding is slow.** jina-v5-nano on a loaded CPU can be tens of
  seconds per batch. **Before a large CPU embed, check the machine isn't already
  saturated** (`uptime`, `nvidia-smi`) — if it is, use a GPU/Mac or a smaller
  model (bge-small). To force CPU: `export CUDA_VISIBLE_DEVICES=`.
- **Shared-GPU etiquette:** if the box may be running other GPU jobs, check
  before launching a GPU run and don't fight a training job for VRAM.

---

## Clustering

`ls-cluster … --method {evoc,hdbscan,kmeans,gmm}` (default `evoc`). For
`kmeans`/`gmm` the `samples` positional is the **number of clusters**. Choose the
input space with `--cluster_on {umap,embedding}` — cluster on the 2D projection
(spatially coherent) or the high-dim embeddings (semantically tighter). EVoC and
HDBSCAN find the cluster count for you; kmeans/gmm need it.

---

## Explore features to point the user at

- **Color by any column** — numeric (viridis ramp) or categorical, in Explore
  and Compare. Great for overlaying an external score/metric on the map.
- **Compare** two scopes side by side with shared lasso-brush selection.
- **Setup gallery** — umap/cluster runs carry names/descriptions and show as
  browsable cards (not bare ids).
- **Search** — dense similarity, and ColBERT MaxSim for late-interaction.
- **Density heatmap** and, for image datasets, a **sprite-atlas image map**
  (heatmap → representative images → points as you zoom).

---

## Verifying a result for the user

Don't claim a map "works" without looking. Cheap checks:
1. The step CLIs exit 0 and write their files; `ls-cluster` prints `n_clusters`.
2. `ls-serve` the data dir and hit the API: `GET /api/datasets/<ds>/scopes`
   returns the scope; `GET /api/datasets/<ds>/column/<numeric_col>?scope=<id>`
   returns per-point values.
3. If you can drive a browser, screenshot `…/datasets/<ds>/explore/<scope>` and
   confirm the scatter renders points + cluster labels (not a blank/white map).
   The served UI is the **pre-built** bundle (`latentscope/web/dist`); frontend
   source changes require a rebuild before they appear.

---

## Operational gotchas (hard-won)

- **`peft` is required** for jina-v5's remote code (it's a core dep now; if you
  see "requires peft", `pip install peft`).
- **Serving updated frontend code:** `ls-serve` serves `latentscope/web/dist`. If
  you changed `web/src`, rebuild: `cd web && npm run production` then copy
  `web/dist/production/*` → `latentscope/web/dist/` (or `bash build.sh`).
- **Job runner:** long steps run as subprocess jobs; the Setup UI has a 💀 Kill
  button and an expandable log. Jobs also self-kill after 5 min of no output.
- **Data size:** designed for up to ~a few million points; UMAP/HDBSCAN memory
  and the browser point budget are the limits. Sample down at ingest for larger
  corpora (see `docs/data-importing.md` §8).
- **Model ids:** no emoji (legacy `🤗-` ids are accepted but not canonical — use
  `huggingface-`). HF ids replace `/` with `___`.
- **Multiple `ls-serve` instances / stale servers:** a server loads code at
  start; if the API returns stale shapes, it's an old process — restart it from
  the current checkout with the venv bin on `PATH` (so it can spawn `ls-embed`).

---

## Publishing a dataset (when the user wants to share)

```bash
uv run ls-upload-dataset $LATENT_SCOPE_DATA/<ds> ls-<ds>
```
Note the asymmetry: **upload takes a bare repo name** (`ls-<ds>`) — it always
publishes under your authenticated HF account (a namespaced id is normalized to
its bare name). **Download takes the full `<user>/<repo>`.** Pin a
format-compatible version on download with
`ls-download-dataset <user>/<repo> <name> $LATENT_SCOPE_DATA --revision v1.0`. Tag the
HF repo (`v1.0`) so older downloads keep working after a rebuild. Reproducible
build recipes for the demo datasets live in `examples/datasets/`.

---

## Common user requests → recipe

- *"Show me the structure of this CSV"* → Golden path (ingest→embed→umap→cluster→scope) + `ls-serve`.
- *"Which items are similar to X?"* → open the scope, use similarity search; or `ls-embed` + the search API.
- *"Cluster my product images"* → ingest (image column auto-detected) → `ls-embed <ds> <image_col> clip-…` → umap → cluster → scope → `ls-sprite-atlas`.
- *"Overlay my quality score on the map"* → include the numeric column at ingest, then color-by it in Explore.
- *"Make it faster"* → GPU (`LATENT_SCOPE_DEVICE=cuda` + `[gpu]` extra) or a Mac (MPS), or a smaller model.

---

## Developing / contributing (if the task is changing the code)

```bash
uv run pytest tests/ -q          # fake providers, no downloads/GPU
uv run ruff check latentscope/   # lint (line length 100)
cd web && npm run lint && npm run test && npm run production
```
Design notes, repo layout, and pipeline internals are in `CLAUDE.md` and
`docs/`. Job commands must stay **list-based** (never `shell=True`). When adding
an embedding provider, subclass `EmbedModelProvider` (you get `embed_query` for
free); add clustering/projection methods by mirroring the `--method` dispatch in
`scripts/cluster.py`.
