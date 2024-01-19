import os
import cohere
from dotenv import load_dotenv
from .base import ModelProvider

load_dotenv()

class CohereAIProvider(ModelProvider):
    def load_model(self):
        self.client = cohere.Client(os.getenv("COHERE_API_KEY"))

    def embed(self, inputs):
        response = self.client.embed(texts=inputs, model=self.name, input_type=self.params["input_type"])
        embeddings = response.embeddings
        return embeddings