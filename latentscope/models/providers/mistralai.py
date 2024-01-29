import os
import time
from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage
from transformers import AutoTokenizer
from .base import EmbedModelProvider,ChatModelProvider

from dotenv import load_dotenv
load_dotenv()

# TODO verify these tokenizers somehow
# derived from:
  # https://docs.mistral.ai/platform/endpoints/
  # https://huggingface.co/docs/transformers/main/en/model_doc/mixtral
encoders = {
    "mistral-tiny": "mistralai/Mistral-7B-v0.1",
    "mistral-small": "mistralai/Mixtral-8x7B-v0.1",
    "mistral-medium": "mistralai/Mixtral-8x7B-v0.1", #just guessing
}

class MistralAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = MistralClient(os.getenv("MISTRAL_API_KEY"))

    def embed(self, inputs):
        time.sleep(0.1) # TODO proper rate limiting
        response = self.client.embeddings(input=inputs, model=self.name)
        return [e.embedding for e in response.data]

class MistralAIChatProvider(ChatModelProvider):
    def load_model(self):
        self.client = MistralClient(api_key=os.getenv("MISTRAL_API_KEY"))
        self.encoder = AutoTokenizer.from_pretrained(encoders[self.name])

    def chat(self, messages):
        instances = [ChatMessage(content=message["content"], role=message["role"]) for message in messages]
        response = self.client.chat(
            model=self.name,
            messages=instances
        )
        return response.choices[0].message.content