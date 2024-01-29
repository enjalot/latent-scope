import os
import time
import voyageai 
from .base import EmbedModelProvider

from latentscope.util import get_key

class VoyageAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = voyageai.Client(get_key("VOYAGE_API_KEY"))

    def embed(self, inputs):
        time.sleep(0.1) # TODO proper rate limiting
        response = self.client.embed(texts=inputs, model=self.name, truncation=self.params["truncation"])
        embeddings = response.embeddings
        return embeddings