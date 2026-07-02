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

### You also need a driver-matched torch

The default PyPI `torch` is a **cu130** build. On a **CUDA 12.8** driver it
reports `torch.cuda.is_available() == False` ("driver too old"), which makes
`resolve_device` fall back to CPU even with cuML installed. Install a torch
built for your CUDA line **first**:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu128   # CUDA 12.8
pip install "latentscope[gpu]" --extra-index-url=https://pypi.nvidia.com
```

### RAPIDS version must match your driver

Validated on-device (RTX 5090, driver 570.211.01 = **CUDA 12.8**): an unbounded
`cuml-cu12>=25.2` resolves to **RAPIDS 26.6**, whose `libcuml` is built for
**CUDA 12.9** and fails to load on a 12.8 driver:

```
libcuml.so: undefined symbol: __nvJitLinkGetLinkedCubinSize_12_9
```

The extra therefore pins **`cuml-cu12==25.2.*` / `cuvs-cu12==25.2.*`**, the
validated-working RAPIDS on CUDA 12.8. If you are on a **newer driver (≥12.9)**
you can raise this cap to the newest RAPIDS that resolves against your driver.
Always confirm `import cuml` succeeds before relying on the GPU path — if it
fails, Latent Scope simply runs on CPU. (A harmless `libcudart.so: cannot open`
warning from cudf's numba probe may appear at import; the cuML ops still run.)

**Verified working set (CUDA 12.8):** `torch 2.11.0+cu128`,
`cuml-cu12 / cuvs-cu12 / cudf-cu12 == 25.2.1`, `nvidia-nvjitlink-cu12 12.8.x` —
`ls-umap` (cuML UMAP), `ls-cluster --method hdbscan` (cuML HDBSCAN), and
`ls-cluster --method kmeans` (cuML KMeans) all engage, with cluster-count parity
to the CPU path.

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
