import json
from .providers.transformers import TransformersEmbedProvider, TransformersChatProvider
from .providers.openai import OpenAIEmbedProvider, OpenAIChatProvider
from .providers.mistralai import MistralAIEmbedProvider, MistralAIChatProvider
from .providers.cohereai import CohereAIEmbedProvider
from .providers.togetherai import TogetherAIEmbedProvider
from .providers.voyageai import VoyageAIEmbedProvider
from .providers.nltk import NLTKChatProvider

# Universal model ID scheme:
#   <provider>-<model-name>  where "/" in the model name is replaced by "___"
#
# Examples:
#   "nomic-ai/nomic-embed-text-v1.5"  →  "huggingface-nomic-ai___nomic-embed-text-v1.5"
#   "text-embedding-3-small"          →  "openai-text-embedding-3-small"
#
# The legacy prefix "🤗-" is still accepted for backward compatibility.

_HF_PROVIDER = "huggingface"
_HF_PREFIX = f"{_HF_PROVIDER}-"
# Legacy emoji prefix kept for backward compat when parsing existing IDs
_HF_EMOJI_PREFIX = "🤗-"
# setup.py / transformers provider used the old prefix "transformers-"
_HF_OLD_PREFIX = "transformers-"


def _parse_hf_model_id(model_id):
    """Return the HuggingFace model name from a model_id, or None if not HF."""
    for prefix in (_HF_PREFIX, _HF_EMOJI_PREFIX, _HF_OLD_PREFIX):
        if model_id.startswith(prefix):
            return model_id[len(prefix):].replace("___", "/")
    return None


def get_embedding_model_list():
    """Return the list of available embedding models."""
    from importlib.resources import files
    embedding_path = files('latentscope.models').joinpath('embedding_models.json')
    with open(embedding_path, "r") as f:
        return json.load(f)


def get_embedding_model_dict(model_id):
    embed_model_list = get_embedding_model_list()
    embed_model_dict = {model['id']: model for model in embed_model_list}
    model = embed_model_dict.get(model_id)
    if not model:
        raise ValueError(f"Embedding model '{model_id}' not found")
    return model


def get_embedding_model(model_id):
    """Return a ModelProvider instance for the given embedding model id."""
    hf_name = _parse_hf_model_id(model_id)
    if hf_name:
        model = {"provider": _HF_PROVIDER, "name": hf_name, "params": {}}
    elif model_id.startswith("custom_embedding-"):
        import os
        from latentscope.util import get_data_dir
        data_dir = get_data_dir()
        custom_models_path = os.path.join(data_dir, "custom_embedding_models.json")
        if os.path.exists(custom_models_path):
            with open(custom_models_path, "r") as f:
                custom_models = json.load(f)
            model = next((m for m in custom_models if m["id"] == model_id), None)
            if model is None:
                raise ValueError(
                    f"Custom embedding model '{model_id}' not found in custom_embedding_models.json"
                )
        else:
            raise ValueError("No custom_embedding_models.json found in data directory")
        # Route directly — custom embedding models always use OpenAI-compatible API
        return OpenAIEmbedProvider(
            model['name'], model.get('params', {}), base_url=model['base_url']
        )
    else:
        model = get_embedding_model_dict(model_id)

    provider = model['provider']
    # Accept both "huggingface" and legacy "🤗"
    if provider in (_HF_PROVIDER, "🤗"):
        return TransformersEmbedProvider(model['name'], model['params'])
    if provider == "openai":
        return OpenAIEmbedProvider(model['name'], model['params'])
    if provider == "mistralai":
        return MistralAIEmbedProvider(model['name'], model['params'])
    if provider == "cohereai":
        return CohereAIEmbedProvider(model['name'], model['params'])
    if provider == "togetherai":
        return TogetherAIEmbedProvider(model['name'], model['params'])
    if provider == "voyageai":
        return VoyageAIEmbedProvider(model['name'], model['params'])
    if provider == "custom_embedding":
        return OpenAIEmbedProvider(model['name'], model['params'], base_url=model['url'])
    raise ValueError(f"Unknown embedding provider '{provider}' for model '{model_id}'")


def get_chat_model_list():
    """Return the list of available chat models."""
    from importlib.resources import files
    chat_path = files('latentscope.models').joinpath('chat_models.json')
    with open(chat_path, "r") as f:
        return json.load(f)


def get_chat_model_dict(model_id):
    chat_model_list = get_chat_model_list()
    chat_model_dict = {model['id']: model for model in chat_model_list}
    model = chat_model_dict.get(model_id)
    if not model:
        raise ValueError(f"Chat model '{model_id}' not found")
    return model


def get_chat_model(model_id):
    """Return a ModelProvider instance for the given chat model id."""
    hf_name = _parse_hf_model_id(model_id)
    if hf_name:
        model = {"provider": _HF_PROVIDER, "name": hf_name, "params": {}}
    elif model_id.startswith("custom-"):
        import os
        from latentscope.util import get_data_dir
        data_dir = get_data_dir()
        custom_models_path = os.path.join(data_dir, "custom_models.json")
        if os.path.exists(custom_models_path):
            with open(custom_models_path, "r") as f:
                custom_models = json.load(f)
            model = next((m for m in custom_models if m["id"] == model_id), None)
            if model is None:
                raise ValueError(f"Custom model '{model_id}' not found in custom_models.json")
        else:
            raise ValueError("No custom_models.json found in data directory")
    elif model_id.startswith("ollama-"):
        model = {
            "provider": "ollama",
            "name": model_id[len("ollama-"):],
            "url": "http://localhost:11434/v1",
            "params": {},
        }
    else:
        model = get_chat_model_dict(model_id)

    provider = model['provider']
    # Accept both "huggingface" and legacy "🤗"
    if provider in (_HF_PROVIDER, "🤗"):
        return TransformersChatProvider(model['name'], model['params'])
    if provider == "openai":
        return OpenAIChatProvider(model['name'], model['params'])
    if provider == "custom":
        return OpenAIChatProvider(model['name'], model['params'], base_url=model['url'])
    if provider == "ollama":
        return OpenAIChatProvider(model['name'], model['params'], base_url=model['url'])
    if provider == "mistralai":
        return MistralAIChatProvider(model['name'], model['params'])
    if provider == "nltk":
        return NLTKChatProvider(model['name'], model['params'])
    raise ValueError(f"Unknown chat provider '{provider}' for model '{model_id}'")
