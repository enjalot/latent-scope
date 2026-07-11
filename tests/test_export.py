"""Tests for the on-demand combined scope export endpoint (issue #38)."""

import json
import os

import pandas as pd

DATASET = "export-ds"
SCOPE = "scopes-001"


def make_dataset(data_dir, with_tags=True):
    """Create a minimal dataset with a scope input parquet and optional tags."""
    ds_dir = os.path.join(data_dir, DATASET)
    scopes_dir = os.path.join(ds_dir, "scopes")
    os.makedirs(scopes_dir)

    input_df = pd.DataFrame(
        {
            "text": ["alpha", "beta", "gamma", "delta"],
        }
    )
    input_df.to_parquet(os.path.join(ds_dir, "input.parquet"))

    # {scope}-input.parquet: input joined with scope columns, keyed by 'index'
    scope_input_df = pd.DataFrame(
        {
            "index": [0, 1, 2, 3],
            "text": ["alpha", "beta", "gamma", "delta"],
            "x": [0.1, 0.2, 0.3, 0.4],
            "y": [0.4, 0.3, 0.2, 0.1],
            "cluster": [0, 0, 1, 1],
        }
    )
    scope_input_df.to_parquet(os.path.join(scopes_dir, f"{SCOPE}-input.parquet"))

    if with_tags:
        tags_dir = os.path.join(ds_dir, "tags")
        os.makedirs(tags_dir)
        with open(os.path.join(tags_dir, "interesting.indices"), "w") as f:
            f.write("1\n3\n")

    return ds_dir


class TestCombineExport:
    def test_combines_tags_into_export_parquet(self, client, tmp_data_dir):
        ds_dir = make_dataset(tmp_data_dir, with_tags=True)

        response = client.post(f"/api/datasets/{DATASET}/export/combine/{SCOPE}")
        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload["name"] == f"{SCOPE}-export.parquet"
        assert payload["relative_path"] == os.path.join("scopes", f"{SCOPE}-export.parquet")
        assert payload["size"] > 0

        export_path = os.path.join(ds_dir, "scopes", f"{SCOPE}-export.parquet")
        assert os.path.exists(export_path)
        df = pd.read_parquet(export_path)
        assert "tag_interesting" in df.columns
        assert df["tag_interesting"].dtype == bool
        tagged = df[df["tag_interesting"]]["index"].tolist()
        assert sorted(tagged) == [1, 3]
        untagged = df[~df["tag_interesting"]]["index"].tolist()
        assert sorted(untagged) == [0, 2]

    def test_single_index_tag_file(self, client, tmp_data_dir):
        # np.loadtxt returns a scalar for a one-line file; make sure it works
        ds_dir = make_dataset(tmp_data_dir, with_tags=False)
        tags_dir = os.path.join(ds_dir, "tags")
        os.makedirs(tags_dir)
        with open(os.path.join(tags_dir, "solo.indices"), "w") as f:
            f.write("2\n")

        response = client.post(f"/api/datasets/{DATASET}/export/combine/{SCOPE}")
        assert response.status_code == 200
        df = pd.read_parquet(os.path.join(ds_dir, "scopes", f"{SCOPE}-export.parquet"))
        assert df[df["tag_solo"]]["index"].tolist() == [2]

    def test_no_tags_dir_still_writes_export(self, client, tmp_data_dir):
        ds_dir = make_dataset(tmp_data_dir, with_tags=False)

        response = client.post(f"/api/datasets/{DATASET}/export/combine/{SCOPE}")
        assert response.status_code == 200

        export_path = os.path.join(ds_dir, "scopes", f"{SCOPE}-export.parquet")
        assert os.path.exists(export_path)
        df = pd.read_parquet(export_path)
        assert not [c for c in df.columns if c.startswith("tag_")]
        assert len(df) == 4

    def test_missing_scope_input_returns_404(self, client, tmp_data_dir):
        make_dataset(tmp_data_dir, with_tags=False)

        response = client.post(f"/api/datasets/{DATASET}/export/combine/no-such-scope")
        assert response.status_code == 404

    def test_route_disabled_in_read_only_mode(self, readonly_client, tmp_data_dir):
        ds_dir = make_dataset(tmp_data_dir, with_tags=True)

        response = readonly_client.post(f"/api/datasets/{DATASET}/export/combine/{SCOPE}")
        # The write blueprint is not registered in read-only mode; the SPA
        # catch-all GET route makes unmatched POSTs report 405 instead of 404.
        assert response.status_code in (404, 405)
        assert not os.path.exists(os.path.join(ds_dir, "scopes", f"{SCOPE}-export.parquet"))

    def test_invalid_scope_param_rejected(self, client, tmp_data_dir):
        make_dataset(tmp_data_dir, with_tags=False)

        response = client.post(f"/api/datasets/{DATASET}/export/combine/..escape")
        assert response.status_code == 400
