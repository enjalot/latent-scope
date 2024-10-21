import os
import time
from .base import EmbedModelProvider, ChatModelProvider

import os
import time
from .base import EmbedModelProvider, ChatModelProvider

class OllamaEmbedProvider(EmbedModelProvider):
    def load_model(self):
        from ollama import Client
        self.client = Client(host='http://localhost:11434')
        import tiktoken
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def embed(self, inputs, dimensions=None):
        # Currently not doing any fancy encoding, just sending the text as is
        inputs = [b.replace("\n", " ") for b in inputs]

        # This can probably be done more efficiently in a batched manner.
        embeddings = []
        for input_text in inputs:
            response = self.client.embeddings(
                model=self.name, 
                prompt=input_text,
                options={"temperature": 0, "num_ctx": self.params["num_ctx"]}
            )
            embeddings.append(response["embedding"])

        return embeddings

class OllamaChatProvider(ChatModelProvider):
    def load_model(self):
        from ollama import Client
        self.client = Client(host='http://localhost:11434')
        import tiktoken
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def chat(self, messages):
        response = self.client.chat(
            model=self.name,
            messages=messages
        )

        return response["message"]["content"]

