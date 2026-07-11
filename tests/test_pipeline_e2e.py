"""End-to-end pipeline tests on a small dataset with a deterministic fake
embedding model.

These tests exercise the real pipeline code (ingest -> embed -> umap ->
cluster -> scope) against a temporary data directory. The embedding model is
replaced with a deterministic provider so no model downloads or GPU are
required; everything downstream of the provider is the production code path,
including LanceDB storage.
"""

import hashlib
import io
import json
import os

import numpy as np
import pandas as pd
import pytest
from PIL import Image

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
    # no -1 survives: by default noise becomes an explicit "Unclustered"
    # cluster (#143); --assign-noise would reassign to nearest centroids
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


def test_scope_rerun_refreshes_combined_input_parquet(pipeline_env):
    """Regression (Codex review on #121): {scope}-input.parquet is input data
    JOINED with the scope columns, so re-saving a scope with a different
    clustering must rewrite it — a skip keyed on input.parquet alone served
    stale labels/coordinates to published scopes and export_lance."""
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
    first = pd.read_parquet(scope_input_path)
    assert "cluster" in first.columns  # combined file carries scope columns

    # second clustering with different params -> different cluster column
    clusterer(dataset_id, "umap-001", samples=10, min_samples=5,
              cluster_selection_epsilon=0.5, column=None, method="hdbscan")
    scope(dataset_id, "embedding-001", "umap-001", "cluster-002",
          "default", "E2E test scope", "test description",
          scope_id="scopes-001")
    refreshed = pd.read_parquet(scope_input_path)
    cluster_labels_df = pd.read_parquet(os.path.join(
        data_dir, dataset_id, "clusters", "cluster-002.parquet"))
    # the combined file must reflect the NEW clustering, not the stale one
    assert refreshed["cluster"].tolist() == cluster_labels_df["cluster"].tolist()


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

    def tokenize_documents(self, inputs):
        """Mirror embed_multi's token counts: CLS + words + (pad) + SEP,
        with real char offsets for the word tokens."""
        results = []
        for text in inputs:
            seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[4:8], "little")
            n_tokens = 3 + int(seed % 5)
            words = []
            cursor = 0
            for word in text.split():
                start = text.index(word, cursor)
                words.append((word, start, start + len(word)))
                cursor = start + len(word)
            tokens = [("<cls>", -1, -1)]
            tokens += words[:n_tokens - 2]
            while len(tokens) < n_tokens - 1:
                tokens.append(("<pad>", -1, -1))
            tokens.append(("<sep>", -1, -1))
            results.append(tokens)
        return results


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


def _setup_li_dataset(data_dir, dataset_id, monkeypatch):
    """ingest + embed a small dataset with the fake late-interaction provider."""
    from latentscope.scripts.ingest import ingest
    df = make_input_df()
    ingest(dataset_id, df, text_column="text")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeLateInteractionProvider())
    embed_mod.embed(dataset_id, "text", "fake-li-model", prefix=None, rerun=None,
                    dimensions=None, batch_size=50)
    return df


def test_tokenize_writes_aligned_token_metadata(pipeline_env, monkeypatch):
    """ls-tokenize writes one metadata row per stored token vector, with
    correct parent links, global indices, and char offsets."""
    data_dir = pipeline_env
    dataset_id = "e2e-tok"
    df = _setup_li_dataset(data_dir, dataset_id, monkeypatch)

    monkeypatch.setattr("latentscope.models.get_embedding_model",
                        lambda model_id: FakeLateInteractionProvider())
    from latentscope.scripts.tokens import tokenizer
    tokenizer(dataset_id, "embedding-001", batch_size=30)

    from latentscope.util.embedding_store import (
        count_token_metadata,
        has_token_metadata,
        load_num_tokens,
        load_token_metadata,
    )
    num_tokens = load_num_tokens(data_dir, dataset_id, "embedding-001")
    assert has_token_metadata(data_dir, dataset_id, "embedding-001")
    assert count_token_metadata(data_dir, dataset_id, "embedding-001") == num_tokens.sum()

    # global token_index of a doc's first token == cumulative offset
    offsets = np.concatenate([[0], np.cumsum(num_tokens)])
    for ls_index in [0, 5, len(df) - 1]:
        tok_df = load_token_metadata(data_dir, dataset_id, "embedding-001",
                                     ls_indices=[ls_index])
        assert len(tok_df) == num_tokens[ls_index]
        assert tok_df["token_index"].iloc[0] == offsets[ls_index]
        assert (tok_df["token_pos"].to_numpy() == np.arange(len(tok_df))).all()
        assert (tok_df["ls_index"] == ls_index).all()
        # surface tokens' char spans slice the original text back out
        text = df["text"].iloc[ls_index]
        for _, row in tok_df.iterrows():
            if row["char_start"] >= 0:
                assert text[row["char_start"]:row["char_end"]] == row["token_str"]

    # lookup by global token index works too
    tok_df = load_token_metadata(data_dir, dataset_id, "embedding-001",
                                 token_indices=[0, 1, int(offsets[3])])
    assert len(tok_df) == 3
    assert tok_df["ls_index"].tolist() == [0, 0, 3]

    # meta json written
    with open(os.path.join(data_dir, dataset_id, "embeddings",
                           "embedding-001-tokens.json")) as f:
        meta = json.load(f)
    assert meta["total_tokens"] == int(num_tokens.sum())


def test_tokenize_mismatch_fails_loudly(pipeline_env, monkeypatch):
    """A count mismatch between re-tokenization and stored vectors must abort
    without leaving a partial (misaligned) token table behind."""
    data_dir = pipeline_env
    dataset_id = "e2e-tok-bad"
    _setup_li_dataset(data_dir, dataset_id, monkeypatch)

    class BrokenTokenizer(FakeLateInteractionProvider):
        def tokenize_documents(self, inputs):
            results = super().tokenize_documents(inputs)
            return [tokens[:-1] for tokens in results]  # off by one everywhere

    monkeypatch.setattr("latentscope.models.get_embedding_model",
                        lambda model_id: BrokenTokenizer())
    from latentscope.scripts.tokens import tokenizer
    with pytest.raises(SystemExit):
        tokenizer(dataset_id, "embedding-001", batch_size=30)

    from latentscope.util.embedding_store import has_token_metadata
    assert not has_token_metadata(data_dir, dataset_id, "embedding-001")


def test_iter_token_vectors_streams_in_order(pipeline_env, monkeypatch):
    """The streaming iterator yields every document's token vectors in
    ls_index order, matching the bulk loader."""
    data_dir = pipeline_env
    dataset_id = "e2e-tok-stream"
    _setup_li_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.util.embedding_store import (
        iter_token_vectors,
        load_num_tokens,
        load_token_vectors,
    )
    bulk = load_token_vectors(data_dir, dataset_id, "embedding-001")
    num_tokens = load_num_tokens(data_dir, dataset_id, "embedding-001")

    seen_ls = []
    streamed = []
    for ls_indices, vec_list in iter_token_vectors(
            data_dir, dataset_id, "embedding-001", row_batch_size=17):
        seen_ls.extend(ls_indices.tolist())
        streamed.extend(vec_list)

    assert seen_ls == list(range(len(bulk)))
    assert [len(v) for v in streamed] == num_tokens.tolist()
    for a, b in zip(streamed, bulk):
        np.testing.assert_allclose(a, b, rtol=1e-6)


def _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch):
    df = _setup_li_dataset(data_dir, dataset_id, monkeypatch)
    monkeypatch.setattr("latentscope.models.get_embedding_model",
                        lambda model_id: FakeLateInteractionProvider())
    from latentscope.scripts.tokens import tokenizer
    tokenizer(dataset_id, "embedding-001", batch_size=50)
    return df


def test_token_map_pipeline(pipeline_env, monkeypatch):
    """tokenize -> token umap -> cluster -> token scope: one point per token,
    parent links intact, token-frequency default labels."""
    data_dir = pipeline_env
    dataset_id = "e2e-tokmap"
    df = _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.util.embedding_store import count_token_metadata, load_num_tokens
    num_tokens = load_num_tokens(data_dir, dataset_id, "embedding-001")
    total_tokens = count_token_metadata(data_dir, dataset_id, "embedding-001")

    from latentscope.scripts.umapper import token_umapper
    umap_id = token_umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1, seed=42)
    assert umap_id == "umap-001"
    umap_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "umaps", "umap-001.parquet"))
    assert len(umap_df) == total_tokens
    with open(os.path.join(data_dir, dataset_id, "umaps", "umap-001.json")) as f:
        umap_meta = json.load(f)
    assert umap_meta["granularity"] == "tokens"
    assert umap_meta["total_tokens"] == total_tokens

    from latentscope.scripts.cluster import clusterer
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")
    cluster_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "clusters", "cluster-001.parquet"))
    assert len(cluster_df) == total_tokens
    with open(os.path.join(data_dir, dataset_id, "clusters", "cluster-001.json")) as f:
        assert json.load(f)["granularity"] == "tokens"

    # default labels are built from real token strings, not "Cluster N"
    labels_df = pd.read_parquet(os.path.join(
        data_dir, dataset_id, "clusters", "cluster-001-labels-default.parquet"))
    non_noise = labels_df[labels_df["label"] != "Unclustered"]
    assert (~non_noise["label"].str.startswith("Cluster ")).any()

    from latentscope.scripts.scope import scope
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001", "default",
          "token map", "token scope test")
    scope_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "scopes", "scopes-001.parquet"))
    assert len(scope_df) == total_tokens
    # positional invariant + parent linkage
    assert (scope_df["ls_index"].to_numpy() == np.arange(total_tokens)).all()
    assert "parent_index" in scope_df.columns
    assert "token_str" in scope_df.columns
    offsets = np.concatenate([[0], np.cumsum(num_tokens)])
    for ls in [0, 7, len(df) - 1]:
        rows = scope_df[scope_df["parent_index"] == ls]
        assert len(rows) == num_tokens[ls]
        assert rows["ls_index"].iloc[0] == offsets[ls]

    with open(os.path.join(data_dir, dataset_id, "scopes", "scopes-001.json")) as f:
        scope_meta = json.load(f)
    assert scope_meta["granularity"] == "tokens"
    assert scope_meta["tokens"]["total_tokens"] == total_tokens

    # token-level input parquet has char spans and NOT the document text
    input_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "scopes", "scopes-001-input.parquet"))
    assert len(input_df) == total_tokens
    assert "char_start" in input_df.columns
    assert "text" not in input_df.columns


def test_token_umapper_sample_fit_path(pipeline_env, monkeypatch):
    """When total tokens exceed fit_sample, the reducer fits on a sample and
    batch-transforms everything; output still covers every token."""
    data_dir = pipeline_env
    dataset_id = "e2e-tokfit"
    _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.util.embedding_store import count_token_metadata
    total_tokens = count_token_metadata(data_dir, dataset_id, "embedding-001")

    from latentscope.scripts.umapper import token_umapper
    token_umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1,
                  seed=42, fit_sample=total_tokens // 3,
                  transform_batch_tokens=100)
    umap_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "umaps", "umap-001.parquet"))
    assert len(umap_df) == total_tokens
    assert umap_df["x"].between(-1, 1).all()
    with open(os.path.join(data_dir, dataset_id, "umaps", "umap-001.json")) as f:
        assert json.load(f)["fit_sample"] == total_tokens // 3


def test_token_cluster_rejects_row_level_input(pipeline_env, monkeypatch):
    """Clustering a token umap on the (row-level) embedding matrix must fail
    loudly instead of producing misaligned output."""
    data_dir = pipeline_env
    dataset_id = "e2e-tokguard"
    _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.scripts.umapper import token_umapper
    token_umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1, seed=42)

    from latentscope.scripts.cluster import clusterer
    with pytest.raises(SystemExit):
        clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
                  cluster_selection_epsilon=0.0, column=None, method="hdbscan",
                  cluster_on="embedding")


class FakeSae:
    """Stand-in for latentsae.Sae: top-k on a fixed random projection."""

    def __init__(self, d_in=DIM, num_latents=64, k=4):
        import torch
        rng = np.random.default_rng(3)
        self.proj = torch.from_numpy(
            rng.normal(size=(d_in, num_latents)).astype(np.float32))
        self.num_latents = num_latents
        self.k = k

    def encode(self, x):
        import torch
        from collections import namedtuple
        acts = torch.relu(x.cpu() @ self.proj)
        top = torch.topk(acts, self.k, dim=-1)
        Out = namedtuple("EncoderOutput", ["top_acts", "top_indices"])
        return Out(top.values, top.indices)


def test_token_sae_encodes_every_token(pipeline_env, monkeypatch):
    """ls-sae --granularity tokens writes one h5 row per token."""
    data_dir = pipeline_env
    dataset_id = "e2e-toksae"
    _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.util.embedding_store import count_token_metadata
    total_tokens = count_token_metadata(data_dir, dataset_id, "embedding-001")

    import latentscope.scripts.sae as sae_mod
    fake = FakeSae()
    monkeypatch.setattr(sae_mod, "_load_sae",
                        lambda model_id, k_expansion, device, checkpoint=None: fake)
    sae_mod.saer(dataset_id, "embedding-001", "fake-sae", "64_4", "cpu",
                 granularity="tokens", batch_size=100)

    import h5py
    with h5py.File(os.path.join(data_dir, dataset_id, "saes", "sae-001.h5")) as f:
        assert f["top_acts"].shape == (total_tokens, fake.k)
        assert f["top_indices"].shape == (total_tokens, fake.k)
    with open(os.path.join(data_dir, dataset_id, "saes", "sae-001.json")) as f:
        meta = json.load(f)
    assert meta["granularity"] == "tokens"
    assert meta["rows"] == total_tokens
    features_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "saes", "sae-001_features.parquet"))
    assert len(features_df) == fake.num_latents
    assert features_df["count"].sum() > 0


def test_tokens_indexed_endpoint(pipeline_env, client, monkeypatch):
    """POST /api/tokens/indexed returns one row per token: parent document
    columns + token string/pos/char span, in request order."""
    data_dir = pipeline_env
    dataset_id = "e2e-tokapi"
    df = _setup_tokenized_dataset(data_dir, dataset_id, monkeypatch)

    from latentscope.util.embedding_store import load_num_tokens
    num_tokens = load_num_tokens(data_dir, dataset_id, "embedding-001")
    offsets = np.concatenate([[0], np.cumsum(num_tokens)])

    # second token of doc 4 (a surface word token in the fake tokenizer),
    # then a token from doc 0 — out of order on purpose
    t_doc4 = int(offsets[4]) + 1
    t_doc0 = int(offsets[0]) + 1
    resp = client.post('/api/tokens/indexed', json={
        "dataset": dataset_id,
        "embedding_id": "embedding-001",
        "indices": [t_doc4, t_doc0],
    })
    assert resp.status_code == 200
    rows = json.loads(resp.data)
    assert len(rows) == 2
    assert rows[0]["index"] == t_doc4
    assert rows[0]["parent_index"] == 4
    assert rows[1]["parent_index"] == 0
    # char span slices the parent text to the token string
    text = df["text"].iloc[4]
    r = rows[0]
    assert text[r["char_start"]:r["char_end"]] == r["token_str"]
    # parent document columns come along
    assert r["text"] == text

    # empty request is a clean empty list
    resp = client.post('/api/tokens/indexed', json={
        "dataset": dataset_id, "embedding_id": "embedding-001", "indices": []})
    assert resp.status_code == 200
    assert json.loads(resp.data) == []


# --------------------------------------------------------------------------
# Image embedding pipeline (issue #87)
# --------------------------------------------------------------------------

COLORS = {"red": (200, 30, 30), "green": (30, 200, 30), "blue": (30, 30, 200)}
N_PER_COLOR = 30


class FakeImageEmbedProvider:
    """Deterministic stand-in for an image embedding model.

    The vector is derived from the image's mean RGB (tiled across the
    dimensions) plus small noise seeded by the exact pixel content, so the
    three planted color groups give clustering real structure to find.
    """

    name = "fake-image-model"
    late_interaction = False
    supports_images = True
    input_types = ["image"]

    def __init__(self, dim=DIM):
        self.dim = dim

    def load_model(self):
        pass

    def _vector(self, img):
        arr = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
        stats = arr.mean(axis=(0, 1))  # mean R, G, B
        seed = int(arr.sum() * 1e6) % (2**32)
        noise = np.random.default_rng(seed).normal(scale=0.02, size=self.dim)
        vec = np.tile(stats, self.dim // 3 + 1)[: self.dim] + noise
        return (vec / np.linalg.norm(vec)).astype(np.float32)

    def embed(self, batch, dimensions=None):
        return [self._vector(img) for img in batch]


def make_image_df(n_per_color=N_PER_COLOR):
    rng = np.random.default_rng(11)
    rows = []
    for color, rgb in COLORS.items():
        for i in range(n_per_color):
            arr = np.clip(
                np.array(rgb) + rng.normal(scale=12, size=(8, 8, 3)), 0, 255
            ).astype(np.uint8)
            buf = io.BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            rows.append({
                "image": {"bytes": buf.getvalue(), "path": f"{color}_{i}.png"},
                "color": color,
            })
    return pd.DataFrame(rows)


@pytest.fixture
def image_pipeline_env(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeImageEmbedProvider())
    return tmp_data_dir


def test_full_pipeline_image_column(image_pipeline_env):
    """ingest(binary image column) -> embed(image model) -> umap ->
    cluster(hdbscan) -> scope, mirroring the text e2e."""
    data_dir = image_pipeline_env
    dataset_id = "e2e-images"
    n_total = N_PER_COLOR * len(COLORS)

    from latentscope.scripts.embed import decode_image_value, embed
    from latentscope.scripts.ingest import ingest

    df = make_image_df()
    ingest(dataset_id, df, text_column="color")
    with open(os.path.join(data_dir, dataset_id, "meta.json")) as f:
        assert json.load(f)["column_metadata"]["image"]["type"] == "image"

    embed(dataset_id, "image", "fake-image-model", prefix=None, rerun=None,
          dimensions=None, batch_size=40)

    # --- embed wrote a LanceDB table aligned with the input ---
    from latentscope.util.embedding_store import get_embedding_count, load_embeddings
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total
    vectors = load_embeddings(data_dir, dataset_id, "embedding-001")
    assert vectors.shape == (n_total, DIM)
    # row alignment: stored vector i must equal the provider's output for image i
    provider = FakeImageEmbedProvider()
    for idx in (7, n_total - 1):
        img = decode_image_value(df["image"].iloc[idx])
        np.testing.assert_allclose(vectors[idx], provider._vector(img), atol=1e-6)
    with open(os.path.join(data_dir, dataset_id, "embeddings",
                           "embedding-001.json")) as f:
        emb_meta = json.load(f)
    assert emb_meta["input_type"] == "image"
    assert emb_meta["text_column"] == "image"

    # --- umap ---
    from latentscope.scripts.umapper import umapper
    umapper(dataset_id, "embedding-001", neighbors=10, min_dist=0.1)
    umap_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "umaps", "umap-001.parquet"))
    assert len(umap_df) == n_total
    assert {"x", "y"} <= set(umap_df.columns)

    # --- cluster (hdbscan on the 2D projection) ---
    from latentscope.scripts.cluster import clusterer
    clusterer(dataset_id, "umap-001", samples=5, min_samples=3,
              cluster_selection_epsilon=0.0, column=None, method="hdbscan")
    cluster_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "clusters", "cluster-001.parquet"))
    assert len(cluster_df) == n_total
    assert cluster_df["cluster"].nunique() >= 2, (
        "expected the 3 planted color groups to form >=2 clusters")
    assert (cluster_df["cluster"] >= 0).all()

    # --- scope ---
    from latentscope.scripts.scope import scope
    scope(dataset_id, "embedding-001", "umap-001", "cluster-001",
          "default", "E2E image scope", "test description")
    scope_df = pd.read_parquet(
        os.path.join(data_dir, dataset_id, "scopes", "scopes-001.parquet"))
    assert len(scope_df) == n_total


def test_image_embed_null_row_gets_black_placeholder(image_pipeline_env, capsys):
    """Null/undecodable image rows are replaced with a 1x1 black image (with a
    warning), so the row count and alignment are preserved."""
    data_dir = image_pipeline_env
    dataset_id = "e2e-images-null"

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    df = make_image_df(n_per_color=4)
    null_idx, broken_idx = 3, 5
    df.at[null_idx, "image"] = None
    df.at[broken_idx, "image"] = {"bytes": b"corrupt not-an-image", "path": "x.png"}
    ingest(dataset_id, df, text_column="color")
    embed(dataset_id, "image", "fake-image-model", prefix=None, rerun=None,
          dimensions=None, batch_size=5)

    out = capsys.readouterr().out
    assert f"{null_idx} image is missing or undecodable" in out
    assert f"{broken_idx} image is missing or undecodable" in out

    from latentscope.util.embedding_store import get_embedding_count, load_embeddings
    n_total = len(df)
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total
    vectors = load_embeddings(data_dir, dataset_id, "embedding-001")
    provider = FakeImageEmbedProvider()
    placeholder_vec = provider._vector(Image.new("RGB", (1, 1), (0, 0, 0)))
    np.testing.assert_allclose(vectors[null_idx], placeholder_vec, atol=1e-6)
    np.testing.assert_allclose(vectors[broken_idx], placeholder_vec, atol=1e-6)


def test_image_column_with_text_only_model_errors(image_pipeline_env, monkeypatch):
    """Embedding an image column with a model that lacks image support must
    exit with an error instead of feeding raw dicts into the model."""
    dataset_id = "e2e-images-textmodel"

    import latentscope.scripts.embed as embed_mod
    from latentscope.scripts.ingest import ingest

    ingest(dataset_id, make_image_df(n_per_color=2), text_column="color")
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())
    with pytest.raises(SystemExit):
        embed_mod.embed(dataset_id, "image", "fake-test-model", prefix=None,
                        rerun=None, dimensions=None, batch_size=5)


@pytest.mark.skipif(not os.environ.get("LS_TEST_REAL_MODELS"),
                    reason="set LS_TEST_REAL_MODELS=1 to run model-download tests")
def test_clip_provider_real_model():
    """CLIP must put images and captions in one space: 512-dim normalized
    vectors where the red image is closer to 'a red square' than to
    'a blue square' (and vice versa)."""
    from latentscope.models.providers.image_embedding import CLIPEmbedProvider

    provider = CLIPEmbedProvider("openai/clip-vit-base-patch32", {})
    provider.device = "cpu"
    provider.load_model()

    red = Image.new("RGB", (64, 64), (255, 0, 0))
    blue = Image.new("RGB", (64, 64), (0, 0, 255))
    image_vecs = np.array(provider.embed([red, blue]))
    text_vecs = np.array(provider.embed(["a red square", "a blue square"]))

    assert image_vecs.shape == (2, 512)
    assert text_vecs.shape == (2, 512)
    np.testing.assert_allclose(np.linalg.norm(image_vecs, axis=1), 1.0, atol=1e-4)
    np.testing.assert_allclose(np.linalg.norm(text_vecs, axis=1), 1.0, atol=1e-4)

    sims = image_vecs @ text_vecs.T
    assert sims[0, 0] > sims[0, 1], f"red image should match red caption: {sims}"
    assert sims[1, 1] > sims[1, 0], f"blue image should match blue caption: {sims}"


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


# ---------------------------------------------------------------------------
# null / non-string text handling (#94)
# ---------------------------------------------------------------------------

def test_embed_handles_null_and_empty_text(pipeline_env):
    """#94: None / NaN / empty cells in the text column must not crash embed
    (a plain `s is None` check missed float NaN / pd.NA from null parquet
    cells, which then blew up on `prefix + s`). Row alignment is preserved."""
    data_dir = pipeline_env
    dataset_id = "nulls"
    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest
    from latentscope.util.embedding_store import get_embedding_count

    df = pd.DataFrame({"text": [
        "a normal sentence about science",
        None,
        "",
        float("nan"),
        "another sentence about cooking",
    ]})
    ingest(dataset_id, df, text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=2)
    # every input row produced exactly one stored vector
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == len(df)


# ---------------------------------------------------------------------------
# token counting (#77)
# ---------------------------------------------------------------------------

class FakeTokenizingProvider(FakeEmbedProvider):
    """FakeEmbedProvider that also exposes a tokenizer, so the embed step can
    collect token stats (word-count stands in for real tokenization)."""

    class _WordTokenizer:
        def encode(self, text):
            return text.split()

    def __init__(self, dim=DIM):
        super().__init__(dim)
        self.tokenizer = self._WordTokenizer()


def test_embed_failure_leaves_debug_parquet_and_rerun_cleans_it(pipeline_env,
                                                                monkeypatch,
                                                                capsys):
    """#143: a failed batch writes a debug parquet and points at --rerun; a
    subsequent successful --rerun completes and removes the stale debug file."""
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

    embedding_dir = os.path.join(data_dir, dataset_id, "embeddings")
    debug_path = os.path.join(embedding_dir, "embedding-001-batch-1.parquet")
    assert os.path.exists(debug_path)
    out = capsys.readouterr().out
    # the failure message names the exact resume command
    assert "ls-embed e2e-test text fake-test-model --rerun embedding-001" in out

    # resume with a healthy provider: run completes and cleans the debug file
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())
    embed_mod.embed(dataset_id, "text", "fake-test-model", prefix=None,
                    rerun="embedding-001", dimensions=None, batch_size=50)
    assert not os.path.exists(debug_path)
    out = capsys.readouterr().out
    assert "cleaned up stale debug batch file embedding-001-batch-1.parquet" in out
    assert os.path.exists(os.path.join(embedding_dir, "embedding-001.json"))

    from latentscope.util.embedding_store import get_embedding_count
    n_total = N_PER_TOPIC * len(TOPICS)
    assert get_embedding_count(data_dir, dataset_id, "embedding-001") == n_total


# ---------------------------------------------------------------------------
# max_seq_length OOM preflight (#143)
# ---------------------------------------------------------------------------

class FakeUncappedProvider(FakeEmbedProvider):
    """FakeEmbedProvider whose inner model advertises a huge max_seq_length,
    like sentence-transformers models with no practical sequence cap."""

    class _InnerModel:
        max_seq_length = 8192

    def __init__(self, dim=DIM):
        super().__init__(dim)
        self.model = self._InnerModel()


def test_embed_warns_when_max_seq_length_uncapped(pipeline_env, monkeypatch, capsys):
    """#143: an uncapped model without --max_seq_length gets a prominent OOM
    warning (print-only; the sequence length is never silently capped)."""
    dataset_id = "preflight"
    import latentscope.scripts.embed as embed_mod
    from latentscope.scripts.ingest import ingest

    ingest(dataset_id, make_input_df(n_per_topic=2), text_column="text")
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeUncappedProvider())
    embed_mod.embed(dataset_id, "text", "fake-uncapped", prefix=None, rerun=None,
                    dimensions=None, batch_size=5)
    out = capsys.readouterr().out
    assert "effective max_seq_length: 8192" in out
    assert "WARNING" in out
    assert "--max_seq_length 512 --batch_size 32" in out


def test_embed_no_warning_when_user_caps_max_seq_length(pipeline_env, monkeypatch,
                                                        capsys):
    dataset_id = "preflight-capped"
    import latentscope.scripts.embed as embed_mod
    from latentscope.scripts.ingest import ingest

    ingest(dataset_id, make_input_df(n_per_topic=2), text_column="text")
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeUncappedProvider())
    embed_mod.embed(dataset_id, "text", "fake-uncapped", prefix=None, rerun=None,
                    dimensions=None, batch_size=5, max_seq_length=512)
    out = capsys.readouterr().out
    assert "can exhaust MPS/CUDA memory" not in out


def test_make_token_counter_uses_provider_tokenizer():
    from latentscope.scripts.embed import _make_token_counter

    counter = _make_token_counter(FakeTokenizingProvider())
    assert counter(["one two three", "solo"]) == [3, 1]
    # provider without a tokenizer -> no counter (API providers tokenize remotely)
    assert _make_token_counter(FakeEmbedProvider()) is None


def test_embed_records_token_stats(pipeline_env, monkeypatch):
    """#77: a fresh embed run records per-doc token stats in the metadata."""
    data_dir = pipeline_env
    dataset_id = "toks"
    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeTokenizingProvider())
    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    df = make_input_df()
    ingest(dataset_id, df, text_column="text")
    embed(dataset_id, "text", "fake-tokenizing", prefix=None, rerun=None,
          dimensions=None, batch_size=50)

    with open(os.path.join(data_dir, dataset_id, "embeddings",
                           "embedding-001.json")) as f:
        meta = json.load(f)
    ts = meta["token_stats"]
    assert ts is not None
    assert ts["count"] == len(df)
    assert ts["total"] == sum(len(t.split()) for t in df["text"])
    assert ts["max"] >= ts["mean"] >= ts["min"] >= 1
