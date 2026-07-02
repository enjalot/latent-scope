# Clustering methods

After projecting embeddings with `ls-umap`, the `ls-cluster` step assigns every
point a cluster id. Latent Scope 1.0 supports four clustering methods and lets
you choose whether to cluster on the 2D UMAP projection or the original
high-dimensional embedding ([issue #41](https://github.com/enjalot/latent-scope/issues/41)).

```bash
# ls-cluster <dataset_id> <umap_id> <samples> <min_samples> <cluster_selection_epsilon> [column]
#            [--method {evoc,hdbscan,kmeans,gmm}] [--cluster_on {umap,embedding}]
#            [--n_neighbors N] [--noise_level F] [--name ...] [--description ...]
ls-cluster mydataset umap-001 5 3 0.0 --method hdbscan
```

The positionals `samples`, `min_samples`, and `cluster_selection_epsilon` are
always required (in that order); `min_samples` and `cluster_selection_epsilon`
are only meaningful for HDBSCAN but must still be supplied for the other methods.

---

## Methods (`--method`, default `evoc`)

| Method | Library | What `samples` means | Emits noise (`-1`)? |
| --- | --- | --- | --- |
| `evoc` *(default)* | [EVoC](https://github.com/TutteInstitute/evoc) | `base_min_cluster_size` | yes |
| `hdbscan` | `hdbscan` / cuML | `min_cluster_size` | yes |
| `kmeans` | scikit-learn / cuML | **number of clusters** | no |
| `gmm` | scikit-learn (`GaussianMixture`) | **number of clusters (components)** | no |

- **EVoC** and **HDBSCAN** are density-based: `samples` is the minimum cluster
  size, and points that don't fit a cluster are marked as noise (`-1`) and then
  reassigned to their nearest cluster centroid.
- **KMeans** and **GMM** are partitional: `samples` is the target **number of
  clusters**, and every point is always assigned (no noise). `min_samples` and
  `cluster_selection_epsilon` are ignored for these methods but still positional:

  ```bash
  # 20 clusters via KMeans; the 3 and 0.0 are ignored placeholders
  ls-cluster mydataset umap-001 20 3 0.0 --method kmeans
  ls-cluster mydataset umap-001 15 3 0.0 --method gmm
  ```

EVoC-only tuning flags: `--n_neighbors` (kNN graph, default 15) and
`--noise_level` (0.0–1.0, default 0.5).

---

## Clustering input (`--cluster_on`)

`--cluster_on {umap,embedding}` selects which space is clustered:

- `umap` — the 2D projection from `ls-umap` (fast, matches what you see on the map).
- `embedding` — the original high-dimensional vectors (captures structure that
  UMAP may have flattened).

When omitted, the default **preserves the historical per-method behavior**:

| Method | Default `--cluster_on` |
| --- | --- |
| `evoc` | `embedding` |
| `hdbscan`, `kmeans`, `gmm` | `umap` |

The effective value (whether defaulted or explicit) is always written to
`cluster-NNN.json` as `cluster_on`. Note the 2D UMAP coordinates are still used
for plotting, convex hulls, and noise reassignment regardless of this choice.

---

## Named runs + the experiment gallery

Any cluster (or umap) run can carry a human-friendly title and description:

```bash
ls-cluster mydataset umap-001 5 3 0.0 --method hdbscan \
  --name "HDBSCAN min5" --description "density clustering on the umap projection"
```

These are stored in the run's metadata JSON (`cluster-NNN.json` /
`umap-NNN.json`) and shown in the Setup UI, which now renders a browsable
**gallery** of runs — thumbnail, title, parameter badges, and cluster quality
metrics — instead of a bare `cluster-001`, `cluster-002` id list. You can edit a
run's name/description inline in the gallery without re-running it.

---

## GPU acceleration

HDBSCAN and KMeans use their cuML equivalents when a GPU backend is active; EVoC
and GMM always run on CPU. See [docs/gpu-acceleration.md](gpu-acceleration.md)
for `LATENT_SCOPE_DEVICE` and the optional `latentscope[gpu]` install.

---

## Next step

Label the clusters (optionally with an LLM) and build a scope:

```bash
# ls-label <dataset_id> <text_column> <cluster_id> <chat_model_id> <samples> <context>
ls-label mydataset text cluster-001 openai-gpt-4o-mini 0 ""   # optional; else use the default labels
ls-scope mydataset embedding-001 umap-001 cluster-001 default "My scope" "description"
```
