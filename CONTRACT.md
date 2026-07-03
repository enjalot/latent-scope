# CONTRACT.md — WP-0 interface contract for Latent Scope 1.0

Single source of truth for the shared interfaces created in **WP-0**. Downstream
work packages (WP-A … WP-F) implement against exactly what is written here. If a
downstream WP needs to change a contract, update this file first.

Written 2026-07-02 (WP-0). Companion to `IMPLEMENTATION_PLAN_1.0.md`.

---

## 1. Device / backend resolution (`latentscope/util/device.py`)

### `resolve_device(preferred: str | None = None) -> DeviceResolution`

- **`preferred`**: `"cpu" | "cuda" | "auto"` (case-insensitive). When `None`,
  reads `LATENT_SCOPE_DEVICE` via `configuration.get_device_preference()`
  (default `"auto"`). Unrecognised values are coerced to `"auto"`.
- **Returns** a `DeviceResolution` dataclass that also supports mapping access
  (`res["torch_device"]`, `dict(res)`, `**res` unpacking) and `res.to_dict()`:

  ```python
  DeviceResolution(
      torch_device="cuda" | "cpu",   # pass to torch / model.to()
      use_cuml=bool,                  # use cuML/cuvs accelerated UMAP/HDBSCAN
      reason=str,                     # human-readable explanation (logged)
  )
  ```

- **Semantics:**
  - `auto` → `cuda` + `use_cuml=True` iff **both** torch-CUDA and cuML import
    succeed; else CPU (or GPU-torch + CPU-cuml if torch-CUDA works but cuML does
    not).
  - `cpu` → always `torch_device="cpu"`, `use_cuml=False`.
  - `cuda` → `torch_device="cuda"` when torch-CUDA is available; `use_cuml=True`
    only if cuML is importable, otherwise `use_cuml=False` with a logged
    fallback reason. If torch-CUDA is unavailable, falls back to CPU (logged).
- **Guarantees:** no torch/cuML import at module top level; both are probed with
  guarded `try/except` inside the function. `import latentscope` and
  `from latentscope.util.device import resolve_device` work with **no cuML
  installed**. The decision is logged to stdout via `print(...)` (captured by
  the job runner), format:
  `resolve_device: backend=<cpu|cuda> use_cuml=<bool> (<reason>)`.

### How downstream WPs use it

- **WP-A (`umapper.py`)** and **WP-B (`cluster.py`)** call `resolve_device()`
  once and branch: `res.use_cuml` → `cuml.manifold.UMAP` /
  `cuml.cluster.HDBSCAN`; else the CPU `umap-learn` / `hdbscan` paths. EVoC has
  no cuML equivalent — always CPU (log it).
- Env var registered in `configuration.py` as `DEVICE_ENV_VAR =
  "LATENT_SCOPE_DEVICE"`; read it only through `get_device_preference()`.

---

## 2. Metadata schema additions

All fields below are **optional** and additive; existing readers/consumers must
ignore unknown keys and tolerate their absence (nothing is removed or renamed).

### `umaps/umap-NNN.json` — implemented by **WP-A**

| field | type | notes |
|---|---|---|
| `name` | string | human-friendly title for the run; omitted when not provided |
| `description` | string | free-text; omitted when not provided |

### `clusters/cluster-NNN.json` — implemented by **WP-B**

| field | type | notes |
|---|---|---|
| `name` | string | human-friendly title; omitted when not provided |
| `description` | string | free-text; omitted when not provided |
| `cluster_on` | `"umap"` \| `"embedding"` | input space clustered on; **always written** (records the effective value even when the CLI flag was defaulted) |

Existing cluster fields (`method`, `samples`, `min_samples`,
`cluster_selection_epsilon`, `n_clusters`, `n_noise`, and evoc's `n_neighbors` /
`noise_level`) are unchanged. `method` now additionally may be `"kmeans"` or
`"gmm"`.

---

## 3. CLI flag contract (implemented by WP-A / WP-B)

WP-0 wires the **server → CLI passthrough** in `server/jobs.py`. WP-A/WP-B must
add the argparse entries below so the emitted commands parse.

### `ls-umap` (`scripts/umapper.py`) — WP-A

New optional flags (append after existing positionals/flags):

| flag | type | default | notes |
|---|---|---|---|
| `--name` | str | `None` | written to `umap-NNN.json["name"]` when set |
| `--description` | str | `None` | written to `umap-NNN.json["description"]` when set |

Existing surface unchanged: positional `dataset_id embedding_id [neighbors]
[min_dist]`; flags `--init --align --save --seed --sae_id`.

### `ls-cluster` (`scripts/cluster.py`) — WP-B

| flag | type | choices | default | notes |
|---|---|---|---|---|
| `--method` | str | `evoc, hdbscan, kmeans, gmm` | `evoc` | extend existing choices with `kmeans`, `gmm` |
| `--cluster_on` | str | `umap, embedding` | `None` → per-method default | `None`/omitted preserves today's behavior: `evoc`→`embedding`, `hdbscan`/`kmeans`/`gmm`→`umap`. Resolve the effective value and write it to `cluster_on` in the meta JSON. |
| `--name` | str | — | `None` | written to `cluster-NNN.json["name"]` when set |
| `--description` | str | — | `None` | written to `cluster-NNN.json["description"]` when set |

Existing surface unchanged: positionals `dataset_id umap_id samples min_samples
cluster_selection_epsilon [column]`; flags `--n_neighbors --noise_level` (evoc).

**Server passthrough already implemented in `jobs.py` (`/api/jobs/cluster`):**
`method` is whitelisted to `{evoc,hdbscan,kmeans,gmm}` (falls back to `evoc`
otherwise); `cluster_on` is whitelisted to `{umap,embedding}` and only appended
when provided; `--name`/`--description` appended only when non-empty. The
`/api/jobs/umap` builder appends `--name`/`--description` only when non-empty.
All commands remain **list-based** (no `shell=True`).

---

## 4. Server endpoints (implemented by WP-C on `server/datasets.py`)

Base prefix is `/api/datasets` (blueprint `datasets_bp` read / `datasets_write_bp`
write). `apiUrl` in the frontend is the `/api` base.

### 4a. Color-by column values (read) — for #131

```
GET /api/datasets/<dataset>/column/<column>?scope=<idOrScope>
```

- `<column>`: the dataset column to read (URL-encoded by the client).
- `?scope=`: optional scope/umap id to align/subset values to. When omitted,
  return values for the full dataset in `ls_index` order.
- **Response (numeric column):**
  ```json
  {
    "column": "score",
    "values": [0.12, 0.98, ...],        // per-point, aligned to ls_index order
    "extent": [min, max],                // numeric min/max
    "type": "numeric"
  }
  ```
- **Response (categorical column):**
  ```json
  {
    "column": "label",
    "values": [0, 2, 1, ...],            // per-point category indices
    "type": "categorical",
    "categorical": {
      "categories": ["a", "b", "c"],     // index -> label
      "counts": [10, 5, 3]
    }
  }
  ```
- `values` length **must equal** the scope/dataset row count. Extent is sourced
  from `meta.json → column_metadata` (already stored by `ingest.py`); categorical
  columns expose `categories`/`counts`.

### 4b. Edit umap meta (write) — for named steps / gallery

```
POST /api/datasets/<dataset>/umaps/<umap>/meta
Content-Type: application/json
{ "name": "My projection", "description": "..." }
```

- Merges `name`/`description` into `umaps/<umap>.json` (create keys if absent,
  overwrite if present; leave other fields untouched).
- **Response:** `{ "success": true }` (mirror `overwrite_scope_description`).

### 4c. Edit cluster meta (write)

```
POST /api/datasets/<dataset>/clusters/<cluster>/meta
Content-Type: application/json
{ "name": "...", "description": "..." }
```

- Same merge semantics into `clusters/<cluster>.json`.
- **Response:** `{ "success": true }`.

> **Decision (meta-update route shape):** name/description are set at *creation*
> time through the job command builders (`jobs.py`, §3) and written by the
> scripts. The `POST .../meta` routes above exist for **editing an existing run
> without re-running it** (the gallery's inline rename). They live in
> `datasets.py` (owner WP-C) as *new* write routes — they do not touch the
> existing umap/cluster GET routes. POST + JSON body was chosen over the
> query-string GET style of `overwrite_scope_description` because these carry
> free-text values; the JSON body avoids URL-length/encoding pitfalls and is
> consistent with the existing `postJsonOptions` helper in `apiService.js`.

---

## 5. Frontend `apiService` methods (implemented in WP-0, `web/src/lib/apiService.js`)

Already added and wired to the §4 endpoints:

```js
apiService.updateUmapMeta(datasetId, umapId, { name, description })
  // POST /api/datasets/<dataset>/umaps/<umapId>/meta  (JSON body)
  // -> { success: true }

apiService.updateClusterMeta(datasetId, clusterId, { name, description })
  // POST /api/datasets/<dataset>/clusters/<clusterId>/meta  (JSON body)
  // -> { success: true }

apiService.fetchColumnValues(datasetId, idOrScope, column)
  // GET /api/datasets/<dataset>/column/<column>?scope=<idOrScope>
  // -> { column, values: number[], extent?: [min,max], type, categorical? }
  // idOrScope may be null/undefined to omit the ?scope= filter.
```

All three go through the existing `fetchJson` helper (ok-status checks + error
body snippet) and `postJsonOptions` for the writes.

---

## 6. Dependencies (`pyproject.toml`)

- `scikit-learn` confirmed as a **direct** dependency (already present:
  `scikit-learn>=1.3,<2`) — required for WP-B's `KMeans` / `GaussianMixture`.
- New optional extra (NOT default):
  ```toml
  [project.optional-dependencies]
  gpu = ["cuml-cu12>=25.2", "cuvs-cu12>=25.2"]
  ```
  Install with `pip install "latentscope[gpu]"` plus
  `--extra-index-url=https://pypi.nvidia.com`. **Pins need validation on the
  CUDA 12.8 gsv box** before release (RAPIDS ships fast; prefer newest 25.x that
  resolves against the driver). The guarded import in `device.py` means absence
  of this extra never breaks anything.
