import json
from .providers.transformers import TransformersEmbedProvider, TransformersChatProvider
from .providers.openai import OpenAIEmbedProvider, OpenAIChatProvider
from .providers.mistralai import MistralAIEmbedProvider, MistralAIChatProvider
from .providers.cohereai import CohereAIEmbedProvider
from .providers.togetherai import TogetherAIEmbedProvider
from .providers.voyageai import VoyageAIEmbedProvider
from .providers.nltk import NLTKChatProvider

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
    model = get_embedding_model_dict(id)
      
    if model['provider'] == "transformers":
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

