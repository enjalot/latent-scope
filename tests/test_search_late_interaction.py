"""Regression (Codex review on #122): the UI never sends late_interaction=true,
so MaxSim search must be the server-side default whenever the embedding has
token vectors."""

import json
import os

import numpy as np
import pytest


class FakeLIProvider:
    late_interaction = True

    def __init__(self):
        self.embed_multi_calls = []
        self.embed_calls = []

    def load_model(self):
        pass

    def embed_multi(self, inputs, dimensions=None, is_query=False):
        self.embed_multi_calls.append({"inputs": inputs, "is_query": is_query})
        rng = np.random.default_rng(0)
        tokens = [rng.normal(size=(4, 8)).astype(np.float32) for _ in inputs]
        tokens = [t / np.linalg.norm(t, axis=1, keepdims=True) for t in tokens]
        means = np.array([t.mean(axis=0) for t in tokens], dtype=np.float32)
        return means, tokens

    def embed(self, inputs, dimensions=None):
        self.embed_calls.append(inputs)
        means, _ = self.embed_multi(inputs, dimensions)
        return means.tolist()

    def embed_query(self, inputs, dimensions=None):
        # Mirror the base provider: query embedding defaults to embed().
        return self.embed(inputs, dimensions=dimensions)


@pytest.fixture
def li_dataset(tmp_data_dir):
    from latentscope.util.embedding_store import append_embeddings

    dataset_id = "li-ds"
    emb_dir = os.path.join(tmp_data_dir, dataset_id, "embeddings")
    os.makedirs(emb_dir)
    rng = np.random.default_rng(1)
    vectors = rng.normal(size=(20, 8)).astype(np.float32)
    tokens = [rng.normal(size=(4, 8)).astype(np.float32) for _ in range(20)]
    append_embeddings(tmp_data_dir, dataset_id, "embedding-001", vectors,
                      token_vectors_list=tokens)
    with open(os.path.join(emb_dir, "embedding-001.json"), "w") as f:
        json.dump({"id": "embedding-001", "model_id": "fake-li",
                   "late_interaction": True, "dimensions": 8}, f)
    return dataset_id


def test_nn_defaults_to_maxsim_for_late_interaction(client, li_dataset, monkeypatch):
    import latentscope.server.search as search_mod

    provider = FakeLIProvider()
    monkeypatch.setattr(search_mod, "get_embedding_model", lambda mid: provider)
    search_mod.EMBEDDINGS.clear() if hasattr(search_mod.EMBEDDINGS, "clear") else None

    # no late_interaction param — the UI's actual request shape
    res = client.get(f"/api/search/nn?dataset={li_dataset}"
                     f"&embedding_id=embedding-001&query=hello")
    assert res.status_code == 200
    data = res.get_json()
    assert "indices" in data and len(data["indices"]) > 0
    # MaxSim path encodes the query with is_query=True via embed_multi
    assert any(c["is_query"] for c in provider.embed_multi_calls)

    # explicit opt-out forces the mean-vector path
    provider.embed_multi_calls.clear()
    res = client.get(f"/api/search/nn?dataset={li_dataset}"
                     f"&embedding_id=embedding-001&query=hello"
                     f"&late_interaction=false")
    assert res.status_code == 200
    assert not any(c["is_query"] for c in provider.embed_multi_calls)


def test_scoped_request_stays_in_scope_for_late_interaction(
    client, li_dataset, tmp_data_dir, monkeypatch
):
    """Codex review on #123 (P1): a scoped search against a ColBERT embedding
    must use the scope table, not fall into global MaxSim (which would return
    indices outside the scope)."""
    import lancedb

    import latentscope.server.search as search_mod

    provider = FakeLIProvider()
    monkeypatch.setattr(search_mod, "get_embedding_model", lambda mid: provider)
    search_mod.EMBEDDINGS.clear() if hasattr(search_mod.EMBEDDINGS, "clear") else None

    # Build a minimal scope-level LanceDB table (rows 0..4 only).
    scope_id = "scopes-001"
    rng = np.random.default_rng(2)
    rows = [
        {"index": i, "vector": rng.normal(size=8).astype(np.float32).tolist()}
        for i in range(5)
    ]
    db = lancedb.connect(os.path.join(tmp_data_dir, li_dataset, "lancedb"))
    db.create_table(scope_id, data=rows)

    res = client.get(f"/api/search/nn?dataset={li_dataset}"
                     f"&embedding_id=embedding-001&query=hello&scope_id={scope_id}")
    assert res.status_code == 200
    data = res.get_json()
    # Every returned index must belong to the scope (rows 0..4)...
    assert data["indices"] and all(0 <= i < 5 for i in data["indices"])
    # ...and the global MaxSim path must NOT have run (it encodes is_query=True).
    assert not any(c["is_query"] for c in provider.embed_multi_calls)
