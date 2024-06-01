import os
import time
from .base import EmbedModelProvider, ChatModelProvider

from latentscope.util import get_key

class OpenAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        from openai import OpenAI
        import tiktoken
        api_key = get_key("OPENAI_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for OpenAI")
            print("Missing 'OPENAI_API_KEY' variable in:", f"{os.getcwd()}/.env")

        base_url = get_key("OPENAI_BASE_URL")
        if base_url is not None:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        else:
            self.client = OpenAI(api_key=api_key)

        self.encoder = tiktoken.encoding_for_model(self.name)

    def embed(self, inputs, dimensions=None):
        time.sleep(0.01) # TODO proper rate limiting
        enc = self.encoder
        max_tokens = self.params["max_tokens"]
        inputs = [b.replace("\n", " ") for b in inputs]
        inputs = [enc.decode(enc.encode(b)[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        if dimensions is not None and dimensions > 0:
            response = self.client.embeddings.create(
                input=inputs,
                model=self.name,
                dimensions=dimensions
            )
        else:
            response = self.client.embeddings.create(
                input=inputs,
                model=self.name
            )
        embeddings = [embedding.embedding for embedding in response.data]
        return embeddings

class OpenAIChatProvider(ChatModelProvider):
    def load_model(self):
        from openai import OpenAI
        import tiktoken
        self.client = OpenAI(api_key=get_key("OPENAI_API_KEY"))
        self.encoder = tiktoken.encoding_for_model(self.name)


    def chat(self, messages):
        response = self.client.chat.completions.create(
            model=self.name,
            messages=messages
        )
        return response.choices[0].message.content
