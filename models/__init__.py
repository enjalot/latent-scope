import os
import json
from .providers.transformers import TransformersProvider
from .providers.openai import OpenAIProvider
from .providers.cohereai import CohereAIProvider

models_path = os.path.join(os.path.dirname(__file__), "models.json")
with open(models_path, "r") as f:
    models = json.load(f)

model_dict = {model['id']: model for model in models}


def get_model(id):
    """Returns a ModelProvider instance for the given model id."""
    model = model_dict[id]
    if not model:
        raise ValueError(f"Model {id} not found")
      
    if model['provider'] == "transformers":
        return TransformersProvider(model['name'], model['params'])
    if model['provider'] == "openai":
        return OpenAIProvider(model['name'], model['params'])
    if model['provider'] == "cohereai":
        return CohereAIProvider(model['name'], model['params'])