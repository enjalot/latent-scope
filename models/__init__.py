import os
import json
from .providers.transformers import TransformersEmbedProvider, TransformersChatProvider
from .providers.openai import OpenAIEmbedProvider, OpenAIChatProvider
from .providers.cohereai import CohereAIEmbedProvider
from .providers.togetherai import TogetherAIEmbedProvider
from .providers.voyageai import VoyageAIEmbedProvider


embed_models_path = os.path.join(os.path.dirname(__file__), "embedding_models.json")
with open(embed_models_path, "r") as f:
    embed_model_list = json.load(f)
embed_model_dict = {model['id']: model for model in embed_model_list}

def get_embedding_model(id):
    """Returns a ModelProvider instance for the given model id."""
    model = embed_model_dict[id]
    if not model:
        raise ValueError(f"Model {id} not found")
      
    if model['provider'] == "transformers":
        return TransformersEmbedProvider(model['name'], model['params'])
    if model['provider'] == "openai":
        return OpenAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "cohereai":
        return CohereAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "togetherai":
        return TogetherAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "voyageai":
        return VoyageAIEmbedProvider(model['name'], model['params'])
  
chat_models_path = os.path.join(os.path.dirname(__file__), "chat_models.json")
with open(chat_models_path, "r") as f:
    chat_model_list = json.load(f)
chat_model_dict = {model['id']: model for model in chat_model_list}

def get_chat_model(id):
    """Returns a ModelProvider instance for the given model id."""
    model = chat_model_dict[id]
    if model['provider'] == "transformers":
        return TransformersChatProvider(model['name'], model['params'])
    if model['provider'] == "openai":
        return OpenAIChatProvider(model['name'], model['params'])
