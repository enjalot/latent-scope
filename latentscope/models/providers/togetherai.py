import os
import time
from .base import EmbedModelProvider

class TogetherAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        import tiktoken
        import together
        from latentscope.util import get_key
        api_key = get_key("TOGETHER_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for Together")
            print("Missing 'TOGETHER_API_KEY' variable in:", f"{os.getcwd()}/.env")
        together.api_key = api_key
        self.client = together.Together()
        self.encoder = tiktoken.encoding_for_model("text-embedding-ada-002")

    def embed(self, inputs, dimensions=None):
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