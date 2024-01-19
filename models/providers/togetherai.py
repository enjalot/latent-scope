import os
import tiktoken
import together
from dotenv import load_dotenv
from .base import ModelProvider

load_dotenv()

class TogetherAIProvider(ModelProvider):
    def load_model(self):
        together.api_key = os.getenv("TOGETHER_API_KEY")
        self.client = together.Together()
        self.encoder = tiktoken.encoding_for_model("text-embedding-ada-002")

    def embed(self, inputs):
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