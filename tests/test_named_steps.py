"""Named-steps roundtrip (WP-A/WP-B, CONTRACT §2): the umapper/clusterer scripts
write ``name``/``description`` into their meta JSON when passed and omit the keys
entirely when not. (The POST .../meta *edit* routes are covered by
test_column_endpoint.py; this file covers the SCRIPT-side creation write.)
"""
import json
import os

import pytest

from tests.test_pipeline_e2e import FakeEmbedProvider, make_input_df


@pytest.fixture
def embedded_dataset(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    dataset_id = "named-steps"
    ingest(dataset_id, make_input_df(), text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=50)
    return tmp_data_dir, dataset_id


def _umap_meta(data_dir, dataset_id, umap_id="umap-001"):
    with open(os.path.join(data_dir, dataset_id, "umaps", f"{umap_id}.json")) as f:
        return json.load(f)


def _cluster_meta(data_dir, dataset_id, cluster_id="cluster-001"):
    with open(os.path.join(data_dir, dataset_id, "clusters", f"{cluster_id}.json")) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# umapper
# ---------------------------------------------------------------------------

def test_umap_writes_name_and_description(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import umapper

    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1,
            name="My projection", description="a two-sentence blurb")
    meta = _umap_meta(data_dir, dataset_id)
    assert meta["name"] == "My projection"
    assert meta["description"] == "a two-sentence blurb"


def test_umap_omits_keys_when_absent(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import umapper

    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    meta = _umap_meta(data_dir, dataset_id)
    assert "name" not in meta
    assert "description" not in meta


def test_umap_name_only(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.umapper import umapper

    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1,
            name="just a name")
    meta = _umap_meta(data_dir, dataset_id)
    assert meta["name"] == "just a name"
    assert "description" not in meta


# ---------------------------------------------------------------------------
# clusterer
# ---------------------------------------------------------------------------

def test_cluster_writes_name_and_description(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.cluster import clusterer
    from latentscope.scripts.umapper import umapper

    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans",
              name="Themes", description="topical clusters")
    meta = _cluster_meta(data_dir, dataset_id)
    assert meta["name"] == "Themes"
    assert meta["description"] == "topical clusters"


def test_cluster_omits_keys_when_absent(embedded_dataset):
    data_dir, dataset_id = embedded_dataset
    from latentscope.scripts.cluster import clusterer
    from latentscope.scripts.umapper import umapper

    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    clusterer(dataset_id, "umap-001", samples=3, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="kmeans")
    meta = _cluster_meta(data_dir, dataset_id)
    assert "name" not in meta
    assert "description" not in meta
    # cluster_on is always written even when name/description are omitted
    assert meta["cluster_on"] == "umap"
