"""
LanceDB-backed embedding storage.

Replaces the previous HDF5-based storage with LanceDB tables that support:
- Standard dense embeddings (single vector per row)
- Late interaction embeddings (mean vector + per-token vectors per row)
- Resumable batch writing
- Backward-compatible reading of legacy HDF5 files
"""

import os

import numpy as np


def _lance_db_path(data_dir, dataset_id):
    """Return the LanceDB directory for a dataset."""
    return os.path.join(data_dir, dataset_id, "lancedb")


def _embedding_table_name(embedding_id):
    """Return the LanceDB table name for an embedding."""
    return f"emb-{embedding_id}"


def _connect(data_dir, dataset_id):
    """Connect to the LanceDB database for a dataset."""
    import lancedb

    db_path = _lance_db_path(data_dir, dataset_id)
    os.makedirs(db_path, exist_ok=True)
    return lancedb.connect(db_path)


def _get_table_names(db):
    """Get list of table names from a LanceDB connection."""
    result = db.list_tables()
    # lancedb 0.30+ returns a ListTablesResponse object with .tables attribute
    if hasattr(result, 'tables'):
        return result.tables
    return list(result)


def append_embeddings(data_dir, dataset_id, embedding_id, vectors, start_index=0,
                      token_vectors_list=None):
    """Append a batch of embeddings to the LanceDB table.

    Parameters
    ----------
    data_dir : str
        Root data directory.
    dataset_id : str
        Dataset identifier.
    embedding_id : str
        Embedding identifier (e.g. "embedding-001").
    vectors : np.ndarray
        Dense embedding vectors, shape (N, D).  For late interaction models
        this is the mean vector.
    start_index : int
        The row index of the first vector in this batch (for ls_index).
    token_vectors_list : list[np.ndarray] or None
        Per-token vectors for late interaction models.  Each element is a
        (T_i, D) array where T_i varies per document.  None for standard
        embeddings.
    """
    import pyarrow as pa

    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)

    n, dim = vectors.shape

    # Build an arrow table with an explicit schema. Without this, LanceDB
    # infers `list<list<double>>` for token vectors from python lists —
    # float64 storage is 4x the size of the float16 we use here, and the
    # row-dict path creates millions of PyFloat objects per batch.
    vectors = np.ascontiguousarray(vectors, dtype=np.float32)
    columns = {
        "ls_index": pa.array(range(start_index, start_index + n), pa.int64()),
        "vector": pa.FixedSizeListArray.from_arrays(
            pa.array(vectors.reshape(-1), pa.float32()), dim),
    }
    if token_vectors_list is not None:
        lengths = [len(tv) for tv in token_vectors_list]
        flat = np.concatenate(token_vectors_list).astype(np.float16)
        flat = np.ascontiguousarray(flat).reshape(-1)
        inner = pa.FixedSizeListArray.from_arrays(pa.array(flat, pa.float16()), dim)
        offsets = np.zeros(n + 1, dtype=np.int32)
        np.cumsum(lengths, out=offsets[1:])
        columns["token_vectors"] = pa.ListArray.from_arrays(
            pa.array(offsets, pa.int32()), inner)
        columns["num_tokens"] = pa.array(lengths, pa.int32())
    batch = pa.table(columns)

    if table_name in _get_table_names(db):
        tbl = db.open_table(table_name)
        if tbl.schema != batch.schema:
            # Legacy table (e.g. resuming a pre-schema run): cast to its schema
            batch = batch.cast(tbl.schema)
        tbl.add(batch)
    else:
        db.create_table(table_name, batch)


def list_embedding_ids(data_dir, dataset_id):
    """Return embedding ids that have a LanceDB table (e.g. ["embedding-001"]).

    Includes tables from crashed runs that never wrote their .json metadata,
    so callers allocating the next embedding id don't reuse a taken one.
    """
    db_path = _lance_db_path(data_dir, dataset_id)
    if not os.path.isdir(db_path):
        return []
    db = _connect(data_dir, dataset_id)
    return [
        name[len("emb-"):]
        for name in _get_table_names(db)
        if name.startswith("emb-")
    ]


def get_embedding_count(data_dir, dataset_id, embedding_id):
    """Return the number of embeddings stored, or 0 if none."""
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name in _get_table_names(db):
        tbl = db.open_table(table_name)
        return tbl.count_rows()
    return 0


def load_embeddings(data_dir, dataset_id, embedding_id):
    """Load all dense (mean) embeddings as a numpy array.

    Falls back to HDF5 if LanceDB table doesn't exist (backward compat).

    Returns
    -------
    np.ndarray of shape (N, D)
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)

    if table_name in _get_table_names(db):
        tbl = db.open_table(table_name)
        # Read only the columns we need: for late interaction tables the
        # token_vectors column is 50-100x the size of the mean vectors and
        # to_pandas() on all columns would materialize it for nothing.
        data = tbl.to_lance().to_table(columns=["ls_index", "vector"])
        order = np.argsort(data["ls_index"].to_numpy())
        vec_col = data["vector"].combine_chunks()
        flat = vec_col.flatten().to_numpy(zero_copy_only=False)
        vectors = flat.reshape(len(data), -1).astype(np.float32, copy=False)
        return np.ascontiguousarray(vectors[order])

    # Fallback: try legacy HDF5
    return _load_hdf5_embeddings(data_dir, dataset_id, embedding_id)


def load_token_vectors(data_dir, dataset_id, embedding_id, indices=None):
    """Load per-token vectors for late interaction models.

    Parameters
    ----------
    indices : list[int] or None
        If given, load only these row indices.  Otherwise load all.

    Returns
    -------
    list[np.ndarray]
        Each element is (T_i, D) array of token vectors for that document.
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)

    if table_name not in _get_table_names(db):
        raise ValueError(f"No LanceDB table for {embedding_id}. "
                         "Token vectors are only available for LanceDB embeddings.")

    tbl = db.open_table(table_name)

    if "token_vectors" not in tbl.schema.names:
        raise ValueError(f"Embedding {embedding_id} does not have token vectors "
                         "(not a late interaction embedding).")

    if indices is not None:
        # Filter to specific indices
        df = tbl.search().where(
            f"ls_index IN ({','.join(str(i) for i in indices)})"
        ).select(["ls_index", "token_vectors"]).to_pandas()
    else:
        df = tbl.to_pandas()

    df = df.sort_values("ls_index")
    result = []
    for tv in df["token_vectors"].tolist():
        # tv may be a numpy array of numpy arrays, or a list of lists
        arr = np.stack(tv).astype(np.float32)
        result.append(arr)
    return result


def has_token_vectors(data_dir, dataset_id, embedding_id):
    """Check if this embedding has per-token vectors (late interaction)."""
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name not in _get_table_names(db):
        return False
    tbl = db.open_table(table_name)
    return "token_vectors" in tbl.schema.names


def create_vector_index(data_dir, dataset_id, embedding_id, metric="cosine"):
    """Create an ANN index on the mean vector column.

    No-op below 256 rows (too few for an IVF index); brute-force search is
    fast at that scale anyway.
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name not in _get_table_names(db):
        return
    tbl = db.open_table(table_name)
    num_rows = tbl.count_rows()
    if num_rows < 256:
        return  # too few rows for IVF index
    dim = tbl.schema.field("vector").type.list_size
    partitions = min(256, num_rows // 10)
    sub_vectors = max(1, dim // 16)
    tbl.create_index(
        num_partitions=partitions,
        num_sub_vectors=sub_vectors,
        metric=metric,
        vector_column_name="vector",
    )


def create_scalar_index(data_dir, dataset_id, embedding_id, column="ls_index"):
    """Create a BTREE index on a scalar column (used by token-vector lookups)."""
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name not in _get_table_names(db):
        return
    tbl = db.open_table(table_name)
    tbl.create_scalar_index(column)


def optimize_table(data_dir, dataset_id, embedding_id):
    """Compact fragments and clean up old versions after a write-heavy run.

    Embedding runs append one fragment per batch (10k fragments per 1M rows
    at the default batch size); compaction keeps reads and count_rows fast.
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name not in _get_table_names(db):
        return
    tbl = db.open_table(table_name)
    tbl.optimize()


def search_nn(data_dir, dataset_id, embedding_id, query_vector, limit=150, metric="cosine"):
    """Search for nearest neighbors using the mean vector.

    Returns (indices, distances) arrays.
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)

    if table_name not in _get_table_names(db):
        raise ValueError(f"No LanceDB table for {embedding_id}")

    tbl = db.open_table(table_name)
    results = (
        tbl.search(query_vector, vector_column_name="vector")
        .metric(metric)
        .select(["ls_index"])
        .limit(limit)
        .to_list()
    )
    indices = [r["ls_index"] for r in results]
    distances = [r["_distance"] for r in results]
    return indices, distances


def search_late_interaction(data_dir, dataset_id, embedding_id, query_token_vectors,
                            prefilter_limit=None, final_limit=50, metric="cosine"):
    """Late interaction (MaxSim) search.

    1. Gather candidates: ANN search on the mean query vector PLUS a search
       per query token (union). A mean-pooled-query prefilter alone misses
       documents matched by a single rare query token whose signal is diluted
       by averaging; searching each query token separately recovers documents
       whose mean leans toward that token. (Both searches still run against
       mean *document* vectors — a true token-level index over all document
       tokens is future work.)
    2. Load per-token vectors for candidates.
    3. Re-rank using MaxSim scoring.

    Parameters
    ----------
    query_token_vectors : np.ndarray
        Shape (Q, D) - per-token vectors from the query.
    prefilter_limit : int or None
        Number of candidates from the mean-vector search. Defaults to a
        corpus-size-scaled value in [200, 2000].
    final_limit : int
        Number of final results to return.

    Returns
    -------
    indices : list[int]
    scores : list[float]
    """
    if prefilter_limit is None:
        n_rows = get_embedding_count(data_dir, dataset_id, embedding_id)
        prefilter_limit = int(min(max(200, n_rows // 100), 2000))

    # Step 1a: ANN search using mean of query tokens
    query_mean = query_token_vectors.mean(axis=0).astype(np.float32)
    mean_candidates, _ = search_nn(
        data_dir, dataset_id, embedding_id,
        query_mean, limit=prefilter_limit, metric=metric,
    )
    candidates = set(mean_candidates)

    # Step 1b: union in per-query-token candidates
    n_query_tokens = len(query_token_vectors)
    per_token_limit = max(20, prefilter_limit // max(n_query_tokens, 1))
    for q_vec in query_token_vectors:
        token_candidates, _ = search_nn(
            data_dir, dataset_id, embedding_id,
            q_vec.astype(np.float32), limit=per_token_limit, metric=metric,
        )
        candidates.update(token_candidates)

    candidate_indices = sorted(candidates)
    if not candidate_indices:
        return [], []

    # Step 2: Load token vectors for candidates
    candidate_token_vecs = load_token_vectors(
        data_dir, dataset_id, embedding_id, indices=candidate_indices,
    )

    # Step 3: MaxSim re-ranking
    q_norm = query_token_vectors / (
        np.linalg.norm(query_token_vectors, axis=1, keepdims=True) + 1e-10)
    scores = []
    for doc_tokens in candidate_token_vecs:
        # doc_tokens shape: (T_d, D), query_token_vectors shape: (Q, D)
        # MaxSim: for each query token, find max similarity with any doc token, then sum
        if len(doc_tokens) == 0:
            scores.append(0.0)
            continue
        d_norm = doc_tokens / (np.linalg.norm(doc_tokens, axis=1, keepdims=True) + 1e-10)
        sim_matrix = q_norm @ d_norm.T  # (Q, T_d)
        max_sims = sim_matrix.max(axis=1)  # (Q,)
        scores.append(float(max_sims.sum()))

    # Sort by score descending
    ranked = sorted(zip(candidate_indices, scores), key=lambda x: -x[1])
    ranked = ranked[:final_limit]
    return [r[0] for r in ranked], [r[1] for r in ranked]


def _load_hdf5_embeddings(data_dir, dataset_id, embedding_id):
    """Load embeddings from legacy HDF5 file."""
    import h5py

    emb_path = os.path.join(data_dir, dataset_id, "embeddings", f"{embedding_id}.h5")
    if not os.path.exists(emb_path):
        raise FileNotFoundError(f"No embeddings found for {embedding_id} "
                                f"(checked LanceDB and HDF5 at {emb_path})")
    with h5py.File(emb_path, "r") as f:
        return np.array(f["embeddings"])


def get_embedding_stats(data_dir, dataset_id, embedding_id):
    """Compute min/max values per dimension for the embedding."""
    embeddings = load_embeddings(data_dir, dataset_id, embedding_id)
    return {
        "min_values": np.min(embeddings, axis=0).tolist(),
        "max_values": np.max(embeddings, axis=0).tolist(),
        "dimensions": embeddings.shape[1],
        "count": embeddings.shape[0],
    }


def get_storage_format(data_dir, dataset_id, embedding_id):
    """Detect the storage format for an embedding.

    Returns
    -------
    str : "lancedb", "hdf5", or "none"
    """
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name in _get_table_names(db):
        return "lancedb"

    emb_path = os.path.join(data_dir, dataset_id, "embeddings", f"{embedding_id}.h5")
    if os.path.exists(emb_path):
        return "hdf5"

    return "none"


def migrate_hdf5_to_lancedb(data_dir, dataset_id, embedding_id, batch_size=1000,
                             on_progress=None):
    """Migrate an HDF5 embedding to LanceDB format.

    Parameters
    ----------
    on_progress : callable or None
        Called with (current_row, total_rows) for progress reporting.

    Returns
    -------
    dict with migration stats
    """
    import h5py

    emb_path = os.path.join(data_dir, dataset_id, "embeddings", f"{embedding_id}.h5")
    if not os.path.exists(emb_path):
        raise FileNotFoundError(f"No HDF5 file at {emb_path}")

    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)

    with h5py.File(emb_path, "r") as f:
        total_rows = f["embeddings"].shape[0]
        dimensions = f["embeddings"].shape[1]

    # Check if already migrated. A table can also be left behind by an
    # interrupted migration (killed process) — in that case it is shorter
    # than the HDF5 source and must be dropped and re-migrated, otherwise it
    # shadows the intact HDF5 in load_embeddings and silently truncates data.
    if table_name in _get_table_names(db):
        tbl = db.open_table(table_name)
        existing = tbl.count_rows()
        if existing == total_rows:
            return {"status": "already_migrated", "rows": existing}
        print(f"Found partial migration ({existing}/{total_rows} rows) — "
              "dropping and re-migrating")
        db.drop_table(table_name)

    try:
        # Copy from HDF5 in batches to avoid memory issues
        with h5py.File(emb_path, "r") as f:
            for start in range(0, total_rows, batch_size):
                end = min(start + batch_size, total_rows)
                vectors = np.array(f["embeddings"][start:end])
                append_embeddings(data_dir, dataset_id, embedding_id,
                                vectors, start_index=start)
                if on_progress:
                    on_progress(end, total_rows)

        # Verify migration: row count plus a random sample of vectors.
        lance_count = get_embedding_count(data_dir, dataset_id, embedding_id)
        if lance_count != total_rows:
            raise RuntimeError(
                f"Migration verification failed: expected {total_rows} rows, "
                f"got {lance_count} in LanceDB"
            )

        lance_vectors = load_embeddings(data_dir, dataset_id, embedding_id)
        rng = np.random.default_rng(0)
        sample_size = min(16, total_rows)
        sample = rng.choice(total_rows, size=sample_size, replace=False)
        # Always include the endpoints
        check_indices = sorted(set(sample.tolist()) | {0, total_rows - 1})
        with h5py.File(emb_path, "r") as f:
            for idx in check_indices:
                h5_vec = np.array(f["embeddings"][idx])
                if not np.allclose(lance_vectors[idx], h5_vec, atol=1e-6):
                    raise RuntimeError(
                        f"Migration verification failed: vector mismatch at row {idx}"
                    )
    except BaseException:
        # Never leave a partial table behind: it would shadow the intact
        # HDF5 file in load_embeddings.
        if table_name in _get_table_names(db):
            db.drop_table(table_name)
        raise

    # Verification passed — remove the HDF5 file
    h5_size = os.path.getsize(emb_path)
    os.remove(emb_path)

    return {
        "status": "migrated",
        "rows": total_rows,
        "dimensions": dimensions,
        "source": emb_path,
        "hdf5_removed": True,
        "space_freed_bytes": h5_size,
        "space_freed": _human_readable_size(h5_size),
    }


def estimate_embedding_storage(num_rows, dimensions, has_tokens=False, avg_tokens_per_doc=50):
    """Estimate storage requirements for embeddings.

    Returns dict with estimated sizes in bytes and human-readable strings.
    """
    mean_bytes_per_float = 4  # float32
    token_bytes_per_float = 2  # float16 (see append_embeddings schema)

    # Mean vector storage
    mean_bytes = num_rows * dimensions * mean_bytes_per_float

    # Token vector storage (if late interaction)
    token_bytes = 0
    if has_tokens:
        token_bytes = num_rows * avg_tokens_per_doc * dimensions * token_bytes_per_float

    # LanceDB overhead (~20% for metadata, indices, etc.)
    overhead = 1.2
    total_bytes = int((mean_bytes + token_bytes) * overhead)

    return {
        "mean_vector_bytes": mean_bytes,
        "token_vector_bytes": token_bytes,
        "total_bytes": total_bytes,
        "total_human": _human_readable_size(total_bytes),
        "num_rows": num_rows,
        "dimensions": dimensions,
        "has_tokens": has_tokens,
        "avg_tokens_per_doc": avg_tokens_per_doc if has_tokens else 0,
    }


def _human_readable_size(size_bytes):
    """Convert bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"
