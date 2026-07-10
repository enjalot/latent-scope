"""Incremental / aligned UMAP workflows (issue #142).

Covers the pure helpers in latentscope/scripts/registration.py (umeyama
similarity registration, growing-window AlignedUMAP relations, source-frame
normalization) and the ``ls-umap --transform-from`` flow driven through a fake
pickled reducer — no real UMAP/AlignedUMAP fits are run here.
"""
import json
import os
import pickle

import numpy as np
import pandas as pd
import pytest

from latentscope.scripts.registration import (
    apply_normalization,
    apply_similarity,
    count_out_of_frame,
    prefix_relations,
    register_layout,
    umeyama_2d,
)
from tests.test_pipeline_e2e import FakeEmbedProvider, make_input_df

N_ROWS = 120  # make_input_df(): 3 topics x 40 rows


# ---------------------------------------------------------------------------
# umeyama similarity registration (pure)
# ---------------------------------------------------------------------------

def _rotation(theta):
    return np.array([[np.cos(theta), -np.sin(theta)],
                     [np.sin(theta), np.cos(theta)]])


def test_umeyama_recovers_similarity_transform():
    rng = np.random.default_rng(0)
    src = rng.normal(size=(50, 2))
    c, R, t = 2.5, _rotation(0.7), np.array([3.0, -1.0])
    dst = c * src @ R.T + t

    c_hat, R_hat, t_hat = umeyama_2d(src, dst)
    assert abs(c_hat - c) < 1e-6
    assert np.allclose(R_hat, R, atol=1e-6)
    assert np.allclose(t_hat, t, atol=1e-6)
    assert np.allclose(apply_similarity(src, c_hat, R_hat, t_hat), dst, atol=1e-6)


def test_umeyama_recovers_reflection():
    rng = np.random.default_rng(1)
    src = rng.normal(size=(40, 2))
    reflect = np.array([[1.0, 0.0], [0.0, -1.0]])
    R = _rotation(-0.3) @ reflect  # improper: det = -1
    c, t = 0.4, np.array([-2.0, 5.0])
    dst = c * src @ R.T + t

    c_hat, R_hat, t_hat = umeyama_2d(src, dst)
    assert abs(np.linalg.det(R_hat) + 1.0) < 1e-6  # reflection preserved
    assert np.allclose(apply_similarity(src, c_hat, R_hat, t_hat), dst, atol=1e-6)


def test_umeyama_rejects_degenerate_input():
    with pytest.raises(ValueError):
        umeyama_2d(np.zeros((1, 2)), np.zeros((1, 2)))
    with pytest.raises(ValueError):
        umeyama_2d(np.ones((5, 2)), np.random.default_rng(2).normal(size=(5, 2)))
    with pytest.raises(ValueError):
        umeyama_2d(np.zeros((5, 2)), np.zeros((4, 2)))


def test_register_layout_uses_shared_prefix():
    rng = np.random.default_rng(3)
    new_layout = rng.normal(size=(30, 2))
    c, R, t = 1.7, _rotation(1.1), np.array([0.5, 0.25])
    # target only covers the first 20 rows (the published, smaller layout)
    target = c * new_layout[:20] @ R.T + t

    registered, (c_hat, R_hat, t_hat) = register_layout(new_layout, target)
    assert registered.shape == (30, 2)
    # shared prefix lands exactly on the target; the tail gets the same transform
    assert np.allclose(registered[:20], target, atol=1e-6)
    assert np.allclose(registered, apply_similarity(new_layout, c_hat, R_hat, t_hat))
    assert abs(c_hat - c) < 1e-6


# ---------------------------------------------------------------------------
# growing-window relations (pure)
# ---------------------------------------------------------------------------

def test_prefix_relations_unequal_lengths():
    relations = prefix_relations([5, 8, 3])
    assert len(relations) == 2
    assert relations[0] == {j: j for j in range(5)}  # min(5, 8)
    assert relations[1] == {j: j for j in range(3)}  # min(8, 3)


def test_prefix_relations_equal_lengths_match_identity():
    relations = prefix_relations([4, 4])
    assert relations == [{0: 0, 1: 1, 2: 2, 3: 3}]


# ---------------------------------------------------------------------------
# source-frame normalization (pure)
# ---------------------------------------------------------------------------

def test_apply_normalization_matches_fit_time_formula():
    min_values, max_values = np.array([-10.0, 0.0]), np.array([10.0, 4.0])
    coords = np.array([[-10.0, 0.0], [10.0, 4.0], [0.0, 2.0]])
    normalized = apply_normalization(coords, min_values, max_values)
    assert np.allclose(normalized, [[-1.0, -1.0], [1.0, 1.0], [0.0, 0.0]])


def test_apply_normalization_allows_out_of_frame_points():
    normalized = apply_normalization([[15.0, 2.0]], [-10.0, 0.0], [10.0, 4.0])
    assert normalized[0, 0] > 1.0
    assert count_out_of_frame(normalized) == 1
    assert count_out_of_frame([[0.0, 0.0], [-1.0, 1.0]]) == 0


# ---------------------------------------------------------------------------
# --transform-from flow (fake pickled reducer; no real UMAP fit)
# ---------------------------------------------------------------------------

class FakeReducer:
    """Picklable stand-in for a fitted CPU umap reducer."""

    def transform(self, X):
        X = np.asarray(X)
        return np.stack([X[:, 0] * 10.0, X[:, 1] * 10.0], axis=1).astype(np.float32)


@pytest.fixture
def embedded_dataset(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    dataset_id = "incremental"
    ingest(dataset_id, make_input_df(), text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=50)
    return tmp_data_dir, dataset_id


def _make_source_umap(data_dir, dataset_id, n_old, umap_id="umap-001",
                      embedding_id="embedding-001", with_pkl=True, extra_meta=None):
    """Fabricate a previously published umap (parquet + meta + optional pickle)."""
    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    os.makedirs(umap_dir, exist_ok=True)

    rng = np.random.default_rng(7)
    coords = rng.uniform(-1, 1, size=(n_old, 2)).astype(np.float32)
    pd.DataFrame(coords, columns=["x", "y"]).to_parquet(
        os.path.join(umap_dir, f"{umap_id}.parquet"))

    meta = {
        "id": umap_id,
        "embedding_id": embedding_id,
        "neighbors": 25,
        "min_dist": 0.1,
        "min_values": [-12.0, -12.0],
        "max_values": [12.0, 12.0],
    }
    if extra_meta:
        meta.update(extra_meta)
    with open(os.path.join(umap_dir, f"{umap_id}.json"), "w") as f:
        json.dump(meta, f)

    if with_pkl:
        with open(os.path.join(umap_dir, f"{umap_id}.pkl"), "wb") as f:
            pickle.dump(FakeReducer(), f)
    return umap_dir


def test_transform_from_appends_new_rows(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    umap_dir = _make_source_umap(data_dir, dataset_id, n_old=100)

    new_id = transform_umap(dataset_id, "embedding-001", "umap-001")
    assert new_id == "umap-002"

    old = pd.read_parquet(os.path.join(umap_dir, "umap-001.parquet"))
    combined = pd.read_parquet(os.path.join(umap_dir, "umap-002.parquet"))
    assert len(combined) == N_ROWS
    # old rows are copied verbatim (published positions stay pixel-stable)
    assert np.array_equal(old[["x", "y"]].to_numpy(),
                          combined.iloc[:100][["x", "y"]].to_numpy())

    # new rows are the reducer output mapped into the SOURCE's [-1, 1] frame
    from latentscope.util.embedding_store import load_embeddings
    embeddings = load_embeddings(data_dir, dataset_id, "embedding-001")
    expected = apply_normalization(FakeReducer().transform(embeddings[100:]),
                                   [-12.0, -12.0], [12.0, 12.0])
    assert np.allclose(combined.iloc[100:][["x", "y"]].to_numpy(), expected, atol=1e-5)

    with open(os.path.join(umap_dir, "umap-002.json")) as f:
        meta = json.load(f)
    assert meta["transformed_from"] == "umap-001"
    assert meta["reducer_id"] == "umap-001"
    assert meta["embedding_id"] == "embedding-001"
    # the source's frame carries over
    assert meta["min_values"] == [-12.0, -12.0]
    assert meta["max_values"] == [12.0, 12.0]
    # the reducer pickle is NOT copied (they are large); the chain resolves it
    assert not os.path.exists(os.path.join(umap_dir, "umap-002.pkl"))
    assert os.path.exists(os.path.join(umap_dir, "umap-002.png"))


def test_transform_from_resolves_reducer_chain(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    umap_dir = _make_source_umap(data_dir, dataset_id, n_old=90, umap_id="umap-001")
    # umap-002 was itself a transform output: no pickle of its own, but its meta
    # points back to the umap whose reducer produced it
    _make_source_umap(data_dir, dataset_id, n_old=100, umap_id="umap-002",
                      with_pkl=False,
                      extra_meta={"transformed_from": "umap-001",
                                  "reducer_id": "umap-001"})

    new_id = transform_umap(dataset_id, "embedding-001", "umap-002")
    assert new_id == "umap-003"
    combined = pd.read_parquet(os.path.join(umap_dir, "umap-003.parquet"))
    assert len(combined) == N_ROWS

    with open(os.path.join(umap_dir, "umap-003.json")) as f:
        meta = json.load(f)
    assert meta["transformed_from"] == "umap-002"
    assert meta["reducer_id"] == "umap-001"


def test_transform_from_registered_source_uses_similarity(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    registration = {"scale": 0.05,
                    "rotation": [[0.0, -1.0], [1.0, 0.0]],
                    "translation": [0.1, -0.2]}
    umap_dir = _make_source_umap(data_dir, dataset_id, n_old=100,
                                 extra_meta={"registered_to": "umap-000",
                                             "registration": registration})

    new_id = transform_umap(dataset_id, "embedding-001", "umap-001")
    combined = pd.read_parquet(os.path.join(umap_dir, f"{new_id}.parquet"))

    from latentscope.util.embedding_store import load_embeddings
    embeddings = load_embeddings(data_dir, dataset_id, "embedding-001")
    expected = apply_similarity(FakeReducer().transform(embeddings[100:]),
                                registration["scale"],
                                np.array(registration["rotation"]),
                                np.array(registration["translation"]))
    assert np.allclose(combined.iloc[100:][["x", "y"]].to_numpy(), expected, atol=1e-5)


def test_transform_from_errors_without_saved_reducer(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    _make_source_umap(data_dir, dataset_id, n_old=100, with_pkl=False)

    with pytest.raises(ValueError, match="--save"):
        transform_umap(dataset_id, "embedding-001", "umap-001")


def test_transform_from_errors_on_mismatched_embedding(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    _make_source_umap(data_dir, dataset_id, n_old=100)

    with pytest.raises(ValueError, match="embedding"):
        transform_umap(dataset_id, "embedding-002", "umap-001")


def test_transform_from_no_new_rows_is_a_noop(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import transform_umap
    umap_dir = _make_source_umap(data_dir, dataset_id, n_old=N_ROWS)

    assert transform_umap(dataset_id, "embedding-001", "umap-001") is None
    assert not os.path.exists(os.path.join(umap_dir, "umap-002.json"))
    assert not os.path.exists(os.path.join(umap_dir, "umap-002.parquet"))
