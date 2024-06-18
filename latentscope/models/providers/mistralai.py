import os
import time
from .base import EmbedModelProvider,ChatModelProvider

from latentscope.util import get_key

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
        from mistralai.client import MistralClient
        api_key = get_key("MISTRAL_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for Mistral")
            print("Missing 'MISTRAL_API_KEY' variable in:", f"{os.getcwd()}/.env")
        self.client = MistralClient(api_key=api_key)

    def embed(self, inputs, dimensions=None):
        time.sleep(0.1) # TODO proper rate limiting
        response = self.client.embeddings(input=inputs, model=self.name)
        return [e.embedding for e in response.data]

class MistralAIChatProvider(ChatModelProvider):
    def load_model(self):
        from mistralai.client import MistralClient
        from transformers import AutoTokenizer
        from mistralai.models.chat_completion import ChatMessage
        self.ChatMessage = ChatMessage
        api_key = get_key("MISTRAL_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for Mistral")
            print("Missing 'MISTRAL_API_KEY' variable in:", f"{os.getcwd()}/.env")
        self.client = MistralClient(api_key=api_key)
        self.encoder = AutoTokenizer.from_pretrained(encoders[self.name])

    def chat(self, messages):
        instances = [self.ChatMessage(content=message["content"], role=message["role"]) for message in messages]
        response = self.client.chat(
            model=self.name,
            messages=instances
        )
        return response.choices[0].message.content