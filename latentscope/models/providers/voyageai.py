import os
import time
import voyageai 
from .base import EmbedModelProvider

from dotenv import load_dotenv
load_dotenv()

class VoyageAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = voyageai.Client(os.getenv("VOYAGE_API_KEY"))

    def embed(self, inputs):
        time.sleep(0.1) # TODO proper rate limiting
        response = self.client.embed(texts=inputs, model=self.name, truncation=self.params["truncation"])
        embeddings = response.embeddings
        return embeddings