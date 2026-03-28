"""Tests for latentscope.models (model listing and provider resolution)."""
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
