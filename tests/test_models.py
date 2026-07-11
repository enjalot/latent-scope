"""Tests for latentscope.models (model listing and provider resolution)."""
import os

import pytest


class TestEmbeddingModelList:
    def test_returns_list(self):
        from latentscope.models import get_embedding_model_list
        models = get_embedding_model_list()
        assert isinstance(models, list)
        assert len(models) > 0

    def test_each_model_has_required_fields(self):
        from latentscope.models import get_embedding_model_list
        for model in get_embedding_model_list():
            assert 'id' in model, f"Model missing 'id': {model}"
            assert 'provider' in model, f"Model missing 'provider': {model}"
            assert 'name' in model, f"Model missing 'name': {model}"

    def test_model_ids_are_unique(self):
        from latentscope.models import get_embedding_model_list
        ids = [m['id'] for m in get_embedding_model_list()]
        assert len(ids) == len(set(ids)), "Duplicate model IDs found"

    def test_no_emoji_in_ids(self):
        """Model IDs should not contain the HuggingFace emoji (issue #97)."""
        from latentscope.models import get_embedding_model_list
        for model in get_embedding_model_list():
            assert '🤗' not in model['id'], f"Emoji found in model id: {model['id']}"


class TestChatModelList:
    def test_returns_list(self):
        from latentscope.models import get_chat_model_list
        models = get_chat_model_list()
        assert isinstance(models, list)
        assert len(models) > 0

    def test_each_model_has_required_fields(self):
        from latentscope.models import get_chat_model_list
        for model in get_chat_model_list():
            assert 'id' in model
            assert 'provider' in model
            assert 'name' in model


class TestGetEmbeddingModelDict:
    def test_returns_known_model(self):
        from latentscope.models import get_embedding_model_dict, get_embedding_model_list
        first_model = get_embedding_model_list()[0]
        result = get_embedding_model_dict(first_model['id'])
        assert result['id'] == first_model['id']

    def test_raises_for_unknown_model(self):
        from latentscope.models import get_embedding_model_dict
        with pytest.raises(ValueError, match="not found"):
            get_embedding_model_dict("nonexistent-model-xyz")


class TestHuggingFaceIdParsing:
    """Verify that both the new 'huggingface-' prefix and legacy '🤗-' prefix work."""

    def test_parse_huggingface_prefix(self):
        from latentscope.models import _parse_hf_model_id
        assert _parse_hf_model_id("huggingface-BAAI___bge-small-en-v1.5") == "BAAI/bge-small-en-v1.5"

    def test_parse_emoji_prefix(self):
        from latentscope.models import _parse_hf_model_id
        assert _parse_hf_model_id("🤗-BAAI___bge-small-en-v1.5") == "BAAI/bge-small-en-v1.5"

    def test_parse_transformers_prefix(self):
        from latentscope.models import _parse_hf_model_id
        assert _parse_hf_model_id("transformers-BAAI___bge-small-en-v1.5") == "BAAI/bge-small-en-v1.5"

    def test_returns_none_for_non_hf_id(self):
        from latentscope.models import _parse_hf_model_id
        assert _parse_hf_model_id("openai-text-embedding-3-small") is None


class TestModel2VecModels:
    """Pre-distilled Model2Vec (potion) models ride the existing HF path (#68).

    The seeded repos are published in sentence-transformers format (a
    StaticEmbedding module), so they load through TransformersEmbedProvider
    with no model2vec package and no provider changes.
    """

    POTION_IDS = [
        "huggingface-minishlab___potion-base-2M",
        "huggingface-minishlab___potion-base-8M",
        "huggingface-minishlab___potion-retrieval-32M",
    ]

    @pytest.mark.parametrize("model_id", POTION_IDS)
    def test_seeded_in_registry(self, model_id):
        from latentscope.models import get_embedding_model_dict

        model = get_embedding_model_dict(model_id)
        assert model["provider"] == "huggingface"
        assert model["name"] == model_id[len("huggingface-") :].replace("___", "/")

    @pytest.mark.parametrize("model_id", POTION_IDS)
    def test_resolves_to_transformers_provider(self, model_id):
        """get_embedding_model must return a TransformersEmbedProvider without
        loading any weights (the constructor only imports torch; load_model is
        a separate step)."""
        from latentscope.models import get_embedding_model
        from latentscope.models.providers.transformers import TransformersEmbedProvider

        provider = get_embedding_model(model_id)
        assert isinstance(provider, TransformersEmbedProvider)
        assert provider.name == model_id[len("huggingface-") :].replace("___", "/")
        assert not hasattr(provider, "model")  # weights not loaded


@pytest.mark.skipif(
    not os.environ.get("LS_TEST_REAL_MODELS"),
    reason="set LS_TEST_REAL_MODELS=1 to run model-download tests",
)
def test_model2vec_potion_real_model():
    """Loading a pre-distilled Model2Vec checkpoint through the HF path must
    produce normalized static embeddings with sane semantics (#68)."""
    import numpy as np

    from latentscope.models import get_embedding_model

    provider = get_embedding_model("huggingface-minishlab___potion-base-8M")
    provider.device = "cpu"
    provider.load_model()

    vecs = np.array(
        provider.embed(
            [
                "The quick brown fox jumps over the lazy dog.",
                "A fast auburn fox leaps above a sleepy hound.",
                "A short document about cooking pasta.",
            ]
        )
    )
    assert vecs.shape[0] == 3
    assert vecs.shape[1] > 0
    np.testing.assert_allclose(np.linalg.norm(vecs, axis=1), 1.0, atol=1e-4)
    sims = vecs @ vecs.T
    assert sims[0, 1] > sims[0, 2], f"fox sentences should be closer: {sims}"
