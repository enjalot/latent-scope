import json
from .providers.transformers import TransformersEmbedProvider, TransformersChatProvider
from .providers.openai import OpenAIEmbedProvider, OpenAIChatProvider
from .providers.mistralai import MistralAIEmbedProvider, MistralAIChatProvider
from .providers.cohereai import CohereAIEmbedProvider
from .providers.togetherai import TogetherAIEmbedProvider
from .providers.voyageai import VoyageAIEmbedProvider
from .providers.ollama import OllamaEmbedProvider, OllamaChatProvider
from .providers.nltk import NLTKChatProvider

# We use a universal id system for models where its:
# <provider>-<model-name> with model-name replacing "/"" with "___"
# i.e. "nomic-ai/nomic-embed-text-v1.5" becomes: 
# "transformers-nomic-ai___nomic-embed-text-v1.5"
# or OpenAI's "text-embedding-3-small" becomes:
# "openai-text-embedding-3-small"

def get_embedding_model_list():
    """Returns a list of available embedding models."""
    from importlib.resources import files
    embedding_path = files('latentscope.models').joinpath('embedding_models.json')
    with open(embedding_path, "r") as f:
        embed_model_list = json.load(f)
    return embed_model_list

def get_embedding_model_dict(id):
    embed_model_list = get_embedding_model_list()
    embed_model_dict = {model['id']: model for model in embed_model_list}
    model = embed_model_dict[id]
    if not model:
        raise ValueError(f"Model {id} not found")
    return model

def get_embedding_model(id):
    """Returns a ModelProvider instance for the given model id."""

    # For backwards compatibility with the old preset transformers models 
    # (all of which were also HF sentence transformers)
    if id.startswith("transformers-"):
        id = id.replace("transformers-", "🤗-")
    if id.startswith("🤗-"):
        # If the model id is a HF sentence transformers model, we get the model id
        # by replacing "/" with "___"
        # Then huggingface will take care of finding the model
        model_name = id.split("🤗-")[1].replace("___", "/")
        model = {
            "provider": "🤗",
            "name": model_name,
            "params": {}
        }
    else:
        model = get_embedding_model_dict(id)
      
    if model['provider'] == "🤗":
        return TransformersEmbedProvider(model['name'], model['params'])
    if model['provider'] == "openai":
        return OpenAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "mistralai":
        return MistralAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "cohereai":
        return CohereAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "togetherai":
        return TogetherAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "voyageai":
        return VoyageAIEmbedProvider(model['name'], model['params'])
    if model['provider'] == "ollama":
        return OllamaEmbedProvider(model['name'], model['params'])


def get_chat_model_list():
    """Returns a list of available chat models."""
    from importlib.resources import files
    chat_path = files('latentscope.models').joinpath('chat_models.json')
    with open(chat_path, "r") as f:
        chat_model_list = json.load(f)
    return chat_model_list

def get_chat_model_dict(id):
    chat_model_list = get_chat_model_list()
    chat_model_dict = {model['id']: model for model in chat_model_list}
    model = chat_model_dict[id]
    if not model:
        raise ValueError(f"Model {id} not found")
    return model

def get_chat_model(id):
    """Returns a ModelProvider instance for the given model id."""
    model = get_chat_model_dict(id)
    
    if model['provider'] == "transformers":
        return TransformersChatProvider(model['name'], model['params'])
    if model['provider'] == "openai":
        return OpenAIChatProvider(model['name'], model['params'])
    if model['provider'] == "mistralai":
        return MistralAIChatProvider(model['name'], model['params'])
    if model['provider'] == "nltk":
        return NLTKChatProvider(model['name'], model['params'])
    if model['provider'] == "ollama":
        return OllamaChatProvider(model['name'], model['params'])
    

