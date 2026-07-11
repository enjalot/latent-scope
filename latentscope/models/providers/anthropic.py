from latentscope.util import get_key

from .base import ChatModelProvider


class AnthropicChatProvider(ChatModelProvider):
    def load_model(self):
        import tiktoken
        from anthropic import Anthropic

        api_key = get_key("ANTHROPIC_API_KEY")
        if api_key is not None:
            self.client = Anthropic(api_key=api_key)
        else:
            # fall back to the SDK's own resolution (ANTHROPIC_API_KEY env,
            # ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile)
            self.client = Anthropic()
        # Claude has no local tokenizer; use the gpt-4o encoding as a rough
        # approximation so label_clusters' --max_tokens_per_sample /
        # --max_tokens_total caps still apply (same fallback the OpenAI
        # provider uses for custom endpoints)
        self.encoder = tiktoken.encoding_for_model("gpt-4o")

    def chat(self, messages):
        # the Messages API takes system prompts as a top-level param
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        chat_messages = [m for m in messages if m["role"] != "system"]
        kwargs = {
            "model": self.name,
            "max_tokens": self.params.get("max_tokens", 1024),
            "messages": chat_messages,
        }
        if system:
            kwargs["system"] = system
        response = self.client.messages.create(**kwargs)
        if response.stop_reason == "refusal":
            print(f"WARNING: {self.name} refused the request")
            return ""
        return "".join(block.text for block in response.content if block.type == "text")

    def summarize(self, items, context=""):
        from .prompts import summarize

        prompt = summarize(items, context)
        return self.chat([{"role": "user", "content": prompt}])
