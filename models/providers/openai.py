import os
import time
import tiktoken
from openai import OpenAI
from .base import EmbedModelProvider, ChatModelProvider

from dotenv import load_dotenv
load_dotenv()

class OpenAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.encoder = tiktoken.encoding_for_model(self.name)

    def embed(self, inputs):
        time.sleep(0.01) # TODO proper rate limiting
        enc = self.encoder
        max_tokens = self.params["max_tokens"]
        inputs = [b.replace("\n", " ") for b in inputs]
        inputs = [enc.decode(enc.encode(b)[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        response = self.client.embeddings.create(
            input=inputs,
            model=self.name,
        )
        embeddings = [embedding.embedding for embedding in response.data]
        return embeddings

class OpenAIChatProvider(ChatModelProvider):
    def load_model(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.encoder = tiktoken.encoding_for_model(self.name)

    def chat(self, messages):
        response = self.client.chat.completions.create(
            model=self.name,
            messages=messages
        )
        return response.choices[0].message.content