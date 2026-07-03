---
name: latent-scope
description: Use Latent Scope to turn a user's dataset (text or images) into an explorable latent-space map — embed, project to 2D, cluster, label, and serve an interactive scatter. Invoke when a user wants to explore, cluster, visualize, or search the structure of a corpus/table, or asks to "run latent scope" / "map my data" / "show me the clusters".
---

# Latent Scope

**The full runbook is [`AGENTS.md`](../../../AGENTS.md) at the repo root — read it.**
It's the cross-provider source of truth (shared with Codex and other agents); this
file just makes the skill auto-discoverable in Claude Code and gives the fast path.

## When to use
A user has a table/corpus of text or images and wants to *see its structure* —
clusters, themes, outliers, similarity — not just a single number.

## Fast path (drive it for the user)
```bash
export LATENT_SCOPE_DATA=~/latent-scope-data HF_HOME=~/hf-cache
uv run ls-ingest  mydata --path data.csv --text_column text
uv run ls-embed   mydata text huggingface-jinaai___jina-embeddings-v5-text-nano
uv run ls-umap    mydata embedding-001 25 0.1
uv run ls-cluster mydata umap-001 25 5 0.0 --method hdbscan
uv run ls-scope   mydata embedding-001 umap-001 cluster-001 default "My scope" "desc"
uv run ls-serve   $LATENT_SCOPE_DATA          # http://localhost:5001 — show the user
```
(`ls-cluster` auto-writes `default` labels, so no LLM is required for a first map.)

## The five things that trip agents up (details in AGENTS.md)
1. **Embedding is slow on a loaded CPU** — check `uptime`/`nvidia-smi` first; use GPU (`LATENT_SCOPE_DEVICE=cuda` + `latentscope[gpu]`), a Mac (MPS is automatic), or a small model (`bge-small`).
2. **jina-v5 is task-conditioned** — it auto-defaults to `task=retrieval` (override with `--task`), auto-applies the document prompt, and needs `peft`. Leave `--prefix` blank.
3. **Model ids** are `huggingface-<org>___<model>` (`/`→`___`, no emoji). HF search accepts any sentence-transformers model.
4. **`ls-serve` serves the pre-built UI** (`latentscope/web/dist`); frontend source changes need a rebuild first.
5. **Verify before claiming success** — hit the API (`/api/datasets/<ds>/scopes`) or screenshot `…/explore/<scope>` and confirm the map renders.

## Images
Ingest (image column auto-detected) → `ls-embed <ds> <image_col> clip-openai___clip-vit-base-patch32` → umap → cluster → scope → `ls-sprite-atlas <ds> <scope> <image_col>`.
