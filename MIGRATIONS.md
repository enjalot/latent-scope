# Data Format Migrations

This file documents breaking changes to data formats and how to migrate between versions. It is intended for both human operators and AI agents managing latent-scope datasets.

---

## Version History

### v1.1 — LanceDB Embedding Storage (April 2026)

**Change:** Embedding vectors are now stored in LanceDB tables (Lance format v2.2) instead of HDF5 files. This provides ~50% storage reduction via automatic BSS + LZ4 compression, native vector search, and support for late interaction models (ColBERT/ColPali per-token vectors).

**Old format:**
```
{dataset}/embeddings/embedding-001.h5      # HDF5 with "embeddings" dataset
{dataset}/embeddings/embedding-001.json    # metadata
```

**New format:**
```
{dataset}/lancedb/emb-embedding-001/       # LanceDB table directory
{dataset}/embeddings/embedding-001.json    # metadata (unchanged)
```

**Backward compatibility:**
- All `load_embeddings()` calls automatically fall back to HDF5 if no LanceDB table exists
- Existing scopes, UMAPs, and clusters continue to work without migration
- New embeddings are always written to LanceDB

**When to migrate:**
- Migration is optional for existing datasets
- Recommended for storage savings and to enable late interaction search
- Required if you want to use ColBERT/ColPali models on existing datasets

**How to migrate:**
- **UI:** On the Embedding setup step, embeddings stored in HDF5 show an "HDF5" badge. Click "Migrate to LanceDB" to convert.
- **API:** `POST /datasets/{dataset}/embeddings/{embedding}/migrate`
- **Python:**
  ```python
  from latentscope.util.embedding_store import migrate_hdf5_to_lancedb
  result = migrate_hdf5_to_lancedb(data_dir, dataset_id, embedding_id)
  ```
- **CLI resume:** If you resume an interrupted HDF5 embedding via `ls-embed --rerun`, it automatically migrates the existing HDF5 data to LanceDB before continuing.

**After migration:**
- The HDF5 file is NOT deleted (safe to remove manually after verifying)
- All downstream pipeline steps (UMAP, cluster, scope) work identically
- Search uses LanceDB's native ANN index for faster queries

**Agent instructions:**
To check if a dataset needs migration, call `GET /datasets/{dataset}/embeddings/{embedding}/format`. The response includes `{"format": "hdf5"|"lancedb"|"none"}`. If `"hdf5"`, call `POST .../migrate` to convert. The metadata JSON file does not change — only the vector storage location moves.

---

### v1.0 — Initial Format

**Embedding storage:** HDF5 files with a single `"embeddings"` dataset of shape `(N, D)` as float32.

**Cluster storage:** Parquet files with `cluster` and `raw_cluster` columns. Labels in separate parquet with `label`, `description`, `indices`, `hull` columns. EVoC clusters store empty hull arrays `[]` since convex hulls are not meaningful for embedding-space clusters.

**Scope storage:** JSON metadata + Parquet with all columns joined. LanceDB used for scope-level vector search (separate from embedding storage).
