import os
import time
from .base import EmbedModelProvider

from latentscope.util import get_key

class CohereAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        import cohere
        api_key = get_key("COHERE_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for Cohere")
            print("Missing 'COHERE_API_KEY' variable in:", f"{os.getcwd()}/.env")
        self.client = cohere.Client(api_key)

    def embed(self, inputs, dimensions=None):
        time.sleep(0.01) # TODO proper rate limiting
        response = self.client.embed(texts=inputs, model=self.name, input_type=self.params["input_type"])
        embeddings = response.embeddings
        return embeddings