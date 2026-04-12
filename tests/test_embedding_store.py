"""Tests for the LanceDB-backed embedding store."""

import os
import json
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
        load_embeddings,
        get_embedding_count,
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
        load_token_vectors,
        has_token_vectors,
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
