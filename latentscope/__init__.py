from .__version__ import __version__
from . import models

from .util import (
    update_data_dir,
    get_data_dir,
    set_api_key,
    set_openai_key,
    set_voyage_key,
    set_together_key,
    set_cohere_key,
    set_mistral_key,
)


# ---------------------------------------------------------------------------
# Heavy script imports are deferred so that importing `latentscope` (e.g. to
# start the server or use configuration utilities) does not require ML
# dependencies like tqdm, umap-learn, hdbscan, etc. to be installed.
# ---------------------------------------------------------------------------

def ingest(*args, **kwargs):
    from .scripts.ingest import ingest as _ingest
    return _ingest(*args, **kwargs)


def embed(*args, **kwargs):
    from .scripts.embed import embed as _embed
    return _embed(*args, **kwargs)


def import_embeddings(*args, **kwargs):
    from .scripts.embed import import_embeddings as _import_embeddings
    return _import_embeddings(*args, **kwargs)


def umap(*args, **kwargs):
    from .scripts.umapper import umapper as _umap
    return _umap(*args, **kwargs)


def cluster(*args, **kwargs):
    from .scripts.cluster import clusterer as _cluster
    return _cluster(*args, **kwargs)


def label(*args, **kwargs):
    from .scripts.label_clusters import labeler as _label
    return _label(*args, **kwargs)


def scope(*args, **kwargs):
    from .scripts.scope import scope as _scope
    return _scope(*args, **kwargs)


def serve(*args, **kwargs):
    from .server import serve as _serve
    return _serve(*args, **kwargs)


def init(data_dir, env_file=".env", **kwargs):
    """Initialise the data directory and optionally set API keys.

    This is the recommended entry point for programmatic (library) use:

        import latentscope as ls
        ls.init("~/my-data", openai_key="sk-...")
    """
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
            setter(kwargs[key], env_file=env_file)
    print("Initialized env with data directory at", data_dir)


def main():
    """CLI entry point for ``ls-init``."""
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
    init(
        args.data_dir,
        args.env_file,
        **{k: v for k, v in vars(args).items() if k not in ('data_dir', 'env_file') and v is not None},
    )


def list_models():
    """CLI entry point for ``ls-list-models``."""
    ml = models.get_embedding_model_list()
    print("=== Embedding Models ===")
    for m in ml:
        print(m["id"])
    print()
    print("=== Summarization (Chat) Models ===")
    ml = models.get_chat_model_list()
    for m in ml:
        print(m["id"])
