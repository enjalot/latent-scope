---
name: latent-scope
description: Use Latent Scope to turn a user's dataset (text or images) into an explorable latent-space map — embed, project to 2D, cluster, label, and serve an interactive scatter. Invoke when a user wants to explore, cluster, visualize, or search the structure of a corpus/table/folder of images, or asks to "run latent scope" / "map my data" / "show me the clusters".
---

# Latent Scope

**The full runbook is [`AGENTS.md`](../../../AGENTS.md) at the repo root — read it.**
It's the cross-provider source of truth (shared with Codex and other agents); this
file just makes the skill auto-discoverable in Claude Code and gives the fast path.

## When to use
A user has a table/corpus of text, or a folder of images, and wants to *see its
structure* — clusters, themes, outliers, similarity — not just a single number.

## Fast path — text (drive it for the user)
```bash
export LATENT_SCOPE_DATA=~/latent-scope-data HF_HOME=~/hf-cache
uv run ls-ingest  mydata --path data.csv --text_column text
uv run ls-embed   mydata text huggingface-jinaai___jina-embeddings-v5-text-nano
uv run ls-umap    mydata embedding-001 25 0.1
uv run ls-cluster mydata umap-001 25 5 0.0 --method hdbscan
uv run ls-scope   mydata embedding-001 umap-001 cluster-001 default "My scope" "desc"
uv run ls-serve   $LATENT_SCOPE_DATA          # http://localhost:5001 — show the user
```
(`ls-cluster` auto-writes `default` labels, so no LLM is required for a first map.
HDBSCAN/EVoC noise becomes an explicit "Unclustered" cluster — that's expected,
not a bug; `--assign-noise` restores nearest-centroid reassignment.)

## Fast path — images (point at a folder)
```bash
uv run ls-ingest       shots --path ~/Desktop     # a directory ⇒ image dataset (bytes + filename/date/size_kb)
uv run ls-embed        shots image clip-openai___clip-vit-base-patch32   # MPS/GPU automatic
uv run ls-umap         shots embedding-001 25 0.1
uv run ls-cluster      shots umap-001 25 5 0.0 --method hdbscan
uv run ls-scope        shots embedding-001 umap-001 cluster-001 default "Shots" "desc"
uv run ls-sprite-atlas shots scopes-001 image      # image-map tiles — do not skip
uv run ls-serve        $LATENT_SCOPE_DATA
```
Images referenced from a *table* must be raw bytes / HF dicts or `http…` URLs —
**local file paths are not detected as images**; point ingest at the folder instead.

## The five things that trip agents up (details in AGENTS.md)
1. **A source checkout has no built web UI** — `ls-serve`'s API works but UI
   routes return 503 (older: JSON 404). Build once: `cd web && npm install &&
   npm run production && cd .. && mkdir -p latentscope/web/dist && cp -r
   web/dist/production/* latentscope/web/dist/` (no restart needed; `npm ci`
   may fail — use `npm install`). Pip-installed latentscope ships it pre-built.
2. **Embedding is slow on a loaded CPU** — check `uptime`/`nvidia-smi` first; use GPU (`LATENT_SCOPE_DEVICE=cuda` + `latentscope[gpu]`), a Mac (MPS is automatic), or a small model (`bge-small`).
3. **jina-v5 is task-conditioned** — it auto-defaults to `task=retrieval` (override with `--task`), auto-applies the document prompt, and needs `peft`. Leave `--prefix` blank.
4. **Model ids** are `huggingface-<org>___<model>` (`/`→`___`, no emoji). HF search accepts any sentence-transformers model.
5. **Verify before claiming success** — `GET /api/datasets/<ds>/scopes`; for
   images `GET …/scopes/<scope>/atlas/status?column=<image_col>` (param is
   `column`) → `"generated": true`; `curl -sw '%{http_code}' localhost:5001/`
   must be 200; best: screenshot `…/explore/<scope>` and confirm the map renders.
