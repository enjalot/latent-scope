# GPU acceleration

Latent Scope can run the heavier pipeline steps on an NVIDIA GPU using
[RAPIDS cuML](https://docs.rapids.ai/api/cuml/stable/), with a graceful fall back
to CPU when a GPU (or the cuML libraries) is not available. This addresses
[issue #63](https://github.com/enjalot/latent-scope/issues/63).

GPU support is **optional** — the default install and the default behavior are
unchanged, and nothing breaks when cuML is absent (the GPU libraries are probed
with a guarded import).

---

## What gets accelerated

When a GPU backend is active, these steps use their cuML equivalents:

| Step | CPU library | GPU library |
| --- | --- | --- |
| `ls-umap` | `umap-learn` | `cuml.manifold.UMAP` |
| `ls-cluster --method hdbscan` | `hdbscan` | `cuml.cluster.HDBSCAN` |
| `ls-cluster --method kmeans` | `sklearn.cluster.KMeans` | `cuml.cluster.KMeans` |

Two methods stay on CPU regardless of backend:

- `ls-cluster --method evoc` — EVoC has no cuML equivalent (logged when it runs).
- `ls-cluster --method gmm` — no stable cuML Gaussian Mixture, so sklearn/CPU.

Parameters, the `metric='cosine'` UMAP setting, the `n_components=2` projection,
and the `[-1, 1]` normalization are preserved across both paths.

---

## Choosing a backend: `LATENT_SCOPE_DEVICE`

The backend is controlled by the `LATENT_SCOPE_DEVICE` environment variable. Valid
values (case-insensitive; anything unset or unrecognised falls back to `auto`):

| Value | Behavior |
| --- | --- |
| `auto` *(default)* | Use the GPU (torch CUDA **and** cuML both importable) if available; otherwise CPU. |
| `cuda` | Prefer the GPU. Uses cuML only if it is importable; if torch-CUDA is unavailable it logs a fallback and runs on CPU. |
| `cpu` | Always CPU; never touch cuML. |

```bash
export LATENT_SCOPE_DEVICE=auto        # default — GPU if present, else CPU
export LATENT_SCOPE_DEVICE=cpu         # force CPU even on a GPU box
export LATENT_SCOPE_DEVICE=cuda        # prefer GPU (with logged CPU fallback)
```

You can also set it in the `.env` file in your data directory alongside the other
Latent Scope settings.

Each run logs the resolved backend to stdout (captured by the job runner), e.g.:

```
resolve_device: backend=cuda use_cuml=True (auto: torch CUDA + cuML available)
```

so you can confirm which path actually executed.

---

## Installing the GPU extra

The GPU libraries ship as an optional `gpu` extra (they are **not** installed by
default). On a CUDA 12.x box:

```bash
pip install "latentscope[gpu]" --extra-index-url=https://pypi.nvidia.com
```

The `--extra-index-url` is required because the RAPIDS wheels
(`cuml-cu12`, `cuvs-cu12`) are hosted on NVIDIA's package index.

> **Version pins need validation per box.** The extra pins `cuml-cu12>=25.2` and
> `cuvs-cu12>=25.2`. RAPIDS releases quickly and wheel/driver compatibility is
> specific to your CUDA runtime — prefer the newest `25.x` that resolves against
> your driver, and validate that `import cuml` succeeds before relying on the GPU
> path. If the import fails, Latent Scope simply runs on CPU.

---

## Verifying the GPU path

1. Install the extra (above) on a machine with an NVIDIA GPU + recent driver.
2. Set `LATENT_SCOPE_DEVICE=cuda` (or `auto`).
3. Run `ls-umap` / `ls-cluster` and check the `resolve_device:` log line reports
   `backend=cuda use_cuml=True`, plus the per-step "running cuML …" messages.

If cuML is missing or the GPU is unavailable, you will see a logged fallback and
the CPU libraries run instead — output is equivalent, just slower.

See also [docs/clustering.md](clustering.md) for the clustering methods and
[docs/data-importing.md](data-importing.md) for getting data in.
