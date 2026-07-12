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

**Full pipeline on a folder of images** (screenshots, product photos, …) —
`ls-ingest` accepts a **directory** and builds the image dataset for you
(reads each file's bytes into an `image` column, adds `filename`/`date`/`size_kb`
for labeling and color-by; non-recursive; png/jpg/jpeg/webp/gif):
```bash
uv run ls-ingest       shots --path ~/Desktop                 # a directory ⇒ image dataset
uv run ls-embed        shots image clip-openai___clip-vit-base-patch32
uv run ls-umap         shots embedding-001 25 0.1
uv run ls-cluster      shots umap-001 25 5 0.0 --method hdbscan
uv run ls-scope        shots embedding-001 umap-001 cluster-001 default "Shots" "desc"
uv run ls-sprite-atlas shots scopes-001 image                 # image map tiles (do not skip)
```
If the images are referenced from a *table* instead, know that ingest only
detects an image column from raw **bytes** / HF `{"bytes",…}` dicts or `http…`
URLs — a column of local file paths is treated as plain strings. Read the bytes
into the frame (or just point ingest at the folder).

**Show the user the result (one command):**
```bash
uv run ls-serve $LATENT_SCOPE_DATA        # API + built web UI at http://localhost:5001
```
Open `http://localhost:5001`, pick the dataset, open the scope. On a LAN box,
others reach it at `http://<host>.local:5001`.

> **pip install vs. source checkout:** a pip-installed `latentscope` ships the
> web UI pre-built — `ls-serve` just works, no Node. A **source checkout does
> not include `latentscope/web/dist/`** — the API still works but every UI
> route returns **503 with build instructions** (older versions: a JSON 404).
> Build it once:
> ```bash
> cd web && npm install && npm run production && cd ..   # if npm ci fails, use npm install
> mkdir -p latentscope/web/dist && cp -r web/dist/production/* latentscope/web/dist/
> ```
> The catch-all reads from disk per request, so **no server restart** is needed
> after the copy. (`bash build.sh` does this too, plus a wheel build.)

**Copyable end-to-end example:** `examples/colbert_quickstart/run.sh` builds a
tiny dataset, embeds it on CPU, runs the whole pipeline, and verifies search.

---

## The steps in detail

| step | command (positional args) | writes |
| --- | --- | --- |
| ingest | `ls-ingest <ds> --path <file-or-image-dir> --text_column <col>` (or a DataFrame via the library API) | `input.parquet`, `meta.json` (column detection) |
| embed | `ls-embed <ds> <col> <model_id> [--task] [--prefix] [--dimensions] [--batch_size] [--max_seq_length]` | `embeddings/embedding-NNN.*` (LanceDB) |
| umap | `ls-umap <ds> <embedding_id> <neighbors> <min_dist> [--save --transform-from --align --register-to --name --description]` (growing datasets: docs/umap.md) | `umaps/umap-NNN.*` (x,y in [-1,1]) |
| cluster | `ls-cluster <ds> <umap_id> <samples> <min_samples> <epsilon> [--method] [--cluster_on] [--assign-noise] [--seed] [--name]` | `clusters/cluster-NNN.*` + `…-labels-default.parquet` (noise → an "Unclustered" cluster unless `--assign-noise`) |
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

**Noise is honest by default**: HDBSCAN/EVoC noise points land in an explicit
**"Unclustered"** cluster (empty hull, excluded from LLM labeling) instead of
being silently reassigned to the nearest centroid — expect one when a run
prints a `NOISE: N points (P%)` line. Pass `--assign-noise` for the old
reassignment behavior. Steering: `--seed` (reproducible evoc/kmeans/gmm),
`--approx_n_clusters` / `--base_n_clusters` (evoc granularity targets), and
note HDBSCAN's `min_cluster_size` has **cliff behavior** (a small bump can
collapse dozens of clusters into a few) while `min_samples 1` reduces noise
without collapsing — see `docs/clustering.md`.

---

## Explore features to point the user at

- **Color by any column** — numeric (viridis ramp) or categorical, in Explore
  and Compare. Great for overlaying an external score/metric on the map.
- **Compare** two scopes side by side with shared lasso-brush selection.
- **Setup gallery** — umap/cluster runs carry names/descriptions and show as
  browsable cards (not bare ids).
- **Search** — dense similarity, and ColBERT MaxSim for late-interaction.
- **Token maps** — for late-interaction embeddings, map one point per *token*
  (`ls-tokenize` → `ls-umap --granularity tokens` → cluster → scope, optional
  token-level SAE features); the table shows parent documents with the
  selected token highlighted. See `docs/token-maps.md`.
- **Density heatmap** and, for image datasets, a **sprite-atlas image map**
  (heatmap → representative images → points as you zoom).

---

## Verifying a result for the user

Don't claim a map "works" without looking. Cheap checks:
1. The step CLIs exit 0 and write their files; `ls-cluster` prints `n_clusters`.
2. `ls-serve` the data dir and hit the API: `GET /api/datasets/<ds>/scopes`
   returns the scope; `GET /api/datasets/<ds>/column/<numeric_col>?scope=<id>`
   returns per-point values. For image datasets, confirm the atlas:
   `GET /api/datasets/<ds>/scopes/<scope>/atlas/status?column=<image_col>`
   (the param is **`column`**, not `image_column`) → `"generated": true`.
3. Check the UI itself is served: `curl -s -o /dev/null -w '%{http_code}'
   http://localhost:5001/` must be **200** (503/404 ⇒ the web bundle isn't
   built — see the source-checkout note above). API-only checks can pass while
   every UI route fails.
4. If you can drive a browser, screenshot `…/datasets/<ds>/explore/<scope>` and
   confirm the scatter renders points + cluster labels (not a blank/white map).
   The served UI is the **pre-built** bundle (`latentscope/web/dist`); frontend
   source changes require a rebuild before they appear.

---

## Operational gotchas (hard-won)

- **`peft` is required** for jina-v5's remote code (it's a core dep now; if you
  see "requires peft", `pip install peft`).
- **Serving frontend code from a source checkout:** `ls-serve` serves
  `latentscope/web/dist`, which a fresh clone **doesn't have** (UI routes 503;
  `ls-serve` prints a warning at startup). Build + copy as in the
  source-checkout note above; same recipe after changing `web/src`. No restart
  needed — the catch-all re-reads disk per request.
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
- *"Cluster my product images / map my screenshots"* → a folder of images: `ls-ingest <ds> --path <dir>` then embed the `image` column with `clip-…` → umap → cluster → scope → `ls-sprite-atlas` (see the image golden path above). A table with an image column works the same once ingested (bytes or http URLs, never local paths).
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
