# Importing data into Latent Scope

This guide covers how to get data into Latent Scope: supported file formats, how
columns are detected, working with text vs. image columns, downloading datasets
from HuggingFace, and importing embeddings you already have. It addresses
[issue #60](https://github.com/enjalot/latent-scope/issues/60).

Every dataset lives in a directory under `LATENT_SCOPE_DATA`. Ingesting writes a
normalized `input.parquet` plus a `meta.json` describing the columns; every later
step reads from there.

```bash
export LATENT_SCOPE_DATA=~/latent-scope-data   # where datasets are stored
```

---

## 1. Ingesting a file

`ls-ingest` accepts **CSV, Parquet, JSON, JSONL, and XLSX**:

```bash
ls-ingest mydataset --path /path/to/data.csv --text_column text
```

- `mydataset` — the dataset id (its directory name under `LATENT_SCOPE_DATA`).
- `--path` — the source file. Format is inferred from the extension
  (`.csv`, `.parquet`, `.json`, `.jsonl`, `.xlsx`). If omitted, `ls-ingest` looks
  for `input.csv` inside the dataset directory.
- `--text_column` — which column to embed by default. If omitted, the UI lets
  you pick later; you can always embed a different column with `ls-embed`.

Ingest normalizes the data to `input.parquet` and writes `meta.json` with
per-column metadata (type, unique-value counts, categories, numeric/date
extents, and image flags).

### From a pandas DataFrame (library API)

```python
import latentscope as ls
import pandas as pd

ls.init("~/latent-scope-data")
df = pd.read_csv("data.csv")
ls.ingest("mydataset", df, text_column="text")
```

---

## 2. How columns are detected

During ingest each column is typed and recorded in `meta.json`:

| Detected type | How | Used for |
| --- | --- | --- |
| `string` | text columns | embedding input, labels, filtering |
| `number` | numeric columns | color-by, filtering (min/max extent stored) |
| `date` | parseable dates | filtering (min/max extent stored) |
| `image` (binary) | cells that decode as images (PIL) — HF `{"bytes":…, "path":…}` dicts or raw bytes | image embedding + sprite atlas |
| `image` (url) | string column where every value is an `http…` URL ending in `png/jpg/jpeg/webp/svg/gif` | image embedding + thumbnails |

String columns with ≤100 distinct values also store their categories and counts,
which powers the categorical filters in Explore.

> Tip: an image column is never auto-selected as the default **text** column.

---

## 3. Text datasets

Pick a small, fast embedding model to start (runs on CPU):

```bash
ls-embed mydataset text transformers-BAAI___bge-small-en-v1.5
```

List available models with `ls-list-models`. Providers include
sentence-transformers/HuggingFace (`transformers-…`), OpenAI, Cohere, Voyage,
Mistral, Together, and any OpenAI-compatible endpoint. After embedding, the
embedding metadata records **token statistics** (total / mean / min / max tokens
per document) when a local tokenizer is available — surfaced in the Setup UI
([issue #77](https://github.com/enjalot/latent-scope/issues/77)).

Null, empty, and NaN cells in the text column are handled gracefully (replaced
with a single space so row alignment is preserved) rather than crashing the run.

---

## 4. Image datasets

Image columns are embedded with an image/multimodal model (e.g. CLIP):

```bash
ls-embed mydataset image transformers-openai___clip-vit-base-patch32
```

Images that fail to decode are replaced with a 1×1 black placeholder so a few bad
rows don't break the run. After you create a scope, generate the **sprite atlas**
so the map can show representative images as you zoom in:

```bash
ls-sprite-atlas mydataset scopes-001 image --resolutions 64,128,256
```

In Explore, image datasets default to the heatmap and transition to the image
grid (then individual points) as you zoom — no separate toggle. See the
**Images** step in Setup to plan resolutions and preview size estimates.

---

## 5. ColBERT late-interaction (multi-vector) embeddings

ColBERT models store one vector per token and search with MaxSim, which is great
for fine-grained retrieval. They use the `colbert-` prefix:

```bash
ls-embed mydataset text colbert-answerdotai___answerai-colbert-small-v1
```

Per-token vectors are stored fp16 in LanceDB; the Explore search box uses
late-interaction search automatically for these embeddings. A complete,
CPU-friendly, runnable example lives in
[`examples/colbert_quickstart/`](../examples/colbert_quickstart/) — run
`bash examples/colbert_quickstart/run.sh` to ingest a tiny topical dataset, embed
it, and verify MaxSim search returns on-topic results.

---

## 6. Downloading a published dataset from HuggingFace

Many ready-made Latent Scope datasets are published on HuggingFace:

```bash
ls-download-dataset enjalot/ls-datavis-misunderstood datavis-misunderstood \
  ~/latent-scope-data/datavis-misunderstood
```

This pulls the scope, embeddings, umaps, clusters, and metadata so you can open
the dataset in Explore immediately without re-running the pipeline.

---

## 7. Importing embeddings you already have

If your input file already contains an embedding column (a list/array per row),
import it directly instead of recomputing:

```bash
# ls-embed-importer <dataset_id> <embedding_column> <model_id> <text_column>
ls-embed-importer mydataset my_vectors my-precomputed-model text
```

This reads the column from `input.parquet`, stores it as an embedding set in
LanceDB, and records metadata so UMAP/cluster/scope can use it like any other
embedding.

---

## 8. How much data can I load?

Latent Scope is designed for interactive **exploration**, not billion-row
warehousing ([issue #33](https://github.com/enjalot/latent-scope/issues/33)).
Practical guidance:

- **Sweet spot: up to a few hundred thousand rows.** The published demos are in
  the 50k–100k range and stay snappy in the browser. Datasets up to ~500k are
  workable; beyond that, expect slower UMAP/cluster steps and a heavier map.
- **Embedding is the main time cost.** On CPU, use a small model
  (`transformers-BAAI___bge-small-en-v1.5`) and start with a sample of your data.
  A GPU dramatically speeds up both embedding and (optionally) UMAP/clustering —
  see [gpu-acceleration.md](gpu-acceleration.md).
- **ColBERT and image datasets are heavier.** ColBERT stores one vector *per
  token* (fp16 in LanceDB), so multi-vector datasets use far more disk than dense
  ones; image atlases add tiled sprite pyramids. Budget disk accordingly and keep
  these datasets smaller while iterating.
- **Everything is flat files.** Each step writes to your dataset directory, so you
  can inspect sizes as you go and delete intermediate runs you don't need.

To work with a large source, sample it down at ingest time (e.g. slice the
DataFrame before `ls.ingest(...)`) and scale up once the pipeline settings look
right.

---

## 9. Next steps

Once data is ingested and embedded:

```bash
ls-umap    mydataset embedding-001 25 0.1
ls-cluster mydataset umap-001 5 3 0.0 --method hdbscan
ls-scope   mydataset embedding-001 umap-001 cluster-001 default "My scope" "description"
ls-serve   $LATENT_SCOPE_DATA          # open http://localhost:5001 to explore
```

- [clustering.md](clustering.md) — clustering methods (EVoC / HDBSCAN / KMeans /
  GMM), the `--cluster_on` input choice, and named experiment runs.
- [gpu-acceleration.md](gpu-acceleration.md) — optional cuML GPU acceleration and
  the `LATENT_SCOPE_DEVICE` control.
- [exploring.md](exploring.md) — color-by, the Compare page's shared selection,
  the experiment gallery, and the curation (post-1.0) status.

See [`CLAUDE.md`](../CLAUDE.md) for the agent quickstart and
[`DEVELOPMENT.md`](../DEVELOPMENT.md) for the developer setup.
