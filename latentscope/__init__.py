from .__version__ import __version__
from . import models
from .scripts.ingest import ingest
from .scripts.embed import embed
from .scripts.embed import import_embeddings
from .scripts.umapper import umapper as umap
from .scripts.cluster import clusterer as cluster
from .scripts.label_clusters import labeler as label
from .scripts.scope import scope

from .server import serve

from .util import update_data_dir, get_data_dir, set_openai_key, set_voyage_key, set_together_key, set_cohere_key, set_mistral_key

def init(data_dir, env_file=".env", **kwargs):
  data_dir = update_data_dir(data_dir, env_file=env_file)
  setters = {
      'openai_key': set_openai_key,
      'voyage_key': set_voyage_key,
      'together_key': set_together_key,
      'cohere_key': set_cohere_key,
      'mistral_key': set_mistral_key,
  }
  for key, setter in setters.items():
      if key in kwargs:
          setter(kwargs[key])
  print("Initialized env with data directory at", data_dir)

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Initialize a data directory')
    parser.add_argument('data_dir', type=str, help='Directory to store data')
    parser.add_argument('--env_file', type=str, help='Path to .env file', default=".env")
    parser.add_argument('--openai_key', type=str, help='OpenAI API key')
    parser.add_argument('--voyage_key', type=str, help='Voyage API key')
    parser.add_argument('--together_key', type=str, help='Together API key')
    parser.add_argument('--cohere_key', type=str, help='Cohere API key')
    parser.add_argument('--mistral_key', type=str, help='Mistral API key')

    args = parser.parse_args()
    init(args.data_dir, args.env_file)

def list_models():
    ml = models.get_embedding_model_list()
    print("=== Embedding Models ===")
    for m in ml:
        # TODO: pretty print the relevant model info
        print(m["id"])
    print("\n")
    print("=== Summarization (Chat) Models ===")
    ml = models.get_chat_model_list()
    for m in ml:
        print(m["id"])