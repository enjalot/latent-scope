import os
import time
import cohere
from dotenv import load_dotenv
from .base import EmbedModelProvider

load_dotenv()

class CohereAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = cohere.Client(os.getenv("COHERE_API_KEY"))

    def embed(self, inputs):
        time.sleep(0.01) # TODO proper rate limiting
        response = self.client.embed(texts=inputs, model=self.name, input_type=self.params["input_type"])
        embeddings = response.embeddings
        return embeddings