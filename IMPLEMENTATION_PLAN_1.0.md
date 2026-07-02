# Implementation Plan — Latent Scope 1.0

Execution DAG for the four 1.0 initiatives, written to drive a **multi-agent
workflow**. Strategy narrative lives in [`PATH_TO_1.0.md`](PATH_TO_1.0.md); this
file is the build sheet: work packages, **file ownership**, dependency waves, and
acceptance criteria. Written 2026-07-02.

## Scope (locked 2026-07-02)

1. **GPU acceleration** (#63) — cuML UMAP + clustering, `LATENT_SCOPE_DEVICE`, CPU fallback.
2. **Additional clustering algorithms** (#41) — kmeans + GMM, 2D-vs-high-dim input choice.
3. **Experiment gallery + named steps** — editable name/description on umap & cluster runs; gallery view.
4. **Compare + color-by** (#132 / #131) — shared brush selection across panes; color by numeric column in Compare and Explore.

Then: **docs refresh**, **test depth**, **release 1.0.0**. Curation (#92) is **out of scope**.

---

## Orchestration principles

- **One owner per file.** The DAG is partitioned so that within a wave no two
  agents edit the same file. Hot files (`cluster.py`, `umapper.py`,
  `Scatter.jsx`, `jobs.py`, `apiService.js`) each have exactly one owning WP.
- **Contracts land first (WP-0).** The CLI arg surface (`jobs.py`), the device
  resolver, the metadata-schema additions, and the `apiService` method stubs are
  all created in WP-0 so downstream WPs code against a fixed interface and never
  re-touch the shared plumbing.
- **Waves are barriers.** Run each wave to completion before the next. Within a
  wave, agents run in parallel under **`isolation: 'worktree'`** (they mutate
  files concurrently).
- **Every WP self-verifies** before reporting done: `uv run pytest tests/ -q`,
  `uv run ruff check latentscope/`, and for frontend WPs `cd web && npm run lint
  && npm run test`. Feature WPs also run the relevant example/pipeline.
- **Report format.** Each agent returns: files changed, new CLI/API/props added,
  test results (paste counts), and any contract deviation.

### File-ownership / conflict matrix

| File | Owner WP | Also needs (read-only) |
|---|---|---|
| `util/device.py` (new), `util/configuration.py` | WP-0 | A, B |
| `server/jobs.py` (umap+cluster command builders) | WP-0 | — |
| `web/src/lib/apiService.js` (new method stubs) | WP-0 | D, E, F |
| `pyproject.toml` (deps / `gpu` extra) | WP-0 | I |
| `scripts/umapper.py` | WP-A | — |
| `scripts/cluster.py` | WP-B | — |
| `server/datasets.py` (color-by column endpoint) | WP-C | E, F |
| `web/src/components/Setup/Umap.jsx`, `Setup/Cluster.jsx`, Gallery (new) | WP-D | — |
| `web/src/components/Scatter.jsx`, `components/Compare/*` | WP-E | — |
| `web/src/components/Explore/ScatterGL.jsx`, `Explore/VisualizationPane.jsx`, color-by hook (new) | WP-F | — |
| `docs/*`, `README.md`, docs site | WP-G | — |
| `tests/*` | WP-H | — |
| `__version__.py`, `CHANGELOG.md` (new), `MIGRATIONS.md` | WP-I | — |

---

## WP-0 — Foundation & contracts *(Wave 1, solo, blocking)*

**Goal:** create every shared interface the feature WPs depend on, so nothing
downstream touches shared plumbing.

**Do:**
1. `util/device.py` — `resolve_device(preferred=None)` reading `LATENT_SCOPE_DEVICE`
   (`cpu` | `cuda` | `auto`, default `auto`); probe cuML/cuvs importability; return
   a small struct `{torch_device, use_cuml: bool, reason: str}` and log the choice.
   No hard dependency on cuml — probe with a guarded import.
2. `util/configuration.py` — register `LATENT_SCOPE_DEVICE` alongside the existing
   env handling.
3. `server/jobs.py` — extend the **umap** command builder to pass `--name` /
   `--description`, and the **cluster** builder to pass `--name` / `--description`,
   `--method {evoc,hdbscan,kmeans,gmm}`, and `--cluster_on {umap,embedding}`.
   (These flags are consumed by WP-A/WP-B; define them here as the contract even
   though the script-side handling lands there.)
4. **Metadata schema** — document (in this file's appendix or a `CONTRACT.md`) the
   exact new fields: `umap-NNN.json` and `cluster-NNN.json` gain optional
   `"name"` (string) and `"description"` (string). `cluster-NNN.json` gains
   `"cluster_on"` ("umap" | "embedding"). Nothing else changes.
5. `web/src/lib/apiService.js` — add stub methods returning the agreed endpoints:
   `updateUmapMeta(dataset, umapId, {name, description})`,
   `updateClusterMeta(...)`, `fetchColumnValues(dataset, scopeOrUmapId, column)`
   (numeric per-point values + extent for #131). Wire them to the endpoints WP-C
   / WP-A / WP-B will serve.
6. `pyproject.toml` — confirm `scikit-learn` is a direct dep (kmeans/GMM); add an
   optional `[project.optional-dependencies] gpu = [...]` extra pinning
   cuml-cu12 / cuvs compatible with **CUDA 12.8** (the gsv box). Do **not** make
   it a default dep.

**Acceptance:** `uv run pytest -q` green; `import latentscope` still works with no
cuml installed (guarded import); `ls-umap --help` / `ls-cluster --help` show the
new flags once WP-A/WP-B land (WP-0 may stub the argparse entries as accepted-but-ignored to keep help/tests coherent).

---

## Wave 2 — Backend features *(parallel, worktree isolation; all depend on WP-0)*

### WP-A — UMAP backend: GPU + named steps
**Owns:** `scripts/umapper.py`.
- Swap reducer construction (umapper.py ~L200/225/235/355/365) to use
  `cuml.manifold.UMAP` when `resolve_device().use_cuml`, else `umap-learn`.
  Preserve params (n_neighbors, min_dist, metric='cosine', n_components=2, seed)
  and the `[-1,1]` normalization. Graceful fallback + a logged one-liner on which
  backend ran.
- Add `--name` / `--description` argparse; write them into `umap-NNN.json`
  (currently L163-176, no name field today).
- **Verify:** run `ls-umap` on a tiny dataset on CPU (force `LATENT_SCOPE_DEVICE=cpu`);
  confirm parquet + png + meta with name/description. GPU path validated by WP-H
  on the 5090.

### WP-B — Cluster backend: GPU + kmeans/GMM + input choice + named steps
**Owns:** `scripts/cluster.py`.
- **GPU:** route `_run_hdbscan` (L77-88) through `cuml.cluster.HDBSCAN` when
  `use_cuml`, else CPU hdbscan. (EVoC has no cuML equivalent — leave CPU, log it.)
- **New methods:** add `_run_kmeans` and `_run_gmm` (sklearn `KMeans` /
  `GaussianMixture`); extend `--method` choices (L43) and the dispatch (L122-136).
  Neither emits -1 noise, so the L142-154 noise-reassignment no-ops cleanly.
- **Input choice:** add `--cluster_on {umap,embedding}` (default preserves today's
  behavior: evoc→embedding, hdbscan→umap). Load 2D umap parquet or high-dim
  embeddings (`load_embeddings`) per the flag.
- Add `--name` / `--description`; write into `cluster-NNN.json` (L198-210), plus
  `cluster_on`. Keep the `-labels-default.parquet` write and hull logic intact.
- **Verify:** run each method (`evoc`, `hdbscan`, `kmeans`, `gmm`) on a tiny
  dataset CPU-only; confirm `n_clusters` sane and scope still builds downstream.

### WP-C — Color-by column endpoint (backend for #131)
**Owns:** `server/datasets.py` (new route only; do not touch cluster/umap routes).
- Add `GET /<dataset>/column/<column>?scope=<id>` (or umap-scoped) returning
  per-point numeric values aligned to `ls_index` order + `extent` from
  `meta.json → column_metadata` (numeric `extent` already stored, ingest.py
  L203-209). Handle categorical columns via `categories`/`counts` too.
- **Verify:** unit test hitting the route against a fixture dataset; returns
  array length == row count and correct extent.

---

## Wave 3 — Frontend features *(parallel, worktree isolation; depend on WP-0 + their Wave-2 backend)*

### WP-D — Named steps + experiment gallery + clustering-method UI
**Owns:** `Setup/Umap.jsx`, `Setup/Cluster.jsx`, new `Setup/ExperimentGallery.jsx`.
Depends on WP-A, WP-B (meta fields + methods).
- Add **name/description inputs** to the Umap and Cluster forms (model them on
  `Setup/Scope.jsx:38-39` which already has label/description); send via the
  WP-0 job payload / `updateUmapMeta` / `updateClusterMeta`.
- Add **kmeans/GMM** to the Cluster method picker (`Cluster.jsx:169-290`) and a
  **cluster-on umap/embedding** toggle.
- Replace the **bare-id radio lists** (`Umap.jsx:303-369`, `Cluster.jsx:295-394`)
  with a **gallery**: thumbnail (`um.url` / cluster png) + editable title + param
  badges + quality metrics (Sil/CH/DB already rendered at Cluster.jsx:351-375).
- **Verify:** `npm run lint && npm run test`; manually drive Setup against a
  running `ls-serve` and confirm names persist + gallery renders.

### WP-E — Compare page: shared brush (#132) + color-by-in-Compare (#131 half)
**Owns:** `components/Scatter.jsx`, `components/Compare/*`.
Depends on WP-C (column endpoint).
- **Brush (#132):** enable regl-scatterplot lasso in `Scatter.jsx`; in
  `SideBySideView.jsx` route the `select` event to a **shared `selectedIndices`
  set** (not the current `indices[0]`-only click-kNN at :174/:196); render
  selected-vs-not in both panes; feed the set to `CompareDataPanel.jsx`. Optional
  "spread" stat per pane.
- **Color-by (#131, Compare half):** add a numeric-column picker in
  `CompareControls.jsx` beside the drift-metric picker; pass values from
  `fetchColumnValues` into the existing `Scatter.jsx` `colorBy`/`continuous` path;
  add a legend (extent + ramp).
- **Cleanup:** migrate Compare's direct `fetch` calls (Compare.jsx:13,
  SideBySideView.jsx:12) onto `apiService`.
- **Verify:** lint+test; brush in one pane highlights the other; color ramp
  renders for a numeric column.

### WP-F — Explore color-by (#131 half)
**Owns:** `Explore/ScatterGL.jsx`, `Explore/VisualizationPane.jsx`, new
`hooks/useColorBy.js`.
Depends on WP-C.
- Extend `ScatterGL.jsx` buffers/shader so hue can be data-driven (continuous via
  interpolator, categorical via category metadata) instead of selection-only
  (currently `calculatePointColor → mapSelectionColorsLight`, :35-37/:224-228).
  Keep selection state compositable (e.g. selection dims, color still shows).
- Column picker + legend in `VisualizationPane.jsx` (finish the dormant scaffold);
  `useColorBy` hook to hold column + scale.
- **Verify:** lint+test; color Explore map by a numeric column; selection still works.

---

## Wave 4 — Docs & tests *(parallel; after features green)*

### WP-G — Docs refresh
**Owns:** `docs/*`, `README.md`, published docs site sources.
- Update guides to describe **images, ColBERT, LanceDB**, GPU acceleration, the
  new clustering methods, named experiments/gallery, and color-by. Fold in #60
  (data importing) and #33 (data-size limitations). Document **curation as
  post-1.0**.

### WP-H — Test depth (CPU) *(in Wave 4, runs now)*
**Owns:** `tests/*`.
- E2E for the **LanceDB migration** path and the **image pipeline** at slightly
  larger sizes. A couple of **MaxSim ranking-correctness** assertions beyond the
  smoke checks. New: GPU-fallback resolves to CPU cleanly when cuml absent;
  kmeans/GMM produce valid `cluster-NNN.json`; name/description round-trip; the
  color-by column endpoint. **All CPU — no GPU required.**
- Also fix the 2 **pre-existing read-only failures** (`test_server.py`
  `TestSettings::test_settings_not_available_in_read_only`,
  `TestTags::test_write_blocked_in_read_only`) or file them if the enforcement
  bug is real.

### WP-H-GPU — cuML validation on the 5090 *(DEFERRED — gated on a GPU window)*
**Blocked on GPU availability.** The gsv RTX 5090 is shared under the
`latent-labs/coordination/` protocol (agents `sae` + `basemap`); it is booked
through the day + overnight (basemap trainers → sae exclusive 20:00Z–01:00Z →
sae moderate trainings). Do **not** run this until a window is obtained via that
protocol (file a request, wait for `ack`).
- Validate `LATENT_SCOPE_DEVICE=cuda` actually engages **cuML UMAP**, **cuML
  HDBSCAN**, and **cuML KMeans** on a modest dataset; confirm output parity with
  the CPU path (cluster counts / projection sanity) and record throughput.
- Profile: short (~15–30 min), ~2–6 GB VRAM, util spiky (UMAP fit can hit
  saturating briefly), **preemptible** (re-runnable smoke). Classify `moderate`.
- This is the ONLY GPU-dependent task in the whole 1.0 build; everything else
  (including the cuML code paths, which are correct-by-construction + guarded)
  ships without it. Release (WP-I) can prepare 1.0 with WP-H-GPU still pending;
  the GPU validation gates the *final* GPU-feature sign-off, not the code.

---

## Wave 5 — Release *(solo; after all green)*

### WP-I — Release engineering 1.0.0
**Owns:** `latentscope/__version__.py`, `CHANGELOG.md` (new), `MIGRATIONS.md`.
- Bump `__version__` `0.6.0` → `1.0.0`. Write `CHANGELOG.md` from the full PR span
  since 0.6.0. Update `MIGRATIONS.md` (LanceDB, curation-removed note).
- Fresh-venv smoke test: `pip install` the built wheel and run each pipeline step
  on a small dataset.
- **Human-gated:** tag + PyPI publish are the user's to trigger; the WP prepares
  everything and stops before pushing the tag.

---

## Suggested workflow shape

```
phase('Foundation')   → WP-0                       (solo, barrier)
phase('Backend')      → parallel[WP-A, WP-B, WP-C] (worktrees, barrier)
phase('Frontend')     → parallel[WP-D, WP-E, WP-F] (worktrees, barrier)
phase('Docs+Tests')   → parallel[WP-G, WP-H]       (worktrees, barrier)
phase('Release')      → WP-I                        (solo)
```

Between phases, the orchestrator merges worktrees and runs the full test + lint
suite as the barrier gate before starting the next phase. A failed WP blocks only
its own downstream dependents; re-dispatch it before proceeding past its wave.
