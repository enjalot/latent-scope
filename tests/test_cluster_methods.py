"""New clustering methods for #41: kmeans + gmm (WP-B / WP-H, CPU only).

Drives the real ``clusterer()`` on a tiny ingest->embed->umap fixture (mirroring
test_pipeline_e2e's deterministic fake provider) and checks that each method:
  * writes a valid ``cluster-NNN.json`` with the right ``method`` and a sane
    ``n_clusters``,
  * records the effective ``cluster_on`` (default -> ``umap`` for kmeans/gmm),
  * never emits noise (-1) so the noise-reassignment block is a clean no-op,
  * honors ``--cluster_on embedding`` by actually switching the input space.
"""
import json
import os

import pandas as pd
import pytest

# reuse the deterministic fake provider + input builder from the e2e suite
from tests.test_pipeline_e2e import (
    DIM,
    N_PER_TOPIC,
    TOPICS,
    FakeEmbedProvider,
    make_input_df,
)

N_TOTAL = N_PER_TOPIC * len(TOPICS)


@pytest.fixture
def umapped_dataset(tmp_data_dir, monkeypatch):
    """ingest -> embed (fake) -> umap, leaving a dataset ready to cluster."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest
    from latentscope.scripts.umapper import umapper

    dataset_id = "cluster-methods"
    ingest(dataset_id, make_input_df(), text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=50)
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    return tmp_data_dir, dataset_id


def _read_cluster_meta(data_dir, dataset_id, cluster_id="cluster-001"):
    with open(os.path.join(data_dir, dataset_id, "clusters",
                           f"{cluster_id}.json")) as f:
        return json.load(f)


def _read_cluster_df(data_dir, dataset_id, cluster_id="cluster-001"):
    return pd.read_parquet(os.path.join(data_dir, dataset_id, "clusters",
                                        f"{cluster_id}.parquet"))


@pytest.mark.parametrize("method", ["kmeans", "gmm"])
def test_method_writes_valid_meta_default_cluster_on_umap(umapped_dataset, method):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    n_requested = 3
    clusterer(dataset_id, "umap-001", samples=n_requested, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method=method)

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["method"] == method
    # kmeans/gmm default input space is the 2D umap projection
    assert meta["cluster_on"] == "umap"
    # samples maps directly to n_clusters/n_components for these methods
    assert meta["n_clusters"] == n_requested
    assert meta["n_noise"] == 0

    df = _read_cluster_df(data_dir, dataset_id)
    assert len(df) == N_TOTAL
    # no noise label survives -> reassignment no-op
    assert (df["cluster"] >= 0).all()
    assert df["cluster"].nunique() == n_requested
    # raw labels equal final labels because there was never any -1 to reassign
    assert df["cluster"].tolist() == df["raw_cluster"].tolist()


@pytest.mark.parametrize("method", ["kmeans", "gmm"])
def test_method_recovers_planted_topics(umapped_dataset, method):
    """With 3 planted topics and n_clusters=3, every cluster is populated."""
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method=method)
    df = _read_cluster_df(data_dir, dataset_id)
    counts = df["cluster"].value_counts()
    assert len(counts) == 3
    assert (counts > 0).all()


def test_cluster_on_embedding_switches_input_space(umapped_dataset, monkeypatch):
    """--cluster_on embedding must load the high-dim vectors (not the 2D umap)
    as the clustering input, and record it in the meta JSON."""
    data_dir, dataset_id = umapped_dataset
    import latentscope.scripts.cluster as cluster_mod
    from latentscope.scripts.cluster import clusterer

    calls = {"n": 0, "shapes": []}
    real_load = cluster_mod._load_embeddings

    def spy_load(ds, emb_id):
        calls["n"] += 1
        arr = real_load(ds, emb_id)
        calls["shapes"].append(arr.shape)
        return arr

    monkeypatch.setattr(cluster_mod, "_load_embeddings", spy_load)

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans",
              cluster_on="embedding")

    # the high-dim embeddings were loaded as the clustering input
    assert calls["n"] == 1
    assert calls["shapes"][0] == (N_TOTAL, DIM)

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["cluster_on"] == "embedding"
    assert meta["method"] == "kmeans"
    assert meta["n_clusters"] == 3

    df = _read_cluster_df(data_dir, dataset_id)
    assert (df["cluster"] >= 0).all()


def test_default_kmeans_does_not_load_high_dim_embeddings(umapped_dataset, monkeypatch):
    """The default (cluster_on=umap) path must cluster the 2D projection and
    never touch the embedding store for the cluster input."""
    data_dir, dataset_id = umapped_dataset
    import latentscope.scripts.cluster as cluster_mod
    from latentscope.scripts.cluster import clusterer

    calls = {"n": 0}
    real_load = cluster_mod._load_embeddings

    def spy_load(ds, emb_id):
        calls["n"] += 1
        return real_load(ds, emb_id)

    monkeypatch.setattr(cluster_mod, "_load_embeddings", spy_load)

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans")
    assert calls["n"] == 0


def test_cluster_on_explicit_umap_recorded(umapped_dataset):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    clusterer(dataset_id, "umap-001", samples=4, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="gmm",
              cluster_on="umap")
    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["cluster_on"] == "umap"
    assert meta["n_clusters"] == 4


@pytest.fixture
def umapped_dataset_3d(tmp_data_dir, monkeypatch):
    """ingest -> embed (fake) -> 3D umap, leaving a dataset ready to cluster.

    Mirrors ``umapped_dataset`` but projects to --dimensions 3 so the umap
    parquet carries an x, y, z column set (the feature/3d path)."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest
    from latentscope.scripts.umapper import umapper

    dataset_id = "cluster-methods-3d"
    ingest(dataset_id, make_input_df(), text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=50)
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1, dimensions=3)
    return tmp_data_dir, dataset_id


def test_cluster_on_3d_umap_uses_all_three_axes(umapped_dataset_3d, monkeypatch):
    """A 3D umap (x, y, z) must be clustered on all three axes for
    ``cluster_on='umap'`` so labels match the 3D geometry, not a 2D shadow."""
    data_dir, dataset_id = umapped_dataset_3d
    import latentscope.scripts.cluster as cluster_mod
    from latentscope.scripts.cluster import clusterer

    captured = {}
    real_kmeans = cluster_mod._run_kmeans

    def spy_kmeans(embeddings, n_clusters, **kwargs):
        captured["shape"] = getattr(embeddings, "shape", None)
        return real_kmeans(embeddings, n_clusters, **kwargs)

    monkeypatch.setattr(cluster_mod, "_run_kmeans", spy_kmeans)

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans")
    # 3D umap -> clustering input is (n, 3), not the 2D (n, 2) shadow.
    assert captured["shape"] is not None
    assert captured["shape"][1] == 3


def test_cluster_on_2d_umap_uses_two_axes(umapped_dataset, monkeypatch):
    """Regression guard: the default 2D umap path still clusters on exactly the
    (n, 2) x/y projection (byte-identical to pre-3D behavior)."""
    data_dir, dataset_id = umapped_dataset
    import latentscope.scripts.cluster as cluster_mod
    from latentscope.scripts.cluster import clusterer

    captured = {}
    real_kmeans = cluster_mod._run_kmeans

    def spy_kmeans(embeddings, n_clusters, **kwargs):
        captured["shape"] = getattr(embeddings, "shape", None)
        return real_kmeans(embeddings, n_clusters, **kwargs)

    monkeypatch.setattr(cluster_mod, "_run_kmeans", spy_kmeans)

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans")
    assert captured["shape"] is not None
    assert captured["shape"][1] == 2


# ---------------------------------------------------------------------------
# Noise handling (#143): default keeps noise as an "Unclustered" cluster;
# --assign-noise restores the old nearest-centroid reassignment.
# ---------------------------------------------------------------------------

def _plant_noise_labels(monkeypatch, labels):
    """Force _run_hdbscan to return a fixed label array so noise is deterministic."""
    import numpy as np

    import latentscope.scripts.cluster as cluster_mod
    fixed = np.asarray(labels)
    monkeypatch.setattr(cluster_mod, "_run_hdbscan",
                        lambda *args, **kwargs: fixed.copy())


def _read_default_labels(data_dir, dataset_id, cluster_id="cluster-001"):
    return pd.read_parquet(os.path.join(data_dir, dataset_id, "clusters",
                                        f"{cluster_id}-labels-default.parquet"))


def test_noise_kept_as_unclustered_cluster_by_default(umapped_dataset, monkeypatch,
                                                      capsys):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    # 2 real clusters + 20 noise points -> Unclustered gets dense id 2
    labels = [0] * 50 + [1] * 50 + [-1] * 20
    _plant_noise_labels(monkeypatch, labels)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")

    df = _read_cluster_df(data_dir, dataset_id)
    # noise became the extra dense cluster id 2; raw labels stay honest
    assert (df["cluster"] >= 0).all()
    assert df["cluster"].tolist() == [0] * 50 + [1] * 50 + [2] * 20
    assert df["raw_cluster"].tolist() == labels

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["assign_noise"] is False
    assert meta["unclustered_cluster"] == 2
    assert meta["n_clusters"] == 2  # real clusters only
    assert meta["n_noise"] == 20

    labels_df = _read_default_labels(data_dir, dataset_id)
    assert len(labels_df) == 3
    assert labels_df.loc[2, "label"] == "Unclustered"
    assert len(labels_df.loc[2, "hull"]) == 0  # no hull around scattered noise
    assert sorted(labels_df.loc[2, "indices"]) == list(range(100, 120))
    assert labels_df.loc[0, "label"] == "Cluster 0"

    out = capsys.readouterr().out
    assert "NOISE: 20 points (16.7% of 120)" in out
    assert "--assign-noise" in out

    # scope must handle the Unclustered cluster (positional label lookup) and
    # its empty hull without errors
    from latentscope.scripts.scope import scope
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "noise scope", "unclustered end-to-end")
    scope_df = pd.read_parquet(os.path.join(
        data_dir, dataset_id, "scopes", "scopes-001.parquet"))
    assert (scope_df.loc[100:119, "label"] == "Unclustered").all()
    with open(os.path.join(data_dir, dataset_id, "scopes", "scopes-001.json")) as f:
        scope_meta = json.load(f)
    unclustered_lookup = [c for c in scope_meta["cluster_labels_lookup"]
                          if c["label"] == "Unclustered"]
    assert len(unclustered_lookup) == 1
    assert unclustered_lookup[0]["hull"] == []


def test_unclustered_id_never_collides_with_non_dense_labels(umapped_dataset, monkeypatch):
    """Non-dense label sets (a gap at 0 — possible via the `column` path or an
    unexpected backend) must not merge noise into a real cluster: the
    Unclustered id is max(labels)+1, not len(labels)."""
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    # real clusters 1 and 2 (0 unused) + noise: len(non_noise)=2 would collide
    # with real cluster 2; max+1=3 must be chosen instead
    labels = [1] * 50 + [2] * 50 + [-1] * 20
    _plant_noise_labels(monkeypatch, labels)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")

    df = _read_cluster_df(data_dir, dataset_id)
    assert df["cluster"].tolist() == [1] * 50 + [2] * 50 + [3] * 20
    # real cluster 2 kept exactly its own 50 points
    assert (df["cluster"] == 2).sum() == 50

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["unclustered_cluster"] == 3


def test_assign_noise_flag_restores_centroid_reassignment(umapped_dataset,
                                                          monkeypatch, capsys):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    labels = [0] * 50 + [1] * 50 + [-1] * 20
    _plant_noise_labels(monkeypatch, labels)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan",
              assign_noise=True)

    df = _read_cluster_df(data_dir, dataset_id)
    # every noise point went to one of the two real clusters; no extra cluster
    assert (df["cluster"] >= 0).all()
    assert set(df["cluster"].unique()) == {0, 1}
    assert df["raw_cluster"].tolist() == labels

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["assign_noise"] is True
    assert "unclustered_cluster" not in meta
    assert meta["n_clusters"] == 2
    assert meta["n_noise"] == 20

    labels_df = _read_default_labels(data_dir, dataset_id)
    assert len(labels_df) == 2
    assert "Unclustered" not in labels_df["label"].tolist()

    out = capsys.readouterr().out
    assert "NOISE: 20 points (16.7% of 120) reassigned" in out


def test_all_noise_becomes_single_unclustered_cluster(umapped_dataset, monkeypatch):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    _plant_noise_labels(monkeypatch, [-1] * N_TOTAL)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")

    df = _read_cluster_df(data_dir, dataset_id)
    assert (df["cluster"] == 0).all()
    assert (df["raw_cluster"] == -1).all()

    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["unclustered_cluster"] == 0
    assert meta["n_clusters"] == 0
    assert meta["n_noise"] == N_TOTAL

    labels_df = _read_default_labels(data_dir, dataset_id)
    assert len(labels_df) == 1
    assert labels_df.loc[0, "label"] == "Unclustered"
    assert len(labels_df.loc[0, "hull"]) == 0


def test_zero_noise_adds_no_unclustered_cluster(umapped_dataset):
    """kmeans never emits -1: no Unclustered cluster and no meta key."""
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans")
    meta = _read_cluster_meta(data_dir, dataset_id)
    assert meta["assign_noise"] is False
    assert "unclustered_cluster" not in meta
    labels_df = _read_default_labels(data_dir, dataset_id)
    assert "Unclustered" not in labels_df["label"].tolist()


def test_labeler_skips_llm_for_unclustered_cluster(umapped_dataset, monkeypatch):
    """LLM labeling must not summarize the noise bucket: it keeps the literal
    label "Unclustered" and the model is only called for real clusters."""
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    labels = [0] * 50 + [1] * 50 + [-1] * 20
    _plant_noise_labels(monkeypatch, labels)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")

    import latentscope.scripts.label_clusters as label_mod

    calls = []

    class FakeChatModel:
        encoder = None

        def load_model(self):
            pass

        def summarize(self, items, context):
            calls.append(items)
            return "Fake Topic Label"

    monkeypatch.setattr(label_mod, "get_chat_model",
                        lambda model_id: FakeChatModel())
    label_mod.labeler(dataset_id, "text", "cluster-001", "fake-chat",
                      samples=0, context="", rerun=None)

    labeled = pd.read_parquet(os.path.join(
        data_dir, dataset_id, "clusters", "cluster-001-labels-001.parquet"))
    assert labeled.loc[0, "label"] == "Fake Topic Label"
    assert labeled.loc[1, "label"] == "Fake Topic Label"
    assert labeled.loc[2, "label"] == "Unclustered"
    assert bool(labeled.loc[2, "labeled"]) is True
    # the LLM was only called for the two real clusters, never the noise bucket
    assert len(calls) == 2


# ---------------------------------------------------------------------------
# Remaining EVoC knobs + seed (#143)
# ---------------------------------------------------------------------------

def test_run_evoc_forwards_new_knobs(monkeypatch):
    """base_n_clusters / min_samples / seed(random_state) reach evoc.EVoC."""
    import sys
    import types

    import numpy as np

    captured = {}

    class FakeEVoC:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def fit_predict(self, X):
            return np.zeros(len(X), dtype=int)

    fake_evoc = types.ModuleType("evoc")
    fake_evoc.EVoC = FakeEVoC
    monkeypatch.setitem(sys.modules, "evoc", fake_evoc)

    from latentscope.scripts.cluster import _run_evoc
    embeddings = np.random.default_rng(0).normal(size=(10, 32))
    _run_evoc(embeddings, samples=7, min_samples=3, n_neighbors=20,
              noise_level=0.4, approx_n_clusters=6, base_n_clusters=12, seed=99)

    assert captured["base_min_cluster_size"] == 7
    assert captured["min_samples"] == 3
    assert captured["n_neighbors"] == 20
    assert captured["noise_level"] == 0.4
    assert captured["approx_n_clusters"] == 6
    assert captured["base_n_clusters"] == 12
    assert captured["random_state"] == 99


def test_seed_recorded_in_meta_and_reproducible_kmeans(umapped_dataset):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans",
              seed=123)
    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans",
              seed=123)

    meta = _read_cluster_meta(data_dir, dataset_id, "cluster-001")
    assert meta["seed"] == 123
    # same seed -> identical assignments across runs
    first = _read_cluster_df(data_dir, dataset_id, "cluster-001")
    second = _read_cluster_df(data_dir, dataset_id, "cluster-002")
    assert first["cluster"].tolist() == second["cluster"].tolist()


def test_seed_omitted_from_meta_when_unset(umapped_dataset):
    data_dir, dataset_id = umapped_dataset
    from latentscope.scripts.cluster import clusterer

    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="gmm")
    meta = _read_cluster_meta(data_dir, dataset_id)
    assert "seed" not in meta


def test_evoc_node_embedding_dim_caps_low_dim_input():
    """EVoC PCA-inits its node embedding with up to 15 components; on 2-D umap
    input the dim must be capped at the feature count or PCA raises."""
    from latentscope.scripts.cluster import _evoc_node_embedding_dim

    # 2-D umap input: evoc default would be min(max(15 // 4, 4), 15) = 4 > 2
    assert _evoc_node_embedding_dim(2, 15) == 2
    # more neighbors → bigger default (20 // 4 = 5), still capped by features
    assert _evoc_node_embedding_dim(2, 20) == 2
    # high-dimensional embeddings keep evoc's default behavior
    assert _evoc_node_embedding_dim(768, 15) is None
    assert _evoc_node_embedding_dim(768, 100) is None
    # boundary: features equal to the default dim → no override needed
    assert _evoc_node_embedding_dim(4, 15) is None
