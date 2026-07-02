"""Tests for the Compare backend: cached distance metrics, column color-by,
and the selection spread statistic."""
import json
import os

import numpy as np
import pandas as pd
import pytest


def _make_compare_dataset(data_dir, name="cmp", n=60, seed=0):
    """Create a dataset with two umaps, an input.parquet and meta.json.

    The two projections share structure but differ (right = left rotated + a
    little jitter) so the drift metrics produce non-trivial, non-uniform values.
    """
    rng = np.random.default_rng(seed)
    ds_dir = os.path.join(data_dir, name)
    os.makedirs(os.path.join(ds_dir, "umaps"))

    left = rng.uniform(-1, 1, size=(n, 2)).astype("float32")
    theta = 0.6
    rot = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
    right = (left @ rot.T + rng.normal(0, 0.05, size=(n, 2))).astype("float32")

    pd.DataFrame(left, columns=["x", "y"]).to_parquet(
        os.path.join(ds_dir, "umaps", "umap-001.parquet"))
    pd.DataFrame(right, columns=["x", "y"]).to_parquet(
        os.path.join(ds_dir, "umaps", "umap-002.parquet"))

    score = rng.uniform(0, 10, size=n)
    df = pd.DataFrame({
        "text": [f"row {i}" for i in range(n)],
        "score": score,
    })
    df.to_parquet(os.path.join(ds_dir, "input.parquet"))

    meta = {
        "id": name,
        "length": n,
        "columns": ["text", "score"],
        "text_column": "text",
        "column_metadata": {
            "text": {"type": "string"},
            "score": {"type": "number", "extent": [float(score.min()), float(score.max())]},
        },
    }
    with open(os.path.join(ds_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return name, n


@pytest.fixture(autouse=True)
def _clear_umap_caches():
    """Reset the module-level umap caches between tests.

    They are keyed by (dataset, umap_id) without the data dir, so two tests
    reusing a dataset name across different tmp dirs would otherwise collide.
    """
    from latentscope.server import search

    search.UMAP_COORDS.clear()
    search.UMAP_KNN.clear()
    yield
    search.UMAP_COORDS.clear()
    search.UMAP_KNN.clear()


class TestCompareMetrics:
    def test_displacement_returns_normalized_values(self, app, client, tmp_data_dir):
        name, n = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/search/compare?dataset={name}"
                       f"&umap_left=umap-001&umap_right=umap-002&metric=displacement")
        assert r.status_code == 200
        vals = json.loads(r.data)
        assert len(vals) == n
        assert min(vals) == pytest.approx(0.0)
        assert max(vals) == pytest.approx(1.0)
        assert all(0.0 <= v <= 1.0 for v in vals)

    @pytest.mark.parametrize("metric", ["displacement", "relative", "neighborhood"])
    def test_all_metrics_valid(self, app, client, tmp_data_dir, metric):
        name, n = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/search/compare?dataset={name}"
                       f"&umap_left=umap-001&umap_right=umap-002&metric={metric}&k=10")
        assert r.status_code == 200
        vals = json.loads(r.data)
        assert len(vals) == n
        assert all(np.isfinite(v) for v in vals)
        assert all(0.0 <= v <= 1.0 for v in vals)

    def test_coords_and_knn_caches_populate(self, app, client, tmp_data_dir):
        from latentscope.server import search

        name, _ = _make_compare_dataset(tmp_data_dir)
        assert len(search.UMAP_COORDS) == 0
        client.get(f"/api/search/compare?dataset={name}"
                   f"&umap_left=umap-001&umap_right=umap-002&metric=neighborhood&k=5")
        # both umaps' coords cached, and a knn index per (umap, k)
        assert (name, "umap-001") in search.UMAP_COORDS
        assert (name, "umap-002") in search.UMAP_COORDS
        assert (name, "umap-001", 5) in search.UMAP_KNN
        assert (name, "umap-002", 5) in search.UMAP_KNN


class TestCompareNeighbors:
    def test_returns_k_neighbors_without_self(self, app, client, tmp_data_dir):
        name, _ = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/search/compare/neighbors?dataset={name}"
                       f"&umap_left=umap-001&umap_right=umap-002&point_index=3&side=left&k=7")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["point_index"] == 3
        assert data["side"] == "left"
        assert len(data["neighbor_indices"]) == 7
        assert 3 not in data["neighbor_indices"]

    def test_reuses_cached_knn(self, app, client, tmp_data_dir):
        from latentscope.server import search

        name, _ = _make_compare_dataset(tmp_data_dir)
        client.get(f"/api/search/compare/neighbors?dataset={name}"
                   f"&umap_left=umap-001&umap_right=umap-002&point_index=0&side=right&k=6")
        assert (name, "umap-002", 6) in search.UMAP_KNN


class TestColumnEndpoint:
    def test_numeric_column_returns_values_and_extent(self, app, client, tmp_data_dir):
        name, n = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/datasets/{name}/column/score")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["column"] == "score"
        assert data["type"] == "number"
        assert len(data["values"]) == n
        lo, hi = data["extent"]
        assert lo <= min(v for v in data["values"] if v is not None)
        assert hi >= max(v for v in data["values"] if v is not None)

    def test_text_column_rejected(self, app, client, tmp_data_dir):
        name, _ = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/datasets/{name}/column/text")
        assert r.status_code == 400

    def test_unknown_column_404s(self, app, client, tmp_data_dir):
        name, _ = _make_compare_dataset(tmp_data_dir)
        r = client.get(f"/api/datasets/{name}/column/nope")
        assert r.status_code == 404


class TestSpread:
    def test_returns_finite_per_side_stats(self, app, client, tmp_data_dir):
        name, _ = _make_compare_dataset(tmp_data_dir)
        r = client.post("/api/search/compare/spread", json={
            "dataset": name, "umap_left": "umap-001", "umap_right": "umap-002",
            "indices": list(range(10)),
        })
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["n_selected"] == 10
        for side in ("left", "right"):
            s = data[side]
            assert s["n"] == 10
            assert s["mean_pairwise"] > 0
            assert s["hull_area"] >= 0
            assert s["centroid"] is not None

    def test_fewer_than_three_points_no_hull(self, app, client, tmp_data_dir):
        name, _ = _make_compare_dataset(tmp_data_dir)
        r = client.post("/api/search/compare/spread", json={
            "dataset": name, "umap_left": "umap-001", "umap_right": "umap-002",
            "indices": [0, 1],
        })
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["left"]["hull_area"] == 0.0
        assert data["left"]["mean_pairwise"] is not None  # 2 points still have a distance

    def test_out_of_range_indices_dropped(self, app, client, tmp_data_dir):
        name, n = _make_compare_dataset(tmp_data_dir)
        r = client.post("/api/search/compare/spread", json={
            "dataset": name, "umap_left": "umap-001", "umap_right": "umap-002",
            "indices": [0, 1, 2, n + 100, -5],
        })
        assert r.status_code == 200
        assert json.loads(r.data)["n_selected"] == 3
