# Example datasets

Reproducible build recipes for the published Latent Scope demo datasets (the
`enjalot/ls-*` Hugging Face repos linked from the top-level README), plus the
`marqo-ge-sample` image showcase.

Each `<name>/build.sh` records the **provenance and exact pipeline** for one
demo, so anyone can regenerate it in the current (1.0) data format and republish
it with `ls-upload-dataset`. This replaces the previous hand-built demos, which
had no recorded recipe and shipped older-format artifacts.

## Why rebuild for 1.0

The published repos bake in the full pipeline artifacts (LanceDB tables, scope
schema, sprites). The originals predate 1.0, so a fresh download lacks the new
fields (`cluster_on`, named steps, quality metrics, image sprite atlas) and may
carry legacy (HDF5-era, emoji model-id) metadata. Rebuilding gives clean,
full-featured 1.0 examples.

## Versioning the published repos

`ls-download-dataset` now takes `--revision` so downloads can pin a
format-compatible tag:

```bash
ls-download-dataset enjalot/ls-dadabase dadabase ~/latent-scope-data --revision v1.0
```

Recommended flow when republishing: push the rebuilt data and **tag it `v1.0`**
on the HF repo, keeping the old state reachable (e.g. a `v0.6` tag). The 1.0
README/docs should point downloads at `--revision v1.0`.

## The datasets

| recipe | HF repo | rows | modality | showcases | first-run? |
| --- | --- | --- | --- | --- | --- |
| [`marqo-ge-sample`](marqo-ge-sample/build.sh) | `enjalot/ls-marqo-ge-sample` | 20k | **images** + text/numeric/categorical | image map (sprite atlas), **color-by** (`position` numeric, `source` categorical) | featured / hero |
| [`dadabase`](dadabase/build.sh) | `enjalot/ls-dadabase` | 53k | text | fast text pipeline, LLM labels | ✅ quickstart |
| [`fineweb-edu-100k`](fineweb-edu-100k/build.sh) | `enjalot/ls-fineweb-edu-100k` | 100k | text | scale, TF-IDF labels | — |
| [`common-corpus-100k`](common-corpus-100k/build.sh) | `enjalot/ls-common-corpus-100k` | 100k | text | multilingual | — |
| [`dataisplural`](dataisplural/build.sh) | `enjalot/ls-dataisplural` | 2k | text | tiny, LLM labels | — |

**Starter recommendation:** make `marqo-ge-sample` the **featured** demo (it
shows off the headline 1.0 features — image map + color-by), and keep
`dadabase` (text-only, no images to download) as the literal 2-minute
quickstart. A `dadabase`-style text set is the fastest first run; marqo is the
most impressive.

## Running a recipe

```bash
# GPU (uses cuML if the [gpu] extra is installed) or CPU:
LATENT_SCOPE_DATA=~/latent-scope-data LATENT_SCOPE_DEVICE=auto \
  bash examples/datasets/dadabase/build.sh
```

Recipes source [`_lib.sh`](_lib.sh) for CLI resolution (works for a pip install
or a dev checkout) and common env. The umap/cluster/label parameters were
recovered from the existing published datasets; the **SOURCE** section of each
recipe documents where the raw input comes from — verify/adjust it, since some
original source ids are best-effort.

**Text embedder:** all text demos share
`jinaai/jina-embeddings-v5-text-nano-retrieval` (768-dim, multilingual, embedded
with the `Document: ` task prefix) — the same model the SAE work targets, so the
demos, the SAEs, and the taxonomy line up on one embedding space. (This replaces
the previous per-dataset mix of nomic-embed-text-v1.5 / jina-embeddings-v3.) The
`marqo-ge-sample` image demo uses CLIP.

> **Note:** these recipes are scaffolding for a follow-up to the 1.0 release.
> The `--revision` flag ships in 1.0; the actual re-bake + republish is a
> deliberate, reviewed step (it overwrites public HF repos).
