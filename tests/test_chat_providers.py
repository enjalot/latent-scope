"""Tests for the API chat providers (OpenAI, Anthropic) with fake clients.

No network access or API keys required: clients are stubbed out after
load_model() so we can assert on the exact request parameters sent.
"""

from types import SimpleNamespace

from latentscope.models import get_chat_model, get_chat_model_list
from latentscope.models.providers.anthropic import AnthropicChatProvider
from latentscope.models.providers.openai import OpenAIChatProvider


class FakeOpenAIClient:
    def __init__(self, reply="a label"):
        self.calls = []
        outer = self

        class Completions:
            def create(self, **kwargs):
                outer.calls.append(kwargs)
                message = SimpleNamespace(content=reply)
                return SimpleNamespace(choices=[SimpleNamespace(message=message)])

        self.chat = SimpleNamespace(completions=Completions())


class FakeAnthropicClient:
    def __init__(self, reply="a label", stop_reason="end_turn"):
        self.calls = []
        outer = self

        class Messages:
            def create(self, **kwargs):
                outer.calls.append(kwargs)
                block = SimpleNamespace(type="text", text=reply)
                return SimpleNamespace(stop_reason=stop_reason, content=[block])

        self.messages = Messages()


class TestRegistryResolution:
    def test_anthropic_ids_resolve(self):
        for mid in [
            "anthropic-claude-haiku-4-5",
            "anthropic-claude-sonnet-5",
            "anthropic-claude-opus-4-8",
        ]:
            provider = get_chat_model(mid)
            assert isinstance(provider, AnthropicChatProvider)
            assert provider.name == mid[len("anthropic-") :]

    def test_openai_ids_resolve(self):
        for mid in ["openai-gpt-5.5", "openai-gpt-5.4-mini", "openai-gpt-5-mini"]:
            provider = get_chat_model(mid)
            assert isinstance(provider, OpenAIChatProvider)

    def test_all_registry_models_resolve(self):
        for model in get_chat_model_list():
            provider = get_chat_model(model["id"])
            assert provider is not None


class TestOpenAIChatProvider:
    def _provider(self):
        provider = OpenAIChatProvider("gpt-5-mini", {"max_completion_tokens": 64000})
        provider.client = FakeOpenAIClient(reply="Pet Discussions")
        provider.encoder = None
        return provider

    def test_summarize_sends_no_token_or_sampling_params(self):
        # gpt-5+ models 400 on max_tokens (they take max_completion_tokens)
        # and on non-default temperature, so neither may be sent
        provider = self._provider()
        label = provider.summarize(["cats", "dogs"], "pets")
        assert label == "Pet Discussions"
        (call,) = provider.client.calls
        assert call["model"] == "gpt-5-mini"
        for banned in ("max_tokens", "max_completion_tokens", "temperature", "top_p"):
            assert banned not in call

    def test_summarize_prompt_includes_items(self):
        provider = self._provider()
        provider.summarize(["cats are great"], "pets")
        (call,) = provider.client.calls
        assert "cats are great" in call["messages"][-1]["content"]

    def test_chat_returns_message_content(self):
        provider = self._provider()
        out = provider.chat([{"role": "user", "content": "hi"}])
        assert out == "Pet Discussions"


class TestAnthropicChatProvider:
    def _provider(self, **fake_kwargs):
        provider = AnthropicChatProvider("claude-haiku-4-5", {"max_tokens": 8192})
        provider.client = FakeAnthropicClient(**fake_kwargs)
        provider.encoder = None
        return provider

    def test_summarize_returns_text(self):
        provider = self._provider(reply="Pet Discussions")
        label = provider.summarize(["cats", "dogs"], "pets")
        assert label == "Pet Discussions"
        (call,) = provider.client.calls
        assert call["model"] == "claude-haiku-4-5"
        assert call["max_tokens"] == 8192
        assert "system" not in call

    def test_system_messages_hoisted_to_top_level(self):
        provider = self._provider()
        provider.chat(
            [
                {"role": "system", "content": "be terse"},
                {"role": "user", "content": "hi"},
            ]
        )
        (call,) = provider.client.calls
        assert call["system"] == "be terse"
        assert all(m["role"] != "system" for m in call["messages"])

    def test_refusal_returns_empty_string(self):
        provider = self._provider(stop_reason="refusal")
        assert provider.chat([{"role": "user", "content": "hi"}]) == ""

    def test_encoder_is_none_for_labeler_truncation_skip(self):
        # label_clusters uses model.encoder for token truncation and
        # handles None by keeping items untruncated
        provider = self._provider()
        assert provider.encoder is None


class TestChatModelRegistry:
    def test_anthropic_entries_have_max_tokens(self):
        anthropic_models = [m for m in get_chat_model_list() if m["provider"] == "anthropic"]
        assert len(anthropic_models) >= 3
        for m in anthropic_models:
            assert m["params"]["max_tokens"] > 0

    def test_registry_is_valid_json_with_required_fields(self):
        for m in get_chat_model_list():
            assert set(m) >= {"provider", "name", "id", "params"}
