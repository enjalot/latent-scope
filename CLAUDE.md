# CLAUDE.md — Latent Scope

This file provides guidance for AI agents (Claude Code and others) working on this codebase.

---

## Project Overview

Latent Scope is a Python + React tool for embedding, projecting, clustering, and exploring text datasets. The backend is a Flask server; the frontend is a React/Vite SPA. Pipeline steps (ingest → embed → umap → cluster → label → scope) are run as CLI subprocesses via the web UI.

See `development-plan.md` for the current v1.0 roadmap and work stream status.

---

## Repository Layout

```
latentscope/           # Python package
  __init__.py          # Public API (lazy imports for heavy deps)
  __version__.py
  models/              # Embedding + chat model providers
    __init__.py        # get_embedding_model(), get_chat_model()
    providers/         # openai, transformers, cohere, voyage, etc.
    embedding_models.json
    chat_models.json
  scripts/             # Pipeline step implementations
    ingest.py, embed.py, umapper.py, cluster.py,
    label_clusters.py, scope.py, ...
  server/              # Flask application
    app.py             # create_app() factory
    jobs.py            # Subprocess job runner + routes
    datasets.py, search.py, tags.py, bulk.py, admin.py, models.py
  util/
    configuration.py   # LATENT_SCOPE_DATA, API keys, dotenv helpers
    __init__.py
web/                   # React + Vite frontend
tests/                 # pytest test suite
  conftest.py          # Fixtures: tmp_data_dir, app, client, ...
  test_configuration.py
  test_models.py
  test_server.py
pyproject.toml         # pytest + ruff config
setup.py               # Package build (migration to pyproject.toml pending)
development-plan.md    # v1.0 work streams and status
DEVELOPMENT.md         # Developer setup guide
```

---

## Key Design Decisions

### App Factory Pattern
`latentscope/server/app.py` uses `create_app(data_dir, read_only)`. The data directory is stored in `app.config['DATA_DIR']` — **not** in module-level globals. All blueprints read it via `current_app.config['DATA_DIR']`. This makes the server testable and embeddable.

### Lazy Imports in `__init__.py`
Heavy ML dependencies (torch, transformers, umap-learn, hdbscan) are only imported when their functions are actually called. This allows `import latentscope` (e.g. to start the server or use config utilities) without requiring the full ML stack.

### Job Runner Security
`latentscope/server/jobs.py` runs CLI subprocesses. **Always use list-based commands, never `shell=True`.** Command arguments include user-supplied values (dataset names, file paths) that are vulnerable to shell injection when passed to a shell. Example:
```python
# CORRECT
command = ['ls-embed', dataset, text_column, model_id]
subprocess.Popen(command, ...)

# NEVER DO THIS
command = f'ls-embed "{dataset}" "{text_column}" "{model_id}"'
subprocess.Popen(command, shell=True)  # injection risk
```

### Configuration
`LATENT_SCOPE_DATA` environment variable (or `.env` file) sets the data directory. `latentscope/util/configuration.py` owns all env/dotenv logic. Call `update_data_dir()` to set the data dir, `set_api_key()` to set provider API keys.

---

## Running Tests

```bash
pip install pytest python-dotenv flask flask-cors
python -m pytest tests/ -q
```

Fixtures in `tests/conftest.py`:
- `tmp_data_dir` — temporary directory (auto-cleaned)
- `app` / `client` — Flask test app and client pointing at `tmp_data_dir`
- `readonly_app` / `readonly_client` — read-only variants

---

## Linting & Formatting

```bash
pip install ruff
ruff check latentscope/          # lint
ruff check --fix latentscope/    # auto-fix
ruff format latentscope/         # format
```

Config is in `pyproject.toml`. Line length 100, rules: E/W/F/I/UP.

---

## Adding New Models

- **Embedding models:** Add entry to `latentscope/models/embedding_models.json`, add provider class in `latentscope/models/providers/` if new provider.
- **Chat models:** Add entry to `latentscope/models/chat_models.json`.
- Model IDs must not contain emoji (use provider prefix strings like `huggingface`, `openai`, etc.). HuggingFace model IDs use `transformers-` prefix with `___` replacing `/`.

---

## Work Stream Status

See `development-plan.md` for the full plan. Current branch (`claude/modernize-backend-foundation-ZfNU2`) completed:

- ✅ App factory pattern + blueprint dependency injection (Stream 2.6)
- ✅ Shell injection fix in jobs.py — list-based commands, no shell=True (Stream 2.2)
- ✅ HuggingFace emoji bug fix (#97) (Stream 2.7)
- ✅ Lazy imports in `__init__.py` (Stream 2.1 partial)
- ✅ Foundational test infrastructure: 40 tests passing (Stream 1.1, 1.4 partial)
- ✅ ruff configuration in pyproject.toml (Stream 2.1)

Still needed before v1.0:
- Pipeline integration tests (Stream 1.2)
- CI/CD GitHub Actions (Stream 1.6)
- Full pyproject.toml migration from setup.py (Stream 2.1)
- Frontend cleanup (Stream 3)
- Agent-friendly pipeline API (Stream 4)
