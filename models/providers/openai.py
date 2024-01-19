import os
import time
import tiktoken
from openai import OpenAI
from dotenv import load_dotenv
from .base import ModelProvider

load_dotenv()

class OpenAIProvider(ModelProvider):
    def load_model(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.encoder = tiktoken.encoding_for_model("text-embedding-ada-002")

    def embed(self, inputs):
        time.sleep(0.01) # TODO proper rate limiting
        enc = self.encoder
        max_tokens = self.params["max_tokens"]
        inputs = [b.replace("\n", " ") for b in inputs]
        inputs = [enc.decode(enc.encode(b)[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        response = self.client.embeddings.create(
            input=inputs,
            model="text-embedding-ada-002",
        )
        embeddings = [embedding.embedding for embedding in response.data]
        return embeddings