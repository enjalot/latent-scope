"""End-to-end pipeline tests on a small dataset with a deterministic fake
embedding model.

These tests exercise the real pipeline code (ingest -> embed -> umap ->
cluster -> scope) against a temporary data directory. The embedding model is
replaced with a deterministic provider so no model downloads or GPU are
required; everything downstream of the provider is the production code path,
including LanceDB storage.
"""

import hashlib
import json
import os

import numpy as np
import pandas as pd
import pytest

DIM = 32
N_PER_TOPIC = 40
TOPICS = ["science", "cooking", "sports"]


class FakeEmbedProvider:
    """Deterministic stand-in for an embedding model.

    Each topic maps to a fixed random direction; individual texts get small
    deterministic noise around their topic direction, so UMAP + clustering
    have real structure to find.
    """

    name = "fake-test-model"
    late_interaction = False

    def __init__(self, dim=DIM):
        self.dim = dim
        rng = np.random.default_rng(42)
        self.topic_dirs = {t: rng.normal(size=dim) for t in TOPICS}

    def load_model(self):
        pass

    def _vector(self, text):
        topic = next((t for t in TOPICS if t in text), TOPICS[0])
        seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[:4], "little")
        noise = np.random.default_rng(seed).normal(scale=0.1, size=self.dim)
        vec = self.topic_dirs[topic] + noise
        return (vec / np.linalg.norm(vec)).astype(np.float32)

    def embed(self, batch, dimensions=None):
        return [self._vector(t) for t in batch]


def make_input_df(n_per_topic=N_PER_TOPIC):
    rows = []
    for topic in TOPICS:
        for i in range(n_per_topic):
            rows.append({
                "text": f"document {i} about {topic} and related {topic} matters",
                "topic": topic,
            })
    return pd.DataFrame(rows)


@pytest.fixture
def pipeline_env(tmp_data_dir, monkeypatch):
    """Point the pipeline at a temp data dir and stub the embedding model."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())
    return tmp_data_dir


def run_ingest_and_embed(data_dir, dataset_id="e2e-test", batch_size=50):
    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    df = make_input_df()
    ingest(dataset_id, df, text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=batch_size)
    return df


def test_full_pipeline_small_dataset(pipeline_env):
    """ingest -> embed -> umap -> cluster(hdbscan) -> scope on 120 rows."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    n_total = N_PER_TOPIC * len(TOPICS)

    df = run_ingest_and_embed(data_dir, dataset_id)

    # --- embed wrote a LanceDB table aligned with the input ---
    from latentscope.util.embedding_store import get_embedding_count, load_embeddings
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total
    vectors = load_embeddings(data_dir, dataset_id, "embedding-001")
    assert vectors.shape == (n_total, DIM)
    # row alignment: stored vector i must equal the provider's output for text i
    provider = FakeEmbedProvider()
    np.testing.assert_allclose(vectors[7], provider._vector(df["text"].iloc[7]),
                               atol=1e-6)
    np.testing.assert_allclose(vectors[-1], provider._vector(df["text"].iloc[-1]),
                               atol=1e-6)
    meta_path = os.path.join(data_dir, dataset_id, "embeddings", "embedding-001.json")
    assert os.path.exists(meta_path)

    # --- umap ---
    from latentscope.scripts.umapper import umapper
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    umap_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "umaps", "umap-001.parquet"))
    assert len(umap_df) == n_total
    assert {"x", "y"} <= set(umap_df.columns)
    assert umap_df["x"].between(-1, 1).all()

    # --- cluster (hdbscan on the 2D projection) ---
    from latentscope.scripts.cluster import clusterer
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")
    cluster_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "clusters", "cluster-001.parquet"))
    assert len(cluster_df) == n_total
    n_clusters = cluster_df["cluster"].nunique()
    assert n_clusters >= 2, "expected the 3 planted topics to form >=2 clusters"
    # noise points must all have been reassigned
    assert (cluster_df["cluster"] >= 0).all()
    labels_path = os.path.join(
        data_dir, dataset_id, "clusters", "cluster-001-labels-default.parquet")
    assert os.path.exists(labels_path)

    # --- scope ---
    from latentscope.scripts.scope import scope
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "E2E test scope", "test description")
    scope_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "scopes", "scopes-001.parquet"))
    assert len(scope_df) == n_total
    # the label column must match the cluster-labels parquet mapping
    labels_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "clusters",
                     "cluster-001-labels-default.parquet"))
    expected_labels = scope_df["cluster"].map(labels_df["label"])
    assert scope_df["label"].equals(expected_labels)
    with open(os.path.join(data_dir, dataset_id, "scopes", "scopes-001.json")) as f:
        scope_meta = json.load(f)
    assert scope_meta["embedding_id"] == "embedding-001"
    assert scope_meta["cluster_id"] == "cluster-001"


def test_scope_rerun_skips_unchanged_input_parquet(pipeline_env, capsys):
    """Re-running a scope must not rewrite {scope}-input.parquet (a full copy
    of the input data) when the source input.parquet is unchanged, and must
    rewrite it when the source changes."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    run_ingest_and_embed(data_dir, dataset_id)

    from latentscope.scripts.cluster import clusterer
    from latentscope.scripts.scope import scope
    from latentscope.scripts.umapper import umapper
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")

    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "E2E test scope", "test description")
    scope_input_path = os.path.join(
        data_dir, dataset_id, "scopes", "scopes-001-input.parquet")
    assert os.path.exists(scope_input_path)
    # backdate the output so any rewrite is detectable regardless of mtime
    # resolution
    os.utime(scope_input_path, (1000000000, 1000000000))
    mtime_before = os.path.getmtime(scope_input_path)

    # re-run the same scope: input.parquet is unchanged -> rewrite is skipped
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "E2E test scope", "test description",
          scope_id="scopes-001")
    assert os.path.getmtime(scope_input_path) == mtime_before
    assert "skipping scopes-001-input.parquet rewrite" in capsys.readouterr().out

    # touch the source input.parquet -> next run must rewrite
    input_path = os.path.join(data_dir, dataset_id, "input.parquet")
    os.utime(input_path, None)
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "E2E test scope", "test description",
          scope_id="scopes-001")
    assert os.path.getmtime(scope_input_path) != mtime_before


def test_cluster_evoc_reads_lancedb_embeddings(pipeline_env):
    """Regression: EVoC (the default cluster method) must read embeddings from
    the LanceDB store. Before the fix it read embeddings/{id}.h5 directly and
    raised FileNotFoundError for every post-LanceDB embedding."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    run_ingest_and_embed(data_dir, dataset_id)

    from latentscope.scripts.cluster import _load_embeddings
    vectors = _load_embeddings(dataset_id, "embedding-001")
    assert vectors.shape == (N_PER_TOPIC * len(TOPICS), DIM)


def test_embed_rerun_completed_run_adds_no_duplicates(pipeline_env):
    """Regression: re-running a completed embedding whose row count is not a
    multiple of batch_size must not re-append the final partial batch."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    # 120 rows with batch_size=50 -> final batch is a partial 20
    run_ingest_and_embed(data_dir, dataset_id, batch_size=50)

    from latentscope.scripts.embed import embed
    from latentscope.util.embedding_store import get_embedding_count

    n_total = N_PER_TOPIC * len(TOPICS)
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total
    embed(dataset_id, "text", "fake-test-model", prefix=None,
          rerun="embedding-001", dimensions=None, batch_size=50)
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total


def test_embed_resumes_interrupted_run_exactly(pipeline_env, monkeypatch):
    """A run that crashes mid-way resumes from the exact stored row count and
    produces a complete, duplicate-free table."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    n_total = N_PER_TOPIC * len(TOPICS)

    from latentscope.scripts.ingest import ingest
    ingest(dataset_id, make_input_df(), text_column="text")

    import latentscope.scripts.embed as embed_mod

    class CrashingProvider(FakeEmbedProvider):
        calls = 0

        def embed(self, batch, dimensions=None):
            CrashingProvider.calls += 1
            if CrashingProvider.calls > 1:
                raise RuntimeError("simulated crash")
            return super().embed(batch, dimensions)

    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: CrashingProvider())
    with pytest.raises(SystemExit):
        embed_mod.embed(dataset_id, "text", "fake-test-model", prefix=None,
                        rerun=None, dimensions=None, batch_size=50)

    from latentscope.util.embedding_store import get_embedding_count, load_embeddings
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == 50

    # resume with a healthy provider
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())
    embed_mod.embed(dataset_id, "text", "fake-test-model", prefix=None,
                    rerun="embedding-001", dimensions=None, batch_size=50)
    vectors = load_embeddings(data_dir, dataset_id, "embedding-001")
    assert vectors.shape == (n_total, DIM)
    # the resumed rows must align with their input texts
    provider = FakeEmbedProvider()
    df = make_input_df()
    np.testing.assert_allclose(vectors[60], provider._vector(df["text"].iloc[60]),
                               atol=1e-6)


def test_crashed_run_does_not_get_its_id_reused(pipeline_env, monkeypatch):
    """Regression: a crashed embed run leaves a LanceDB table but no .json;
    the next run must allocate a fresh embedding id instead of appending into
    the half-finished table."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"

    from latentscope.scripts.ingest import ingest
    ingest(dataset_id, make_input_df(), text_column="text")

    import latentscope.scripts.embed as embed_mod

    class CrashingProvider(FakeEmbedProvider):
        calls = 0

        def embed(self, batch, dimensions=None):
            CrashingProvider.calls += 1
            if CrashingProvider.calls > 1:
                raise RuntimeError("simulated crash")
            return super().embed(batch, dimensions)

    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: CrashingProvider())
    with pytest.raises(SystemExit):
        embed_mod.embed(dataset_id, "text", "fake-test-model", prefix=None,
                        rerun=None, dimensions=None, batch_size=50)

    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())
    embed_mod.embed(dataset_id, "text", "fake-test-model", prefix=None,
                    rerun=None, dimensions=None, batch_size=50)

    from latentscope.util.embedding_store import get_embedding_count
    n_total = N_PER_TOPIC * len(TOPICS)
    # embedding-001 stays half-finished; the new run went to embedding-002
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == 50
    assert get_embedding_count(data_dir, dataset_id, "embedding-002") == n_total


def test_full_pipeline_evoc_default_method(pipeline_env):
    """The server's default cluster method is EVoC, which clusters on the raw
    embeddings (read through the LanceDB store). This is the path that broke
    when storage moved off HDF5."""
    data_dir = pipeline_env
    dataset_id = "e2e-test"
    n_total = N_PER_TOPIC * len(TOPICS)

    run_ingest_and_embed(data_dir, dataset_id)

    from latentscope.scripts.umapper import umapper
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)

    from latentscope.scripts.cluster import clusterer
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="evoc")
    cluster_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "clusters", "cluster-001.parquet"))
    assert len(cluster_df) == n_total
    assert cluster_df["cluster"].nunique() >= 2
    assert (cluster_df["cluster"] >= 0).all()


class FakeLateInteractionProvider(FakeEmbedProvider):
    """Deterministic late-interaction provider: per-token vectors are noisy
    copies of the topic direction plus one distinctive 'rare token' direction
    for a handful of marked documents."""

    late_interaction = True

    def __init__(self, dim=DIM):
        super().__init__(dim)
        rng = np.random.default_rng(7)
        self.rare_dir = rng.normal(size=dim)
        self.rare_dir /= np.linalg.norm(self.rare_dir)

    def embed_multi(self, batch, dimensions=None, is_query=False):
        token_vectors_list = []
        mean_vectors = []
        for text in batch:
            base = self._vector(text)
            seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[4:8], "little")
            rng = np.random.default_rng(seed)
            n_tokens = 3 + int(seed % 5)
            tokens = base + rng.normal(scale=0.05, size=(n_tokens, self.dim))
            if "zyzzyva" in text:
                tokens[0] = self.rare_dir
            tokens /= np.linalg.norm(tokens, axis=1, keepdims=True)
            token_vectors_list.append(tokens.astype(np.float32))
            mean = tokens.mean(axis=0)
            mean_vectors.append(mean / np.linalg.norm(mean))
        return np.array(mean_vectors, dtype=np.float32), token_vectors_list

    def embed(self, batch, dimensions=None):
        mean_vectors, _ = self.embed_multi(batch, dimensions)
        return mean_vectors.tolist()


def test_late_interaction_pipeline_and_maxsim_search(pipeline_env, monkeypatch):
    """embed with a late-interaction provider -> token vectors stored fp16,
    UMAP runs on the mean vectors, and MaxSim search surfaces the document
    containing the rare token."""
    data_dir = pipeline_env
    dataset_id = "e2e-li"
    n_total = N_PER_TOPIC * len(TOPICS)

    from latentscope.scripts.ingest import ingest
    df = make_input_df()
    # plant a rare token in one document
    rare_idx = 17
    df.loc[rare_idx, "text"] = df.loc[rare_idx, "text"] + " zyzzyva"
    ingest(dataset_id, df, text_column="text")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeLateInteractionProvider())
    embed_mod.embed(dataset_id, "text", "fake-li-model", prefix=None, rerun=None,
                    dimensions=None, batch_size=50)

    from latentscope.util.embedding_store import (
        get_embedding_count,
        has_token_vectors,
        load_embeddings,
        search_late_interaction,
    )
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total
    assert has_token_vectors(data_dir, dataset_id, "embedding-001")
    with open(os.path.join(data_dir, dataset_id, "embeddings", "embedding-001.json")) as f:
        assert json.load(f)["late_interaction"] is True

    # mean vectors feed UMAP without touching the token payload
    vectors = load_embeddings(data_dir, dataset_id, "embedding-001")
    assert vectors.shape == (n_total, DIM)
    from latentscope.scripts.umapper import umapper
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    umap_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "umaps", "umap-001.parquet"))
    assert len(umap_df) == n_total

    # MaxSim search with a query consisting of just the rare-token direction
    provider = FakeLateInteractionProvider()
    query_tokens = provider.rare_dir[None, :].astype(np.float32)
    indices, scores = search_late_interaction(
        data_dir, dataset_id, "embedding-001", query_tokens, final_limit=5)
    assert indices[0] == rare_idx, (
        f"expected rare-token doc {rare_idx} first, got {indices[:5]}")


@pytest.mark.skipif(not os.environ.get("LS_TEST_REAL_MODELS"),
                    reason="set LS_TEST_REAL_MODELS=1 to run model-download tests")
def test_colbert_provider_real_model():
    """The ColBERT provider must produce projected (96-dim for
    answerai-colbert-small-v1), normalized token vectors and expanded
    queries — i.e. actual ColBERT geometry, not raw BERT states."""
    from latentscope.models.providers.late_interaction import ColBERTEmbedProvider

    provider = ColBERTEmbedProvider("answerdotai/answerai-colbert-small-v1",
                                    {"late_interaction": True})
    provider.device = "cpu"
    provider.load_model()

    docs = ["The quick brown fox jumps over the lazy dog.",
            "A short document about cooking pasta."]
    mean_vectors, token_vectors = provider.embed_multi(docs)
    assert mean_vectors.shape == (2, 96)
    assert all(tv.shape[1] == 96 for tv in token_vectors)
    assert token_vectors[0].shape[0] != token_vectors[1].shape[0]
    np.testing.assert_allclose(np.linalg.norm(token_vectors[0], axis=1), 1.0,
                               atol=1e-4)

    _, query_tokens = provider.embed_multi(["fox jumping"], is_query=True)
    assert query_tokens[0].shape == (32, 96)  # ColBERT query expansion

    # MaxSim sanity: the fox query scores the fox doc higher
    def maxsim(q, d):
        return float((q @ d.T).max(axis=1).sum())
    assert maxsim(query_tokens[0], token_vectors[0]) > maxsim(query_tokens[0],
                                                              token_vectors[1])
