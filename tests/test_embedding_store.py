"""Tests for the LanceDB-backed embedding store."""

import json
import os
import tempfile

import numpy as np
import pytest


@pytest.fixture
def data_dir():
    with tempfile.TemporaryDirectory() as d:
        dataset_dir = os.path.join(d, "test-dataset")
        os.makedirs(os.path.join(dataset_dir, "embeddings"))
        os.makedirs(os.path.join(dataset_dir, "lancedb"))
        yield d


def test_append_and_load(data_dir):
    from latentscope.util.embedding_store import append_embeddings, load_embeddings

    vectors = np.random.rand(10, 128).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors, start_index=0)

    loaded = load_embeddings(data_dir, "test-dataset", "embedding-001")
    assert loaded.shape == (10, 128)
    np.testing.assert_allclose(loaded, vectors, atol=1e-6)


def test_append_batches(data_dir):
    from latentscope.util.embedding_store import (
        append_embeddings,
        get_embedding_count,
        load_embeddings,
    )

    v1 = np.random.rand(5, 64).astype(np.float32)
    v2 = np.random.rand(5, 64).astype(np.float32)

    append_embeddings(data_dir, "test-dataset", "embedding-002", v1, start_index=0)
    assert get_embedding_count(data_dir, "test-dataset", "embedding-002") == 5

    append_embeddings(data_dir, "test-dataset", "embedding-002", v2, start_index=5)
    assert get_embedding_count(data_dir, "test-dataset", "embedding-002") == 10

    loaded = load_embeddings(data_dir, "test-dataset", "embedding-002")
    assert loaded.shape == (10, 64)
    np.testing.assert_allclose(loaded[:5], v1, atol=1e-6)
    np.testing.assert_allclose(loaded[5:], v2, atol=1e-6)


def test_token_vectors(data_dir):
    from latentscope.util.embedding_store import (
        append_embeddings,
        has_token_vectors,
        load_token_vectors,
    )

    mean_vecs = np.random.rand(3, 128).astype(np.float32)
    token_vecs = [
        np.random.rand(5, 128).astype(np.float32),
        np.random.rand(8, 128).astype(np.float32),
        np.random.rand(3, 128).astype(np.float32),
    ]

    append_embeddings(
        data_dir, "test-dataset", "embedding-003", mean_vecs,
        start_index=0, token_vectors_list=token_vecs,
    )

    assert has_token_vectors(data_dir, "test-dataset", "embedding-003")
    loaded_tokens = load_token_vectors(data_dir, "test-dataset", "embedding-003")
    assert len(loaded_tokens) == 3
    assert loaded_tokens[0].shape == (5, 128)
    assert loaded_tokens[1].shape == (8, 128)
    assert loaded_tokens[2].shape == (3, 128)


def test_no_token_vectors(data_dir):
    from latentscope.util.embedding_store import append_embeddings, has_token_vectors

    vectors = np.random.rand(5, 64).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-004", vectors, start_index=0)
    assert not has_token_vectors(data_dir, "test-dataset", "embedding-004")


def test_search_nn(data_dir):
    from latentscope.util.embedding_store import append_embeddings, search_nn

    # Create some distinct vectors
    vectors = np.eye(10, 128, dtype=np.float32)  # identity-like
    append_embeddings(data_dir, "test-dataset", "embedding-005", vectors, start_index=0)

    query = vectors[3]  # search for exact match
    indices, distances = search_nn(data_dir, "test-dataset", "embedding-005", query, limit=3)
    assert len(indices) == 3
    assert indices[0] == 3  # exact match should be first
    assert distances[0] < 0.01  # very close distance


def test_late_interaction_search(data_dir):
    from latentscope.util.embedding_store import (
        append_embeddings,
        search_late_interaction,
    )

    # Create docs with token vectors
    mean_vecs = np.random.rand(20, 64).astype(np.float32)
    token_vecs = [np.random.rand(5, 64).astype(np.float32) for _ in range(20)]

    append_embeddings(
        data_dir, "test-dataset", "embedding-006", mean_vecs,
        start_index=0, token_vectors_list=token_vecs,
    )

    query_tokens = np.random.rand(3, 64).astype(np.float32)
    indices, scores = search_late_interaction(
        data_dir, "test-dataset", "embedding-006",
        query_tokens, prefilter_limit=10, final_limit=5,
    )
    assert len(indices) <= 5
    assert len(scores) <= 5
    # Scores should be sorted descending
    for i in range(len(scores) - 1):
        assert scores[i] >= scores[i + 1]


def test_hdf5_fallback(data_dir):
    """Test backward compatibility with HDF5 files."""
    import h5py

    from latentscope.util.embedding_store import load_embeddings

    vectors = np.random.rand(10, 64).astype(np.float32)
    h5_path = os.path.join(data_dir, "test-dataset", "embeddings", "embedding-099.h5")
    with h5py.File(h5_path, "w") as f:
        f.create_dataset("embeddings", data=vectors)

    loaded = load_embeddings(data_dir, "test-dataset", "embedding-099")
    np.testing.assert_allclose(loaded, vectors, atol=1e-6)


def test_estimate_storage():
    from latentscope.util.embedding_store import estimate_embedding_storage

    # Standard embeddings
    est = estimate_embedding_storage(10000, 768)
    assert est["total_bytes"] > 0
    assert "MB" in est["total_human"] or "KB" in est["total_human"]
    assert not est["has_tokens"]

    # Late interaction embeddings
    est_li = estimate_embedding_storage(10000, 128, has_tokens=True, avg_tokens_per_doc=50)
    assert est_li["token_vector_bytes"] > 0
    assert est_li["total_bytes"] > est["total_bytes"]


def test_get_embedding_stats(data_dir):
    from latentscope.util.embedding_store import append_embeddings, get_embedding_stats

    vectors = np.array([[1.0, 2.0, 3.0], [-1.0, 0.0, 5.0]], dtype=np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-007", vectors, start_index=0)

    stats = get_embedding_stats(data_dir, "test-dataset", "embedding-007")
    assert stats["dimensions"] == 3
    assert stats["count"] == 2
    assert stats["min_values"] == [-1.0, 0.0, 3.0]
    assert stats["max_values"] == [1.0, 2.0, 5.0]


def _write_h5(data_dir, embedding_id, vectors):
    import h5py

    h5_path = os.path.join(data_dir, "test-dataset", "embeddings", f"{embedding_id}.h5")
    with h5py.File(h5_path, "w") as f:
        f.create_dataset("embeddings", data=vectors)
    return h5_path


def test_migration_deletes_hdf5_after_verification(data_dir):
    from latentscope.util.embedding_store import load_embeddings, migrate_hdf5_to_lancedb

    vectors = np.random.rand(57, 16).astype(np.float32)
    h5_path = _write_h5(data_dir, "embedding-001", vectors)

    result = migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001",
                                     batch_size=10)
    assert result["status"] == "migrated"
    assert result["rows"] == 57
    assert not os.path.exists(h5_path)
    np.testing.assert_allclose(
        load_embeddings(data_dir, "test-dataset", "embedding-001"), vectors, atol=1e-6)


def test_migration_redoes_partial_table(data_dir):
    """An interrupted migration leaves a short LanceDB table that shadows the
    intact HDF5. Re-running the migration must detect the count mismatch,
    drop the partial table, and migrate fully (not report already_migrated)."""
    from latentscope.util.embedding_store import (
        append_embeddings,
        load_embeddings,
        migrate_hdf5_to_lancedb,
    )

    vectors = np.random.rand(40, 16).astype(np.float32)
    _write_h5(data_dir, "embedding-001", vectors)
    # simulate the partial table from a killed migration
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors[:15])

    result = migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001",
                                     batch_size=10)
    assert result["status"] == "migrated"
    loaded = load_embeddings(data_dir, "test-dataset", "embedding-001")
    assert loaded.shape == (40, 16)
    np.testing.assert_allclose(loaded, vectors, atol=1e-6)


def test_migration_complete_table_reports_already_migrated(data_dir):
    from latentscope.util.embedding_store import append_embeddings, migrate_hdf5_to_lancedb

    vectors = np.random.rand(20, 16).astype(np.float32)
    _write_h5(data_dir, "embedding-001", vectors)
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors)

    result = migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001")
    assert result["status"] == "already_migrated"
    assert result["rows"] == 20


def test_failed_migration_leaves_no_partial_table(data_dir, monkeypatch):
    """If the copy fails mid-way the partial table must be dropped so it never
    shadows the intact HDF5 file, and the HDF5 source must survive."""
    import latentscope.util.embedding_store as store

    vectors = np.random.rand(40, 16).astype(np.float32)
    h5_path = _write_h5(data_dir, "embedding-001", vectors)

    real_append = store.append_embeddings
    calls = {"n": 0}

    def flaky_append(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] > 2:
            raise RuntimeError("simulated write failure")
        return real_append(*args, **kwargs)

    monkeypatch.setattr(store, "append_embeddings", flaky_append)
    with pytest.raises(RuntimeError, match="simulated write failure"):
        store.migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001",
                                      batch_size=10)

    assert os.path.exists(h5_path)
    assert store.get_storage_format(data_dir, "test-dataset", "embedding-001") == "hdf5"
    # and load_embeddings reads the intact HDF5, not a truncated table
    loaded = store.load_embeddings(data_dir, "test-dataset", "embedding-001")
    assert loaded.shape == (40, 16)


def test_list_embedding_ids(data_dir):
    from latentscope.util.embedding_store import append_embeddings, list_embedding_ids

    assert list_embedding_ids(data_dir, "test-dataset") == []
    vectors = np.random.rand(5, 8).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors)
    append_embeddings(data_dir, "test-dataset", "embedding-003", vectors)
    assert sorted(list_embedding_ids(data_dir, "test-dataset")) == [
        "embedding-001", "embedding-003"]


def test_token_vectors_stored_as_float16(data_dir):
    """The explicit schema stores token vectors fp16 (4x smaller than the
    float64 LanceDB used to infer from python lists) and mean vectors fp32."""
    import lancedb
    import pyarrow as pa

    from latentscope.util.embedding_store import append_embeddings, load_token_vectors

    vectors = np.random.rand(4, 8).astype(np.float32)
    token_vectors = [np.random.rand(t, 8).astype(np.float32) for t in (3, 5, 2, 7)]
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors,
                      token_vectors_list=token_vectors)

    db = lancedb.connect(os.path.join(data_dir, "test-dataset", "lancedb"))
    schema = db.open_table("emb-embedding-001").schema
    assert schema.field("vector").type == pa.list_(pa.float32(), 8)
    assert schema.field("token_vectors").type == pa.list_(pa.list_(pa.float16(), 8))
    assert schema.field("num_tokens").type == pa.int32()

    # roundtrip within fp16 precision
    loaded = load_token_vectors(data_dir, "test-dataset", "embedding-001")
    assert [tv.shape for tv in loaded] == [(3, 8), (5, 8), (2, 8), (7, 8)]
    np.testing.assert_allclose(loaded[1], token_vectors[1], atol=1e-3)


def test_append_to_legacy_schema_table(data_dir):
    """Resuming a run on a table created before the explicit schema must cast
    the new batch to the legacy schema instead of failing."""
    import lancedb

    from latentscope.util.embedding_store import append_embeddings, load_embeddings

    # simulate a legacy table created via list-of-dicts inference
    legacy_rows = [
        {"ls_index": i, "vector": np.random.rand(8).tolist()} for i in range(5)
    ]
    db = lancedb.connect(os.path.join(data_dir, "test-dataset", "lancedb"))
    db.create_table("emb-embedding-001", legacy_rows)

    vectors = np.random.rand(3, 8).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors,
                      start_index=5)
    loaded = load_embeddings(data_dir, "test-dataset", "embedding-001")
    assert loaded.shape == (8, 8)
    np.testing.assert_allclose(loaded[5], vectors[0], atol=1e-6)


def test_indexes_and_optimize(data_dir):
    """create_vector_index / create_scalar_index / optimize_table run cleanly
    and search results are unchanged afterwards."""
    from latentscope.util.embedding_store import (
        append_embeddings,
        create_scalar_index,
        create_vector_index,
        load_token_vectors,
        optimize_table,
        search_nn,
    )

    rng = np.random.default_rng(0)
    n, dim = 400, 16
    vectors = rng.normal(size=(n, dim)).astype(np.float32)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    token_vectors = [rng.normal(size=(4, dim)).astype(np.float32) for _ in range(n)]
    # write in several batches like a real run (multiple fragments)
    for start in range(0, n, 100):
        append_embeddings(data_dir, "test-dataset", "embedding-001",
                          vectors[start:start + 100], start_index=start,
                          token_vectors_list=token_vectors[start:start + 100])

    optimize_table(data_dir, "test-dataset", "embedding-001")
    create_vector_index(data_dir, "test-dataset", "embedding-001")
    create_scalar_index(data_dir, "test-dataset", "embedding-001")

    indices, _ = search_nn(data_dir, "test-dataset", "embedding-001",
                           vectors[37], limit=5)
    assert 37 in indices
    loaded = load_token_vectors(data_dir, "test-dataset", "embedding-001",
                                indices=[37, 250])
    assert len(loaded) == 2


def test_estimate_storage_token_bytes():
    from latentscope.util.embedding_store import estimate_embedding_storage

    est = estimate_embedding_storage(1000, 128, has_tokens=True,
                                     avg_tokens_per_doc=100)
    assert est["mean_vector_bytes"] == 1000 * 128 * 4
    assert est["token_vector_bytes"] == 1000 * 100 * 128 * 2  # fp16


def test_vector_index_with_non_divisible_dimension(data_dir):
    """IVF_PQ needs num_sub_vectors to divide dim; user-truncated dimensions
    (e.g. --dimensions=33) must not crash index creation at the end of an
    embedding run."""
    from latentscope.util.embedding_store import append_embeddings, create_vector_index, search_nn

    rng = np.random.default_rng(0)
    vectors = rng.normal(size=(300, 33)).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-001", vectors)
    create_vector_index(data_dir, "test-dataset", "embedding-001")
    indices, _ = search_nn(data_dir, "test-dataset", "embedding-001", vectors[5], limit=5)
    assert 5 in indices


# ---------------------------------------------------------------------------
# Migration fidelity (WP-H): full-corpus row-by-row parity + format flip
# ---------------------------------------------------------------------------

def test_migration_preserves_every_row_in_order(data_dir):
    """A many-batch migration reproduces the source vectors exactly and in
    ls_index order (not just a random sample), and flips the storage format
    hdf5 -> lancedb."""
    from latentscope.util.embedding_store import (
        get_storage_format,
        load_embeddings,
        migrate_hdf5_to_lancedb,
    )

    rng = np.random.default_rng(3)
    # 253 is not a multiple of the batch size -> a short final batch
    vectors = rng.normal(size=(253, 24)).astype(np.float32)
    _write_h5(data_dir, "embedding-001", vectors)
    assert get_storage_format(data_dir, "test-dataset", "embedding-001") == "hdf5"

    result = migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001",
                                     batch_size=32)
    assert result["status"] == "migrated"
    assert result["rows"] == 253
    assert get_storage_format(data_dir, "test-dataset", "embedding-001") == "lancedb"

    loaded = load_embeddings(data_dir, "test-dataset", "embedding-001")
    assert loaded.shape == (253, 24)
    # exact, ordered parity for every single row
    np.testing.assert_allclose(loaded, vectors, atol=1e-6)


def test_migration_reports_monotonic_progress(data_dir):
    """The on_progress callback fires with (current, total) advancing to total."""
    from latentscope.util.embedding_store import migrate_hdf5_to_lancedb

    vectors = np.random.rand(100, 8).astype(np.float32)
    _write_h5(data_dir, "embedding-001", vectors)

    seen = []
    migrate_hdf5_to_lancedb(data_dir, "test-dataset", "embedding-001",
                            batch_size=30, on_progress=lambda c, t: seen.append((c, t)))
    assert seen, "on_progress was never called"
    assert all(t == 100 for _, t in seen)
    currents = [c for c, _ in seen]
    assert currents == sorted(currents)  # monotonically non-decreasing
    assert currents[-1] == 100  # reaches the full count


# ---------------------------------------------------------------------------
# MaxSim ranking correctness (WP-H): relevant doc must outrank irrelevant one
# ---------------------------------------------------------------------------

def test_maxsim_ranks_relevant_above_irrelevant(data_dir):
    """Hand-built multi-vector fixture: a two-token query [a, b].
      * doc_full has tokens along both a and b        -> MaxSim ~ 2
      * doc_partial has a token along a only           -> MaxSim ~ 1
      * doc_irrelevant has tokens on orthogonal dirs   -> MaxSim ~ 0
    The final ranking must be full > partial > irrelevant."""
    from latentscope.util.embedding_store import (
        append_embeddings,
        search_late_interaction,
    )

    dim = 16

    def _unit(i):
        v = np.zeros(dim, dtype=np.float32)
        v[i] = 1.0
        return v

    a, b = _unit(0), _unit(1)
    c, d = _unit(2), _unit(3)  # distractor directions

    token_vecs = [
        np.stack([a, b, c]),        # 0: doc_full   (both query dirs present)
        np.stack([a, c, d]),        # 1: doc_partial(only a present)
        np.stack([c, d]),           # 2: doc_irrelevant
    ]
    idx_full, idx_partial, idx_irrelevant = 0, 1, 2
    mean_vecs = np.stack([tv.mean(axis=0) for tv in token_vecs]).astype(np.float32)

    append_embeddings(data_dir, "test-dataset", "embedding-001", mean_vecs,
                      token_vectors_list=[tv.astype(np.float32) for tv in token_vecs])

    query_tokens = np.stack([a, b]).astype(np.float32)
    indices, scores = search_late_interaction(
        data_dir, "test-dataset", "embedding-001", query_tokens, final_limit=5)

    assert indices[0] == idx_full, f"expected doc_full first, got {indices}"
    score_by_idx = dict(zip(indices, scores))
    # strict ordering of the three planted relevance tiers
    assert score_by_idx[idx_full] > score_by_idx[idx_partial] > score_by_idx[idx_irrelevant]
    # doc_full matches both query tokens -> close to 2.0
    assert score_by_idx[idx_full] == pytest.approx(2.0, abs=1e-4)


def test_maxsim_single_relevant_doc_wins_among_noise(data_dir):
    """One planted doc shares the query's rare direction; the rest are random
    noise. MaxSim must surface the planted doc at rank 0."""
    from latentscope.util.embedding_store import (
        append_embeddings,
        search_late_interaction,
    )

    rng = np.random.default_rng(11)
    dim = 32
    n = 40
    rare = np.zeros(dim, dtype=np.float32)
    rare[7] = 1.0

    token_vecs = []
    for _ in range(n):
        t = rng.normal(size=(4, dim)).astype(np.float32)
        t /= np.linalg.norm(t, axis=1, keepdims=True)
        token_vecs.append(t)
    planted = 23
    token_vecs[planted][0] = rare  # inject the rare direction as one token

    mean_vecs = np.stack([tv.mean(axis=0) for tv in token_vecs]).astype(np.float32)
    append_embeddings(data_dir, "test-dataset", "embedding-001", mean_vecs,
                      token_vectors_list=token_vecs)

    indices, scores = search_late_interaction(
        data_dir, "test-dataset", "embedding-001",
        rare[None, :].astype(np.float32), final_limit=5)
    assert indices[0] == planted, f"expected planted doc {planted} first, got {indices[:5]}"
    assert scores[0] == pytest.approx(1.0, abs=1e-4)
    assert scores[0] > scores[1]
