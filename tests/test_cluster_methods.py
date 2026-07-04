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
