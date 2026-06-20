# Path to Latent Scope 1.0

This plan supersedes `development-plan.md` (kept for history). It reconciles what
has actually shipped since **v0.6.0 (Feb 2025)** with what remains, and lays out
a release strategy. Written 2026-06-20.

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

### 1. Release engineering (do first)
- [ ] Cut **0.7.0**: bump `__version__`, changelog from the 30-PR span, tag,
      verify PyPI publish + a clean install in a fresh venv.
- [ ] Smoke-test the published wheel against each pipeline step on a fresh
      machine (the "does it run for a stranger" check).

### 2. GPU acceleration — **deferred to next session** (#63)
- [ ] cuML-accelerated UMAP + clustering when an NVIDIA GPU is available.
- [ ] `LATENT_SCOPE_DEVICE` device management / graceful CPU fallback.
- This was "Part 7" and is the most natural high-impact feature still unbuilt.

### 3. UMAP comparison + experiment gallery — **new initiative**
Motivation: experiments often generate many umaps / clusterings, and the UI
currently shows them only as `umap-001`, `umap-002`, … which is unusable at
scale.
- [ ] **Titles + descriptions for intermediate steps** (umaps, clusters, and
      ideally embeddings): let a run carry a human name/description, stored in
      its metadata JSON and editable in Setup.
- [ ] **Gallery view** of a dataset's umaps/clusterings — thumbnails + titles +
      key params/metrics — instead of a bare id list, so experiments are
      browsable at a glance.
- [ ] **Improve UMAP comparison** (builds on the existing Compare page, #27):
      side-by-side projections with shared selection/linking, and surface the
      cluster-quality metrics already computed (#111/#112) per umap.

### 4. Known regressions & bugs
- [ ] **Curation workflow (#92)** — row deletion / tagging / cluster reassignment
      was removed in 0.6. **Deferred this session.** Before 1.0, decide: re-add,
      or explicitly document as out-of-scope. Overlaps #79 (delete points during
      Setup).
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

## Issue triage

**Closable now (shipped, just need closing):** #87 (image embeddings),
#64 (ColBERT/token-level), #24 (images on the map), #47 (disable dotenv).

**Targeted for 1.0:** #63 (GPU), #92 (curation — decide), #94 (nulls — UI part),
#27 (compare umaps — folds into the experiment-gallery initiative), #38 (export
improvements), #33/#60 (docs).

**Post-1.0 / backlog:** #58 (SAE UI), #84 (binary quantization), #81 (global
UMAPs), #80 (data-ingestion Step 0), #41/#20 (more clustering / dim-reduction),
#22 (un-embed clusters), #8/#9 (direction / cluster search), #62 (notebook
widgets), #4 (asyncio job runner), #3 (API retry), #68/#67/#51 (more embedding
models), #115 (geometry-of-consolidation research).

---

## Definition of done for 1.0

1. 0.7.0 released and validated by real users / a clean external install.
2. GPU acceleration (#63) shipped with CPU fallback.
3. Curation (#92) either re-added or explicitly scoped out, with no silent
   regressions from 0.6.
4. Experiment gallery + named umaps/clusters, so multi-experiment workflows are
   navigable; UMAP comparison usable.
5. Docs site matches the actual feature set (images, ColBERT, LanceDB).
6. CHANGELOG + migration notes; `__version__` bumped to `1.0.0`; tag + PyPI.
