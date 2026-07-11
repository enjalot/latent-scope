# UMAP projections

`ls-umap` projects an embedding down to 2D and writes `umaps/umap-NNN.parquet`
(columns `x,y`, normalized to `[-1, 1]`), a preview PNG, and a meta JSON.

```bash
# ls-umap <dataset_id> <embedding_id> [neighbors] [min_dist] [options]
ls-umap mydataset embedding-001 25 0.1
```

## Flag reference

| flag | what it does |
| --- | --- |
| `--save` | Pickle the fitted reducer to `umaps/umap-NNN.pkl` so new rows can later be projected through it. Forces the CPU (umap-learn) code path. |
| `--transform-from <umap-id>` | Project rows appended since `<umap-id>` through its saved reducer; old points keep their exact published positions. Writes a new umap-NNN. |
| `--align <emb1,emb2,…>` | AlignedUMAP across several embeddings of the same dataset. Embeddings may have different lengths as long as they share an index prefix (append-only growth): the relations map the shared prefix of each consecutive pair. Writes one umap-NNN per embedding. |
| `--register-to <umap-id>` | After fitting (plain or `--align`), register the new layout onto an existing umap with a 2D similarity transform (rotation + uniform scale + translation, reflection allowed) fit on the shared row prefix, so the refit lands in the published frame. |
| `--init <umap-id>` | Warm-start the fit from an existing layout (CPU only). |
| `--seed N` | Fix `random_state` for reproducibility (see note below). `-1` means unseeded. |
| `--sae_id`, `--name`, `--description` | Project SAE features instead / attach human-friendly metadata. |

`--transform-from` cannot be combined with `--align`, `--init`, `--save`,
`--sae_id`, or `--register-to`; the `neighbors`/`min_dist` positionals are
ignored in that mode (the saved reducer already encodes them) and may be
omitted entirely.

## Growing datasets: keeping a published map stable

When a dataset grows daily but the published map must stay visually stable,
use a two-cadence recipe:

**Once — fit and save the reducer:**

```bash
ls-umap mydataset embedding-001 25 0.1 --save    # -> umap-001 (+ umap-001.pkl)
```

**Daily — project only the new rows through the saved reducer:**

```bash
# after re-embedding the grown dataset into the same embedding id
ls-umap mydataset embedding-001 --transform-from umap-001   # -> umap-002
ls-umap mydataset embedding-001 --transform-from umap-002   # next day -> umap-003
...
```

Old rows are copied verbatim from the source parquet (pixel-stable); new rows
are transformed and mapped into the source's `[-1, 1]` frame using its stored
min/max. New points can land slightly outside `[-1, 1]` — they are left there
(the count is printed) rather than rescaling the old points. The meta records
`transformed_from` and `reducer_id`; the pickle itself is not copied, so a
chain of daily transforms keeps resolving back to the original saved reducer.

**Periodically — refit so accumulated new rows get a proper embedding, and
register the refit onto the published layout:**

```bash
# AlignedUMAP across the old (shorter) and current (longer) embedding windows,
# anchored to the published umap so the layout doesn't rotate/flip/drift:
ls-umap mydataset embedding-002 25 0.1 --align embedding-001 --register-to umap-001 --save
```

Registration computes a least-squares similarity transform on the rows shared
with the target umap (the index prefix) and applies it to the whole layout, so
the refit is expressed in the published frame. The meta records
`registered_to` plus the `registration` transform — a later `--transform-from`
of a registered umap reuses that transform for its new points, so the daily
cadence can continue from the registered refit.

## Reproducibility note

Passing `--seed` (i.e. setting `random_state`) forces umap-learn into a
single-threaded fit, which is substantially slower on large datasets. Leaving
it unseeded is faster but non-deterministic — with the workflow above that's
usually fine, because `--register-to` re-anchors each refit onto the published
layout anyway. Also note `--save` (and `--align`/`--init`) disable the cuML
GPU path, since only CPU umap-learn reducers can be pickled and transformed.

## Reducer pickle size

Saved reducers embed the training data and its nearest-neighbor search index,
so the `.pkl` files are large — on the order of 100–200 MB for a few tens of
thousands of rows, growing with the dataset. Only the most recent saved
reducer in a `--transform-from` chain is needed; older pickles can be deleted
once superseded by a new `--save` fit.

## Next step

Cluster the projection with [`ls-cluster`](clustering.md).
