import os
import time
import tiktoken
import together
from .base import EmbedModelProvider

from latentscope.util import get_key

class TogetherAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        together.api_key = get_key("TOGETHER_API_KEY")
        self.client = together.Together()
        self.encoder = tiktoken.encoding_for_model("text-embedding-ada-002")

    def embed(self, inputs):
        time.sleep(0.2) # TODO proper rate limiting
        enc = self.encoder
        max_tokens = self.params["max_tokens"]
        inputs = [b.replace("\n", " ") for b in inputs]
        inputs = [enc.decode(enc.encode(b)[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        response = self.client.embeddings.create(
            input=inputs,
            model=self.name
        )
        embeddings = [response.data[i].embedding for i in range(len(inputs))]
        return embeddings