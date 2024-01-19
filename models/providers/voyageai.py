import os
import voyageai 
from dotenv import load_dotenv
from .base import ModelProvider

load_dotenv()

class VoyageAIProvider(ModelProvider):
    def load_model(self):
        # voyageai.api_key = os.getenv("VOYAGE_API_KEY")
        self.client = voyageai.Client(os.getenv("VOYAGE_API_KEY"))

    def embed(self, inputs):
        response = self.client.embed(texts=inputs, model=self.name, truncation=self.params["truncation"])
        embeddings = response.embeddings
        return embeddings