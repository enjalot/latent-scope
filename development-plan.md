# Latent Scope Development Plan — v1.0 Resurrection

## Context

Latent-scope has been relatively dormant since v0.6.0 (Feb 2025). There are 34 open issues, 4 open PRs, accumulated tech debt, and no automated tests. The project works — it has a functional pipeline, a usable web UI, and a library API — but it needs modernization to support the next phase of development. This plan targets a **v1.0 major version bump**.

The plan is organized into **independent work streams** that can be executed in parallel by different agents or contributors. Testing comes first to lock in current behavior before any refactoring begins.

---

## Current State

### What Works
- Full pipeline: ingest → embed → umap → cluster → label → scope
- Library API: `latentscope.ingest()`, `.embed()`, `.umapper()`, `.clusterer()`, `.labeler()`, `.scope()`
- 13 CLI commands (`ls-serve`, `ls-embed`, `ls-umap`, etc.)
- Flask web server with React frontend (V2 explore UI)
- File-based data management (Parquet, HDF5, JSON metadata)
- 7 embedding model providers, 12+ chat models
- Vector search (sklearn + LanceDB)

### What Needs Work
- **No tests** — zero automated tests for backend or frontend
- **No CI/CD** — no GitHub Actions, no automated quality gates
- **Security** — shell injection vulnerability in job runner (`jobs.py` uses `shell=True`)
- **Dead code** — V1→V2 frontend migration left unused components, ~20 console.logs, commented-out code
- **Backend code duplication** — utility functions duplicated across scripts
- **Inconsistent patterns** — mix of apiService and raw fetch on frontend, print() vs no logging on backend
- **Packaging** — still uses setup.py instead of pyproject.toml
- **No agent-friendly interface** — pipeline requires manual step-by-step orchestration

### Key Metrics
- **Backend:** ~5,534 lines Python across 38 files, 19+ TODO comments
- **Frontend:** ~12,400 lines JS/JSX across 80+ files, 18+ TODO comments, ~20 console.logs
- **Issues:** 34 open (3 bugs, 7 embedding-related, 4 clustering, 4 projection, 5 data/curation, 4 UI, 3 infra, 3 docs, 1 support)
- **PRs:** 4 open (2 active, 2 stale)

---

## Open Issues by Category

### Bugs (fix in this cycle)
| # | Title | Notes |
|---|-------|-------|
| 95 | Sliders not working on Explore page | Frontend bug |
| 97 | HuggingFace emoji in model names causes UnicodeEncodeError | Windows charset issue |
| 89 | Job run time consumption error (timezone bug) | Server/browser timezone mismatch in Progress.jsx |

### Embedding Models & Providers
| # | Title | Notes |
|---|-------|-------|
| 94 | Handle null values in embedding column | Detect and handle NULLs/empty strings |
| 87 | Support image embeddings in Setup | First-class image embedding support |
| 68 | Support Model2Vec | Fast distilled embeddings |
| 67 | Support cde-small-v1 | Context-aware embedding model |
| 64 | Support token-level embeddings (ColBERT) | Multi-vector approach |
| 51 | Add GloVe/word2vec embedding option | Classic word embeddings |

### Dimensionality Reduction & Projection
| # | Title | Notes |
|---|-------|-------|
| 81 | Global UMAPs | Train reusable UMAPs tied to embedding models |
| 63 | Accelerate UMAP & Clustering with GPU (cuML) | NVIDIA GPU acceleration |
| 27 | Compare two UMAPs interactively | Side-by-side comparison |
| 20 | Add additional dim-reduction methods (t-SNE, PCA, PHATE) | More projection options |

### Clustering
| # | Title | Notes |
|---|-------|-------|
| 41 | Add additional clustering algorithms (k-means, GMM, etc.) | Beyond HDBSCAN |
| 61 | Compare two Clusterings interactively | Parallel comparison |
| 22 | Un-embed clusters (vec2text) | Alternative to summarizing |
| 9 | Cluster search (sim-search against clusters) | Search by cluster similarity |

### Data Ingestion, Curation & Export
| # | Title | Notes |
|---|-------|-------|
| 80 | Step 0: Data ingestion setup | Better error handling and column detection |
| 79 | Delete points during Setup | Remove bad data from preview |
| 92 | Curation workflow | Re-add row deletion, cluster reassignment, tagging (removed in 0.6) |
| 38 | Export file improvements | Include tags, make scope+input combo on-demand |
| 84 | Binary quantization of embeddings | 32x storage reduction |

### UI / Visualization
| # | Title | Notes |
|---|-------|-------|
| 85 | Tiled heatmap visualization | Density heatmap overlay |
| 58 | SAE UI in Explore Page | Feature filtering, visualization, steering |
| 8 | Direction search | Latent-space "directions" from pos/neg examples |

### UX & Workflow
| # | Title | Notes |
|---|-------|-------|
| 26 | 1-step Setup option | One-click setup with sane defaults |
| 62 | In-notebook UX: Jupyter widgets | Run directly in Jupyter |
| 77 | Count tokens when embedding | Surface token counts |

### Infrastructure / Backend
| # | Title | Notes |
|---|-------|-------|
| 4 | Update job runner to asyncio | Replace subprocess.Popen |
| 3 | Retry API calls with network errors | Auto-retry on timeouts |
| 91 | Anaconda compatibility question | Support question |

### Documentation
| # | Title | Notes |
|---|-------|-------|
| 60 | Tutorials: Data importing | Vector DBs, sqlite-vec, HuggingFace |
| 33 | Data size limitations | Document scaling limits |
| 24 | Support for Images? | Overlaps with #87 |

### Open PRs
| # | Title | Status | Notes |
|---|-------|--------|-------|
| 99 | Cluster labels panel enhancements | Draft, active | Tab view for cluster labels, spatial sort |
| 96 | Custom Embedding Models via OpenAI-compatible APIs | Active | Configurable self-hosted/third-party models |
| 74 | Add Cypress e2e tests | Stale (16mo) | Good intent, approach may need modernizing |
| 47 | Permit disabling dotenv for read-only | Stale (20mo) | Docker/read-only environment support |

---

## Work Streams

### Stream 1: Test Harness (DO FIRST)
**Goal:** Lock in current behavior with tests before changing anything.
**Branch:** `test/foundation`

#### 1.1 Python Test Setup ✅ DONE
- ✅ Set up pytest with conftest.py and fixtures (`tmp_data_dir`, `app`, `client`, `readonly_app`, `readonly_client`)
- ✅ Added `pyproject.toml` with pytest + ruff configuration
- ✅ Created `tests/__init__.py`
- Fixture for small test dataset (10-50 rows) through full pipeline — deferred to 1.2

#### 1.2 Pipeline Integration Tests
Test each stage end-to-end with real (small) data:
- `test_ingest.py` — CSV/JSON/Parquet ingestion, column detection, metadata generation
- `test_embed.py` — Embedding with a small local model (sentence-transformers)
- `test_umap.py` — UMAP projection, output format verification
- `test_cluster.py` — HDBSCAN clustering, output format verification
- `test_label.py` — Cluster labeling (mock the LLM API call)
- `test_scope.py` — Scope creation, verify all outputs exist and are consistent
- `test_pipeline_e2e.py` — Full pipeline from ingest to scope

#### 1.3 Library API Tests
- Test the public API surface: `latentscope.ingest()`, `.embed()`, `.umapper()`, `.clusterer()`, `.labeler()`, `.scope()`
- Verify return values and side effects (files created, metadata written)

#### 1.4 Server API Tests ✅ DONE (foundational)
- ✅ Set up Flask test client (`tests/test_server.py` — 40 tests passing)
- ✅ Tests cover app factory, version, datasets, settings, jobs, tags, models routes
- Remaining: search, file serving, bulk operations endpoints

#### 1.5 Frontend Test Setup
- Set up Vitest (matches Vite ecosystem)
- Test apiService methods with mocked fetch
- Test critical React contexts (ScopeContext, FilterContext) with test data

#### 1.6 CI Pipeline
- GitHub Actions workflow: run Python tests + JS tests on every PR
- Lint checks (ruff for Python, ESLint for JS)

---

### Stream 2: Backend Design & Refactoring
**Goal:** Clean, secure, well-structured Python backend with modern packaging.
**Branch:** `refactor/backend` / `claude/modernize-backend-foundation-ZfNU2`
**Depends on:** Stream 1 (tests must exist to verify refactoring doesn't break things)

#### 2.1 Packaging Modernization ✅ PARTIALLY DONE
- ✅ Added `pyproject.toml` with pytest + ruff configuration
- ✅ Lazy imports in `__init__.py` (server deps no longer require ML packages)
- Remaining: migrate full package metadata from `setup.py` to `pyproject.toml` (add `[project]`, `[project.optional-dependencies]` with `dev`, `test`, `gpu`, `all-providers` groups)

#### 2.2 Security Fix: Job Runner ✅ DONE
- ✅ Replaced `shell=True` with argument list-based `subprocess.Popen` in `jobs.py`
- ✅ All 14 command builders converted from f-string to list construction
- ✅ `rerun_job` handles both legacy string format and new list format
- ✅ Added `try/except` around `Popen` for missing executable errors
- Timeout still hardcoded at `jobs.py:15` (TIMEOUT = 300) — deferred

#### 2.3 Shared Utilities Extraction
Deduplicate code that exists in multiple places:
- `calculate_point_size()` — duplicated in `scripts/umapper.py:37` and `scripts/cluster.py:22`
- `chunked_iterable()` — duplicated in `scripts/embed.py:23` and `scripts/label_clusters.py:23`
- File-finding regex patterns (e.g., `re.match(r"embedding-\d+\.h5", f)`) — duplicated in 5+ files
- Embedding loading — shared between umapper.py, search.py, scope.py
- Target: `latentscope/util/data.py` and `latentscope/util/embeddings.py`

#### 2.4 Logging & Observability ✅ PARTIALLY DONE
- ✅ Removed debug `print()` from jobs.py, app.py, admin.py, configuration.py, models/__init__.py
- ✅ `get_data_dir()` now raises `RuntimeError` instead of `sys.exit()` (library-safe)
- Remaining: Replace remaining `print()` with Python `logging` module; configure log levels

#### 2.5 Server Improvements
- Add LRU eviction to global caches in `app.py` (DATAFRAMES, DATASETS, EMBEDDINGS, FEATURES, DBS — all unbounded)
- Add basic thread safety for concurrent requests
- Deprecate `/api/indexed` in favor of `/query` (noted in app.py:94 TODO)

#### 2.6 Configuration Cleanup ✅ MOSTLY DONE
- ✅ Unified `set_api_key(key_name, value)` with validation; per-provider helpers wrap it
- ✅ Application factory pattern: DATA_DIR in `app.config`, not module-level globals
- ✅ Centralized `load_dotenv` in configuration.py (no repeated calls across modules)
- Remaining: Make hardcoded values configurable (Ollama URL, search result batch sizes); JSON metadata schema validation

#### 2.7 Code Cleanup ✅ PARTIALLY DONE
- ✅ Docstrings added to public API (`__init__.py`, `models/__init__.py`, `configuration.py`)
- ✅ HuggingFace emoji bug (#97) fixed: provider key changed from '🤗' to 'huggingface', backward compat preserved
- ✅ App factory pattern: all 7 blueprints use dependency injection via `current_app.config`
- Remaining: Resolve 15+ TODO/FIXME comments; remove remaining dead code paths

---

### Stream 3: Frontend Design & Refactoring
**Goal:** Clean, consistent React frontend with V1 dead code removed and solid patterns.
**Branch:** `refactor/frontend`
**Depends on:** Stream 1 (tests should exist for critical paths)

#### 3.1 V1 Dead Code Removal
- Audit `components/Explore/` — remove V1 components superseded by V2
- Remove commented-out code (~20 locations identified across contexts and components)
- Remove ~20+ console.log() debug statements
- Remove unused imports and PropTypes declarations

#### 3.2 API Layer Consolidation
- Migrate all raw `fetch()` calls in ScopeContext and FilterContext to apiService
- Add consistent error handling to all apiService methods
- Add at least one error boundary component wrapping the main app sections

#### 3.3 Bug Fixes
- **#95:** Sliders not working on Explore page
- **#89:** Timezone mismatch in job progress (Progress.jsx)
- **#97:** Emoji in model names (may need backend fix too)
- Fix `cluster_labels_lookup` mutation bug (ScopeContext.jsx:132)

#### 3.4 Dependency Cleanup
- Upgrade `react-data-grid` from 7.0.0-beta to stable
- Remove deprecated `request@2.88.2`
- Audit for unused packages

#### 3.5 Styling Consistency
- Establish one styling approach (recommend CSS modules throughout)
- Convert inline styles and mixed .css/.scss/.module.scss to consistent pattern
- No need for a full design system — just consistency

#### 3.6 Component Patterns
- Consistent memoization strategy (useMemo/useCallback where it matters for renders)
- Fix large components (FullScreenExplore.jsx has 7+ useState + 8+ useEffect — consider extracting custom hooks)
- PropTypes on all public components (or remove them entirely and rely on JSDoc)

---

### Stream 4: Agent-Friendly Pipeline
**Goal:** Make latent-scope usable by AI agents with a codified pipeline interface.
**Branch:** `feature/agent-pipeline`
**Depends on:** Stream 2 (clean backend utilities) — but can start design work immediately

#### 4.1 Pipeline Orchestrator
- Create `latentscope/pipeline.py` — single entry point for full or partial pipeline runs
- Accept a config dict/dataclass:
  ```python
  config = {
      "text_column": "text",
      "embedding_model": "transformers-BAAI___bge-small-en-v1.5",
      "umap": {"n_neighbors": 25, "min_dist": 0.1},
      "cluster": {"min_samples": 5},
      "label_model": "openai-gpt-4o-mini",
  }
  latentscope.run(dataset_id, config)
  ```
- Support partial runs: re-cluster without re-embedding, re-label without re-clustering
- Return structured results with paths and summary statistics

#### 4.2 Pipeline Configuration
- JSON schema for pipeline configuration
- Preset configurations: "quick" (small model, fast), "thorough" (large model, tuned), "large-dataset" (batched, GPU-friendly)
- Validation before running (check API keys, model availability, data compatibility)

#### 4.3 Unified CLI
- Single `latentscope` command with subcommands:
  - `latentscope run <config>` — run pipeline from config
  - `latentscope status <dataset_id>` — show pipeline state
  - `latentscope list` — show datasets and scopes
  - `latentscope serve` — start web server
- Keep old `ls-*` commands as aliases for backwards compatibility

#### 4.4 Agent Skill Interface
- Define a Claude Code skill for latent-scope pipeline interaction
- Skill covers: dataset inspection, pipeline configuration, execution, result exploration
- Natural language interface for common operations
- Structured output for agent consumption

---

### Stream 5: Maintainer Tooling (Separate from OSS)
**Goal:** Publishing, release management, and project maintenance tools.
**Location:** `.claude/commands/` and `scripts/maintainer/` (both gitignored)

#### 5.1 Release Workflow
Script that handles the full release process:
- Bump version in `__version__.py` (and pyproject.toml after migration)
- Generate/update changelog from git log
- Build wheel (run build.sh or equivalent)
- Create annotated git tag
- Push tag (triggers CI release workflow from Stream 1.6)
- Create GitHub Release with auto-generated notes
- Verify PyPI publication

#### 5.2 Project Management Helpers
- Issue triage report: categorize open issues, flag stale, identify overlaps
- PR review helper: summarize changes, check CI status, suggest reviewers
- Dependency audit: check for outdated/vulnerable packages

#### 5.3 Claude Code Commands
Custom slash commands in `.claude/commands/`:
- `/release` — interactive release flow
- `/triage` — review open issues and PRs
- `/update-models` — add new embedding/chat models to JSON configs
- `/check-deps` — audit Python and JS dependencies

---

## Execution Order

```
                    ┌─────────────────────┐
                    │  Stream 1: Tests     │ ← START HERE
                    │  (lock in behavior)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
              ▼                ▼                 ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ Stream 2:       │ │ Stream 3:    │ │ Stream 5:        │
    │ Backend Design  │ │ Frontend     │ │ Maintainer Tools │
    │ & Refactoring   │ │ Design &     │ │ (independent)    │
    │                 │ │ Refactoring  │ │                  │
    └────────┬────────┘ └──────────────┘ └──────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ Stream 4:       │
    │ Agent Pipeline  │
    │ (needs clean    │
    │  backend)       │
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ CLAUDE.md       │
    │ (codify the     │
    │  settled design)│
    └─────────────────┘
```

**Phase 1:** Stream 1 (Tests) + Stream 5 (Maintainer Tools) — can run in parallel
**Phase 2:** Streams 2, 3 — can run in parallel once tests exist
**Phase 3:** Stream 4 — after backend is cleaned up
**Final:** Write CLAUDE.md to codify the design decisions that emerged from Streams 2-4

---

## PR Strategy

Each stream gets its own long-lived branch and produces one or more PRs. Sub-tasks within a stream can be individual commits or smaller PRs that merge into the stream branch.

**Merge order:**
1. Stream 1 (tests) — merge first, everything else depends on it
2. Stream 5 (maintainer tools) — merge anytime, independent
3. Streams 2 + 3 (backend + frontend refactoring) — merge next
4. Stream 4 (agent pipeline) — merge after clean backend
5. CLAUDE.md — final PR after design settles

---

## Success Criteria for v1.0

- [ ] Full test suite passing (pipeline, API, server, frontend critical paths)
- [ ] CI/CD running on all PRs and releases
- [ ] Zero known security vulnerabilities (shell injection fixed)
- [ ] No dead code from V1→V2 migration
- [ ] All 3 known bugs fixed (#95, #89, #97)
- [ ] pyproject.toml with proper dependency management
- [ ] Agent-friendly pipeline API with unified CLI
- [ ] CLAUDE.md documenting settled architecture
- [ ] Clean release published to PyPI
