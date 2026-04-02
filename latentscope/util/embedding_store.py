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

    n = vectors.shape[0]

    # Build list of row dicts (LanceDB requires list-of-dicts for add/create)
    rows = []
    for i in range(n):
        row = {
            "ls_index": start_index + i,
            "vector": vectors[i].tolist(),
        }
        if token_vectors_list is not None:
            row["token_vectors"] = token_vectors_list[i].tolist()
            row["num_tokens"] = len(token_vectors_list[i])
        rows.append(row)

    if table_name in _get_table_names(db):
        tbl = db.open_table(table_name)
        tbl.add(rows)
    else:
        db.create_table(table_name, rows)


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
        df = tbl.to_pandas()
        df = df.sort_values("ls_index")
        vectors = np.array(df["vector"].tolist(), dtype=np.float32)
        return vectors

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
    """Create an ANN index on the mean vector column."""
    db = _connect(data_dir, dataset_id)
    table_name = _embedding_table_name(embedding_id)
    if table_name not in _get_table_names(db):
        return
    tbl = db.open_table(table_name)
    num_rows = tbl.count_rows()
    if num_rows < 256:
        return  # too few rows for IVF index
    dim = len(tbl.to_pandas().iloc[0]["vector"])
    partitions = min(256, num_rows // 10)
    sub_vectors = max(1, dim // 16)
    tbl.create_index(
        num_partitions=partitions,
        num_sub_vectors=sub_vectors,
        metric=metric,
    )


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
        tbl.search(query_vector)
        .metric(metric)
        .select(["ls_index"])
        .limit(limit)
        .to_list()
    )
    indices = [r["ls_index"] for r in results]
    distances = [r["_distance"] for r in results]
    return indices, distances


def search_late_interaction(data_dir, dataset_id, embedding_id, query_token_vectors,
                            prefilter_limit=200, final_limit=50, metric="cosine"):
    """Late interaction (MaxSim) search.

    1. Use the mean of query token vectors to find candidate documents via ANN.
    2. Load per-token vectors for candidates.
    3. Re-rank using MaxSim scoring.

    Parameters
    ----------
    query_token_vectors : np.ndarray
        Shape (Q, D) - per-token vectors from the query.
    prefilter_limit : int
        Number of candidates to retrieve via ANN before re-ranking.
    final_limit : int
        Number of final results to return.

    Returns
    -------
    indices : list[int]
    scores : list[float]
    """
    # Step 1: ANN search using mean of query tokens
    query_mean = query_token_vectors.mean(axis=0).astype(np.float32)
    candidate_indices, _ = search_nn(
        data_dir, dataset_id, embedding_id,
        query_mean, limit=prefilter_limit, metric=metric,
    )

    if not candidate_indices:
        return [], []

    # Step 2: Load token vectors for candidates
    candidate_token_vecs = load_token_vectors(
        data_dir, dataset_id, embedding_id, indices=candidate_indices,
    )

    # Step 3: MaxSim re-ranking
    scores = []
    for doc_tokens in candidate_token_vecs:
        # doc_tokens shape: (T_d, D), query_token_vectors shape: (Q, D)
        # MaxSim: for each query token, find max similarity with any doc token, then sum
        if len(doc_tokens) == 0:
            scores.append(0.0)
            continue
        # Normalize for cosine similarity
        q_norm = query_token_vectors / (np.linalg.norm(query_token_vectors, axis=1, keepdims=True) + 1e-10)
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


def estimate_embedding_storage(num_rows, dimensions, has_tokens=False, avg_tokens_per_doc=50):
    """Estimate storage requirements for embeddings.

    Returns dict with estimated sizes in bytes and human-readable strings.
    """
    bytes_per_float = 4  # float32

    # Mean vector storage
    mean_bytes = num_rows * dimensions * bytes_per_float

    # Token vector storage (if late interaction)
    token_bytes = 0
    if has_tokens:
        token_bytes = num_rows * avg_tokens_per_doc * dimensions * bytes_per_float

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
