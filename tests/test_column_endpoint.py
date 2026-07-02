"""Tests for WP-C backend routes on server/datasets.py.

Covers:
  - GET /api/datasets/<dataset>/column/<column>  (color-by values, #131)
  - POST /api/datasets/<dataset>/umaps/<umap>/meta      (edit umap meta)
  - POST /api/datasets/<dataset>/clusters/<cluster>/meta (edit cluster meta)
"""

import json
import os

import pandas as pd
import pytest

DATASET_ID = "col-ds"
ROW_COUNT = 6


@pytest.fixture
def column_dataset(tmp_data_dir, monkeypatch):
    """A tiny ingested dataset with a numeric and a categorical column."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "text": [f"row {i}" for i in range(ROW_COUNT)],
        "score": [0.0, 1.5, 2.5, 3.5, 4.5, 9.0],
        "label": ["a", "b", "a", "c", "b", "a"],
    })
    ingest(DATASET_ID, df, text_column="text")
    return DATASET_ID


# ---------------------------------------------------------------------------
# GET /column/<column>
# ---------------------------------------------------------------------------

def test_numeric_column_shape_and_extent(client, column_dataset):
    resp = client.get(f"/api/datasets/{column_dataset}/column/score")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["column"] == "score"
    assert data["type"] == "numeric"
    assert len(data["values"]) == ROW_COUNT
    assert data["values"] == [0.0, 1.5, 2.5, 3.5, 4.5, 9.0]
    # extent sourced from meta.json -> column_metadata
    assert data["extent"] == [0.0, 9.0]


def test_categorical_column_shape(client, column_dataset):
    resp = client.get(f"/api/datasets/{column_dataset}/column/label")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["column"] == "label"
    assert data["type"] == "categorical"
    assert len(data["values"]) == ROW_COUNT
    cat = data["categorical"]
    categories = cat["categories"]
    counts = cat["counts"]
    assert set(categories) == {"a", "b", "c"}
    assert len(counts) == len(categories)
    # counts align to categories order; totals match the data
    assert dict(zip(categories, counts)) == {"a": 3, "b": 2, "c": 1}
    # values are category indices that decode back to the source labels
    decoded = [categories[i] for i in data["values"]]
    assert decoded == ["a", "b", "a", "c", "b", "a"]


def test_missing_column_404(client, column_dataset):
    resp = client.get(f"/api/datasets/{column_dataset}/column/nope")
    assert resp.status_code == 404


def test_missing_dataset_404(client):
    resp = client.get("/api/datasets/does-not-exist/column/score")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /umaps/<umap>/meta  and  /clusters/<cluster>/meta
# ---------------------------------------------------------------------------

def _write_json(tmp_data_dir, subdir, name, contents):
    d = os.path.join(tmp_data_dir, DATASET_ID, subdir)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(contents, f)
    return path


def test_update_umap_meta_merges(client, column_dataset, tmp_data_dir):
    path = _write_json(tmp_data_dir, "umaps", "umap-001", {"id": "umap-001", "neighbors": 15})
    resp = client.post(
        f"/api/datasets/{column_dataset}/umaps/umap-001/meta",
        json={"name": "My projection", "description": "a desc"},
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"success": True}
    with open(path, encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["name"] == "My projection"
    assert saved["description"] == "a desc"
    # untouched keys preserved
    assert saved["neighbors"] == 15


def test_update_cluster_meta_merges(client, column_dataset, tmp_data_dir):
    path = _write_json(tmp_data_dir, "clusters", "cluster-001", {"id": "cluster-001", "n_clusters": 4})
    resp = client.post(
        f"/api/datasets/{column_dataset}/clusters/cluster-001/meta",
        json={"name": "Themes", "description": "topical clusters"},
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"success": True}
    with open(path, encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["name"] == "Themes"
    assert saved["description"] == "topical clusters"
    assert saved["n_clusters"] == 4


def test_update_umap_meta_missing_404(client, column_dataset):
    resp = client.post(
        f"/api/datasets/{column_dataset}/umaps/umap-999/meta",
        json={"name": "x"},
    )
    assert resp.status_code == 404
