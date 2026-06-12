# Latent Scope Review & Plan — June 2026

Produced from a four-perspective review of `main` @ `c6eaba8` (frontend, backend/job
system, ML internals, GitHub issues). Companion to — and a challenge of —
`development-plan.md` (the v1.0 resurrection plan). See "Comparison with the old plan"
at the bottom.

---

## Headline findings

1. **The default pipeline is broken end-to-end for new datasets.** The LanceDB
   migration (PR #113) moved embedding storage out of HDF5, but `cluster.py` (EVoC, the
   default method per `jobs.py:470`) and `sae.py` still read `embeddings/{id}.h5`
   directly (`cluster.py:55-64`, `sae.py:53-56`). New embeddings exist only in LanceDB;
   migrated ones have their `.h5` *deleted* (`fc41214`). Default clustering →
   `FileNotFoundError`.
2. **The migration path can silently corrupt data.** An interrupted HDF5→LanceDB
   migration leaves a partial Lance table that (a) shadows the intact HDF5 in
   `load_embeddings` (`embedding_store.py:114`) and (b) reports `already_migrated` on
   retry (`embedding_store.py:344-346`) — truncated embeddings flow into UMAP/cluster
   with no error. Verification before deleting the HDF5 checks only the first and last
   vectors. `MIGRATIONS.md` still claims the HDF5 is not deleted.
3. **The ColBERT provider does not compute ColBERT embeddings.** Checkpoints are loaded
   via plain `SentenceTransformer`, so the 768→128 projection, `[Q]`/`[D]` markers, and
   punctuation masking are all missing (`late_interaction.py:34-110`). Stored vectors
   are raw BERT token states: 6× the intended size and not the trained late-interaction
   geometry. Token vectors are additionally stored as `list<list<double>>` (fp64) — 1M
   docs × 100 tokens at the *intended* 128-d fp16 would be ~26 GB; the current code
   stores ~614 GB. Every fix here requires re-embedding, so it gets more expensive the
   longer users accumulate late-interaction data.
4. **There is no CI.** No `.github/` directory exists. The backend has 4 test files,
   the frontend 3; the pipeline scripts, the job runner, and the entire interactive
   frontend surface have zero tests. This is how findings 1–3 shipped.
5. **The terminal-passthru/job system is the most fragile user-facing path.** Timeout
   orphans the subprocess instead of killing it (`jobs.py:109-112`); the `PROCESSES`
   dict never evicts; server restart leaves jobs stuck "running" forever; every output
   line rewrites the entire job JSON (O(n²) I/O); the client leaks polling intervals and
   silently blanks the UI on any error (`Run.jsx:10-37, 56-58`).

---

## Part 0 — CI + tracker hygiene (days; do first)

- **GitHub Actions**: one workflow running `pytest` + `ruff check` and
  `npm run lint && npm test`. (Old plan Stream 1.6 — listed, never landed.)
- Add `@vitest/coverage-v8` and a pytest-cov baseline so progress is measurable.
- **Tracker hygiene**: nothing has been closed since Dec 2024 while PRs #100–#114
  delivered big features. Close/re-scope: #61 and #27 (Compare pages, PRs #111/#114),
  #41 partial (EVoC), #97 (fixed per CLAUDE.md, still open). The old plan's PR table
  (#99/#96/#74/#47) is fully stale — all merged or superseded.

## Part 1 — Correctness triage: un-break the pipeline (P0)

- Route `cluster.py` and `sae.py` embedding reads through
  `embedding_store.load_embeddings` (fixes default EVoC clustering + SAE for all
  LanceDB-era embeddings).
- Migration hardening: write to temp table + rename; verify row count in the
  `already_migrated` branch; verify random-sample k rows (not first/last) before
  deleting the HDF5; run as a job with a lock instead of synchronously inside a Flask
  request (`datasets.py:101-109`). Update `MIGRATIONS.md` to match `fc41214`.
- Embedding ID allocation: next-ID scan looks only at `.h5`/`.json`
  (`embed.py:99-110`); a crashed run reuses the ID and appends into the half-finished
  Lance table. Also scan `lancedb/emb-*`. Fix `--rerun` partial-batch duplication
  (`embed.py:86,93,146`) — resume from exact row count.
- `bulk.py:112` chained-assignment no-op — cluster label rename never persists.
- Frontend crash: `Jobs.jsx:42` calls `navigate` without `useNavigate()`.
- Small external bugs: #89 (naive `datetime.now()` vs browser TZ — send UTC), #94
  (nulls in embed column), #95 (published-scope sliders), broken HF search debounce
  (`Embedding.jsx:111-118`).
- **Pipeline integration test** (old plan Stream 1.2, still unbuilt): tiny dataset,
  ingest → embed (small local model) → umap → cluster → scope, asserting file outputs
  and row alignment. This single test would have caught findings 1 and 2.

## Part 2 — Late interaction done right (P1; clock is ticking on re-embeds)

- **Real ColBERT**: adopt `pylate` (or apply projection + markers + punctuation masking
  manually). Store 128-d fp16 tokens. ~24× storage reduction vs current and the correct
  retrieval geometry.
- **Explicit pyarrow schema** for `token_vectors` (`list<fixed_size_list<float16>>`)
  instead of `.tolist()` fp64 inference; fix `estimate_embedding_storage` (assumes
  4 B/float — under-reports 2×, or 12× with the projection issue).
- **Column projection**: `load_embeddings` does `to_pandas()` on all columns
  (`embedding_store.py:116`) — every UMAP/stats/scope/kNN load drags the full
  token-vector payload (50–100× needed bytes). `.select(["ls_index","vector"])` +
  zero-copy arrow reshape.
- **GPU OOM**: `embed_multi` forwards the whole 100-doc batch padded to max length
  (`late_interaction.py:63-72`) — 100 × 8192 tokens for jina-colbert-v2. Sub-batch with
  length sorting.
- **Indexing**: `create_vector_index` is dead code (zero callers); no scalar index on
  `ls_index`. Create IVF-PQ + BTREE at end of embed; fixes the false ANN claim in
  MIGRATIONS.md and the per-query full scans.
- **Write path**: one Lance fragment per 100-row add → 10k fragments per 1M rows, no
  compaction anywhere. Buffer ≥10k rows per add, `tbl.optimize()` at end of run, reuse
  the connection.
- **MaxSim recall**: prefilter uses the mean-pooled vector with a fixed limit of 200
  (`embedding_store.py:244-249`) — systematically misses rare-token matches, the core
  late-interaction use case. Per-query-token candidate union or N-scaled limit.

## Part 3 — Job system / terminal passthru overhaul (P1)

Backend (`latentscope/server/jobs.py`):
- `process.kill()` on the 5-min no-output timeout (currently the child runs on,
  holding the GPU, while the UI says "error"); `PROCESSES.pop(job_id)` in `finally`.
- Startup reconciliation: persist the PID in the job file; on server start, mark stale
  `running` jobs dead so the UI doesn't poll forever.
- Replace per-line full-JSON rewrite (`jobs.py:106-107`) with an append-only log +
  throttled state writes + capped retained lines (job JSON currently grows unbounded
  and is re-downloaded every 500 ms).
- Security: `_safe_dataset()` validator (query/body params can contain `../` —
  `jobs.py:157,141`, `datasets.py:71-76`); `secure_filename` on ingest upload
  (`jobs.py:180-181`); `--` separators against argv option injection; convert
  state-mutating GETs (`/jobs/kill`, `/tags/add`, `meta/update`, …) to POST; JSON
  `@app.errorhandler` instead of HTML 500s.
- Run under waitress/gunicorn; move heavy in-request metrics (silhouette,
  compare-clusters, SAE feature scans) into jobs so they stop blocking status polls.
- Then, optionally: SSE instead of 500 ms polling (nice-to-have once state writes are
  cheap; polling is acceptable).
- **Job-runner tests**: spawn/stream/timeout/kill/rerun — currently zero.

Frontend:
- Rewrite `useStartJobPolling` as an effect-managed hook with cleanup (today it leaks
  intervals after unmount, and `pages/Job.jsx:31-43` starts a second concurrent
  poller); persist last job + error in state and render an error banner instead of
  silently blanking the terminal view (`Run.jsx:10-37`).

## Part 4 — Frontend health (P2, parallel with Part 3)

- **Central fetch layer**: status checks (2 `response.ok` checks across ~70 call
  sites), AbortController (zero in the tree), stale-response guards, and surfaced
  errors — the Explore page currently hangs on "Loading..." forever if the scope fetch
  fails (`ScopeContext.jsx:19-30`). Encode params via `URLSearchParams` (4 endpoints
  interpolate raw user text).
- **Dedupe**: merge the two `FilterDataTable` implementations (~200 copy-pasted lines),
  duplicate `FeaturePlot`/`FeatureModal`, and pick one scatter engine
  (regl-scatterplot vs hand-rolled `ScatterGL`). Delete orphans (`UmapScatter.jsx`,
  `lib/DuckDB.js`, dead `userId` threading), fix phantom deps (`prop-types`, `d3-*`,
  `regl` undeclared; `react-window`, `@tanstack/*`, `flubber` unused).
- **Filter pipeline races**: monotonic request token in `applyFilter`
  (`FilterContext.jsx:118-174`); split the god-context (filter state / row fetching /
  URL sync).
- **Render perf**: per-mousemove `findIndex` over all points (`ScatterGL.jsx:433`) —
  store index in the quadtree datum; partial GPU buffer updates instead of 4-buffer
  re-upload per page change; `Set` for `deletedIndices`; replace the body-wide
  `MutationObserver` (`FullScreenExplore.jsx:207-218`) with a container
  ResizeObserver; route-level `React.lazy` + dynamic hyparquet import (kills the
  top-level-await boot blocker).
- **Tests**: filter hooks for real (their own context test mocks them out), job
  polling hook, Explore happy path with fetch mocks, Setup wizard transitions.
- a11y baseline (`eslint-plugin-jsx-a11y`, keyboard paths, alt text) + `no-console`
  (114 stray logs).

## Part 5 — Memory & storage efficiency (P2, woven through 2–4)

- LRU-cap the unbounded server caches (`app.config['DATAFRAMES']`,
  `search.py:17-21` module globals holding full kNN matrices + GPU models forever).
- Prefer LanceDB search over the sklearn fallback that materializes and copies the full
  N×D matrix per dataset.
- **Scope storage**: every saved scope writes a full copy of the input parquet *and* a
  full copy of the embedding matrix (`scope.py:60, 264-269`) — k scopes = k duplicates.
  Reference the `emb-*` table; store scope-local columns only.
- `embed.py` holds 2 full text copies (`embed.py:135-144`) — iterate; `sae.py:65`
  moves the whole embedding matrix to GPU before batching — move per-batch;
  `scope.py:227` per-row `.loc` → vectorized merge.

## Part 6 — New modalities: images, then code (P2/P3)

- **Images (#87 + #24, the only externally-demanded feature)**: ingest already flags
  image columns (`ingest.py:144-153`) but nothing consumes them; the ColPali provider
  is a text-only stub using the wrong hidden states and isn't registered. Needs: image
  loader in `embed.py`, CLIP/SigLIP/DINOv2 providers (+ a real ColPali via the Part 2
  machinery), registry entries, then thumbnails/sprite-sheets on the map. Sequence
  after Part 2 — image multi-vector models reuse the same token-vector storage path,
  so fix that storage once, first.
- **Code**: no open issue exists. Mostly works today via the `huggingface-` dynamic
  prefix and `voyage-code-3`. Cheap wins: registry entries for code embedders, a
  tutorial, code-aware chunking later. File the issue to make the gap visible.
- Easy model adds: Model2Vec (#68) is a ~2-line provider change.

## Part 7 — Scale (P3, ongoing; aligns with gsv/latent-basemap work)

- cuML for UMAP/HDBSCAN when an NVIDIA GPU is present (#63) — umap-learn is the first
  hard wall (~1–2M rows, 30 GB matrix, days of compute at 5M+).
- Binary quantization (#84) — compounds with late-interaction storage.
- Tiled heatmap (#85) / sampling for browser-side scale (#33's ~2M regl ceiling).
- Global/parametric UMAPs (#81) — direct overlap with latent-basemap; potential shared
  code.

## Sequencing

```
Part 0 (CI)  ──► Part 1 (un-break) ──► Part 2 (late interaction) ──► Part 6 (images)
                      │
                      ├──► Part 3 (job system)   ─┐ parallel
                      └──► Part 4 (frontend)      ─┘
Part 5 woven through 2–4.  Part 7 ongoing/longer horizon.
```

---

## Comparison with `development-plan.md` (the old plan)

**What it got right — and largely delivered.** The old plan was a modernization plan
(tests-first scaffolding, app factory, shell=True fix, uv/pyproject, frontend cleanup,
compare pages) and PRs #100–#114 executed maybe 70% of it. Its unfinished items that
remain valid: pipeline integration tests (1.2), CI (1.6), frontend consolidation (3),
and the agent-friendly pipeline/unified CLI (Stream 4 — genuinely good idea, kept
below).

**Where it must be challenged:**

1. **It predates its own biggest risk.** The plan's "What Works: full pipeline" is no
   longer true — the LanceDB migration, done *under* the plan, broke the default
   clustering path, the SAE path, and introduced a delete-the-source migration with
   thin verification. A plan whose baseline says "the project works" will misallocate
   effort toward polish while the pipeline 500s on defaults.
2. **"Tests first" partially failed in practice and the plan doesn't notice.** Stream 1
   checked off scaffolding (conftest, 40 server tests) but the two highest-risk items
   — pipeline integration tests and CI — were deferred, and every subsequent feature PR
   merged untested. The lesson encoded in my Part 0/1 ordering: CI and one e2e pipeline
   test outrank all remaining refactors.
3. **Security framing is outdated.** It declares the job runner secure after the
   `shell=True` fix; path traversal via query params, argv option injection, mutating
   GETs behind `CORS *`, and unsanitized upload filenames all remain.
4. **The job runner is treated as a checkbox, not a stream.** Beyond injection, the
   runner orphans processes on timeout, zombifies on restart, does O(n²) I/O, and the
   client silently eats errors. Terminal passthru is the backbone of the entire Setup
   UX and deserves its own work stream (Part 3).
5. **It has no ML dimension at all.** It is an engineering-hygiene plan: nothing on
   late-interaction correctness, storage formats, fp precision, indexing, scope-storage
   duplication, scale ceilings, or a modality roadmap. Parts 2/5/6/7 have no
   counterpart in it — and those are where the project's research value lives.
6. **Its issue/PR tables are stale** (lists open PRs that merged a year+ ago; counts
   34 issues; marks #97 fixed in CLAUDE.md while the issue sits open). Tracker hygiene
   is now itself a deliverable (Part 0).
7. **Stream 4 (agent pipeline / unified CLI) — keep, but re-sequence.** It's the best
   idea in the old plan and absent from my parts as near-term work, deliberately: an
   agent-facing `latentscope.run(config)` wrapped around a pipeline that errors on
   default settings automates failure. Slot it after Parts 1–2.
8. **Amend the v1.0 success criteria.** Criterion #1 should be: *a fresh dataset runs
   ingest → embed → umap → cluster → label → scope end-to-end with default settings,
   in CI, on every PR.* Today that fails at the cluster step.

**Disposition:** retire `development-plan.md` as substantially executed; carry forward
its Streams 1.2, 1.6, and 4 into Parts 0/1 and a post-Part-2 slot; adopt this plan for
the next cycle.
