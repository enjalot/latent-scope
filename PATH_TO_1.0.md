# Path to Latent Scope 1.0

This plan supersedes `development-plan.md` (kept for history). It reconciles what
has actually shipped since **v0.6.0 (Feb 2025)** with what remains, and lays out
a release strategy. Written 2026-06-20.

---

## Update 2026-07-02 — scope decisions locked + execution plan

Reviewed the plan against the repo and tracker. Three scope calls made:

1. **Straight to 1.0 — no intermediate 0.7.0.** We land all remaining 1.0 work
   on `main` and tag `1.0.0` once. (Overrides the "cut 0.7.0 first" recommendation
   below; the release-engineering step now targets 1.0.0 directly. Accepted risk:
   the "does it install for a stranger" check happens at 1.0 instead of sooner.)
2. **Curation (#92) is scoped OUT of 1.0.** Document it as post-1.0 (1.1) and
   label #92 / #79 / #80 accordingly. 1.0 stays a focused, shippable core.
3. **1.0 feature set = four initiatives:** GPU acceleration (#63), experiment
   gallery + named umap/cluster steps, Compare improvements + color-by
   (#132 / #131), **and** additional clustering algorithms (#41, pulled up from
   backlog).

Also confirmed since 2026-06-20: the **P0 correctness bugs** flagged in
`review-plan-2026-06.md` are **fixed** — CI exists (`.github/workflows/ci.yml`),
`cluster.py` / `sae.py` now read embeddings via `embedding_store.load_embeddings`
(no more HDF5 breakage under LanceDB), and the ColBERT provider genuinely uses
`pylate` (768→128 projection + `[Q]`/`[D]` markers). The "closable now" issues
(#87 / #64 / #24 / #47) are all closed.

**The execution DAG for the four initiatives lives in
[`IMPLEMENTATION_PLAN_1.0.md`](IMPLEMENTATION_PLAN_1.0.md)** — work packages,
file ownership, dependency waves, and acceptance criteria for a multi-agent
build. The sections below remain the strategy narrative.

---

## Where we are

- The last tagged release is **v0.6.0**. The `__version__` still reads `0.6.0`.
- Since then: **~108 commits across ~30 merged PRs** — a near-major amount of
  work — but **nothing has been released**. The single biggest risk to 1.0 is
  not missing features; it's that a year of work has had **zero external
  validation**.

**Therefore the headline recommendation:** cut an intermediate **`0.7.0`** from
`main` soon (modernization + images + ColBERT + LanceDB), get it in users'
hands, and reserve **`1.0.0`** for after GPU acceleration, a curation decision,
and a docs refresh. Holding the tag hostage to the entire plan compounds the
"does this still install and run for a stranger" risk every week.

---

## What shipped since 0.6.0

**Foundation / modernization**
- First automated tests (pytest + vitest) and CI/coverage tooling.
- Security: job runner moved off `shell=True` to list-based commands.
- Packaging: `setup.py` → `uv` + `pyproject.toml`.
- Frontend health: lint-to-zero, fetch-layer cleanup, race guards, code-splitting.
- Memory/storage efficiency pass.

**New capabilities**
- **Image embeddings** (#87) and **images on the map** (#24): heatmap → tiled
  representative-image sprite atlas → points, as one continuous LOD.
- **ColBERT late-interaction** embeddings + MaxSim search (#64).
- **LanceDB** replaces HDF5 for vector storage (with migration).
- Custom OpenAI-compatible embedding endpoints; new OpenAI models.
- Cluster evaluation metrics + Compare page; cluster labels panel.
- Mobile explore with pan-to-query.

---

## Hardening done in this session (2026-06-20)

- **#95 sliders** — verified the Point Size / Point Opacity sliders were inert on
  the main scatter (their values never reached `ScatterGL`). Fixed: `pointScale`
  + a new `opacityScale` uniform are now threaded into the GPU layer.
- **#94 null embedding values** — `embed.py` now uses `pd.isna()` (catches
  None / NaN / pd.NA) and coerces non-strings, so null cells no longer crash a
  run. Regression test added.
- **#77 count tokens when embedding** — embedding now records per-doc token
  stats (total / mean / min / max) in the embedding metadata and surfaces them
  in the Setup UI. Validated live (ColBERT example: 1055 tokens, 14.65 avg/doc).
- **PR #130 Codex review** — (1) atlas status now revalidates a stored
  `input_fingerprint` against the current scope input, so a **stale atlas after a
  scope overwrite is not served**; (2) the second Codex item (keep a sprite
  button in `ConfigurationPanel`) is **obsolete** — per-row sprite generation was
  intentionally removed; image datasets use the atlas/image-map path.
- **Tests** — backend 149 → **155**; new coverage for null handling, token
  counting, scope-fingerprint, and stale-atlas detection.
- **ColBERT example** — `examples/colbert_quickstart/` runs the full pipeline on
  CPU and **verifies late-interaction MaxSim search via LanceDB** (27/30 on-topic
  in top-5). Confirms sim search works end-to-end with multi-vector embeddings.
- **Docs** — rewrote `CLAUDE.md` (capabilities + agent quickstart + how to run
  the dev server for a user), added `docs/data-importing.md` (#60), README
  capabilities section.

---

## Remaining work for 1.0

### 1. Release engineering (do last — straight to 1.0)
Per the 2026-07-02 decision, there is **no 0.7.0**. Release engineering is the
final phase: bump `__version__` `0.6.0` → **`1.0.0`**, changelog from the full
PR span, migration notes, tag, verify PyPI publish + a clean install in a fresh
venv, and smoke-test the published wheel against each pipeline step on a fresh
machine (the "does it run for a stranger" check).

### 2. GPU acceleration — **deferred to next session** (#63)
- [ ] cuML-accelerated UMAP + clustering when an NVIDIA GPU is available.
- [ ] `LATENT_SCOPE_DEVICE` device management / graceful CPU fallback.
- This was "Part 7" and is the most natural high-impact feature still unbuilt.

### 3. UMAP comparison + experiment gallery — **in scope for 1.0**
Motivation: experiments often generate many umaps / clusterings, and the UI
currently shows them only as `umap-001`, `umap-002`, … which is unusable at
scale. Decomposed into GitHub issues #131 (color-by) and #132 (shared selection).
- [ ] **Titles + descriptions for intermediate steps** (umaps, clusters, and
      ideally embeddings): let a run carry a human name/description, stored in
      its metadata JSON and editable in Setup. *(Backend gap: `umap-NNN.json` /
      `cluster-NNN.json` have no name/description today — only the scope does.)*
- [ ] **Gallery view** of a dataset's umaps/clusterings — thumbnails + titles +
      key params/metrics — instead of a bare id radio list, so experiments are
      browsable at a glance.
- [ ] **#132 — Compare shared selection**: lasso/brush in either Compare pane;
      selected rows become shared state highlighted in both panes (same visual
      language as Explore selection); selection summary in `CompareDataPanel`.
- [ ] **#131 — color by arbitrary numeric column**: plumb any numeric column
      (`extent` already stored in `meta.json → column_metadata`) into the Compare
      `Scatter.jsx` `colorBy` path with a picker + legend; then finish the
      Explore `ScatterGL.jsx` color-by path (shader work).

### 3b. Additional clustering algorithms (#41) — **pulled into 1.0**
Today only `evoc` (on high-dim embeddings) and `hdbscan` (on 2D umap) are wired
(`cluster.py --method`).
- [ ] Add **kmeans** and **GMM** (sklearn) as `--method` options; extend the
      dispatch in `cluster.py` and the method picker in `Setup/Cluster.jsx`.
- [ ] Expose the **2D-umap vs high-dim** clustering-input choice as a flag
      (currently hardcoded per method).

### 4. Known regressions & bugs
- [x] **Curation workflow (#92)** — **DECIDED (2026-07-02): scoped OUT of 1.0.**
      Row deletion / tagging / cluster reassignment was removed in 0.6; it stays
      out for 1.0 and is documented as a post-1.0 (1.1) initiative. Label #92,
      #79 (delete points during Setup), and #80 (Step 0 ingestion) as post-1.0.
- [ ] **#94 null values** — code fixed; also surface nulls in the Setup preview
      so users notice them before embedding.
- [ ] Re-verify the historical bug list (#95 done) against the current UI.

### 5. Docs
- [ ] Refresh the published docs site — the guides still describe a text-only
      workflow with no mention of images, ColBERT, or LanceDB.
- [ ] #33 (data size limitations), #60 (import tutorials — repo copy landed; fold
      into the site).

### 6. Test depth on the highest-blast-radius new code
- [ ] LanceDB migration path and image pipeline under e2e tests at slightly
      larger sizes.
- [ ] A couple of MaxSim ranking-correctness assertions beyond the smoke checks.

---

## Issue triage (updated 2026-07-02)

**Already closed (shipped):** #87 (image embeddings), #64 (ColBERT/token-level),
#24 (images on the map), #47 (disable dotenv), #95 (sliders), #94 (null values —
code), #77 (token counting), #60 (import tutorial — repo copy), #61 (compare
clusterings), #27 (compare umaps), #97 (emoji model names).

**Targeted for 1.0:** #63 (GPU accel), #41 (clustering algos — kmeans/GMM +
high-dim option), #132 (Compare shared selection), #131 (color-by column),
#94 (nulls — Setup-preview UI part), #38 (export improvements), #33/#60 (docs).
Experiment gallery + named umap/cluster steps has no single issue — tracked in
the plan Section 3.

**Post-1.0 / backlog:** #92 (curation), #79 (delete points), #80 (Step 0
ingestion) — the curation cluster, explicitly deferred. #58 (SAE UI), #84
(binary quantization), #81 (global UMAPs), #20 (more dim-reduction), #22
(un-embed clusters), #8/#9 (direction / cluster search), #62 (notebook widgets),
#4 (asyncio job runner), #3 (API retry), #68/#67/#51 (more embedding models),
#26 (1-step setup), #85 (tiled heatmap), #91 (anaconda compat), #115
(geometry-of-consolidation research).

---

## Definition of done for 1.0

1. **GPU acceleration (#63)** shipped: cuML UMAP + clustering when an NVIDIA GPU
   is present, `LATENT_SCOPE_DEVICE` control, graceful CPU fallback.
2. **Additional clustering algorithms (#41):** kmeans + GMM selectable alongside
   evoc/hdbscan, with a 2D-vs-high-dim input choice.
3. **Experiment gallery + named umaps/clusters:** umap/cluster runs carry
   editable names/descriptions; a gallery replaces the bare-id list, so
   multi-experiment workflows are navigable.
4. **Compare + color-by:** shared brush selection across Compare panes (#132)
   and color-by-numeric-column in Compare and Explore (#131).
5. **Curation (#92) explicitly scoped out** and documented as post-1.0, with no
   silent regressions from 0.6.
6. **Docs site matches the actual feature set** (images, ColBERT, LanceDB).
7. **Release:** CHANGELOG + migration notes; `__version__` bumped `0.6.0` →
   `1.0.0`; tag + PyPI; fresh-venv smoke test passes.
