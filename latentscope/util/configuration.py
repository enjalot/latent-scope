import os
import warnings

from dotenv import load_dotenv, set_key

_SUPPORTED_API_KEYS = [
    "OPENAI_API_KEY",
    "VOYAGE_API_KEY",
    "TOGETHER_API_KEY",
    "COHERE_API_KEY",
    "MISTRAL_API_KEY",
    "HUGGINGFACE_TOKEN",
]


def _dotenv_disabled():
    """Return True when the user has opted out of dotenv loading.

    Set the environment variable ``LATENT_SCOPE_NO_DOTENV=1`` to skip all
    ``load_dotenv()`` calls.  This is useful in read-only environments
    (e.g. Docker containers) where writing or reading a ``.env`` file is
    undesirable or impossible.
    """
    return os.environ.get("LATENT_SCOPE_NO_DOTENV", "") == "1"


def _load_dotenv(*args, **kwargs):
    """Wrapper around ``load_dotenv`` that respects the opt-out flag."""
    if _dotenv_disabled():
        return
    load_dotenv(*args, **kwargs)


def _safe_set_key(env_file, key, value):
    """Write *key=value* to *env_file*, swallowing errors on read-only filesystems."""
    try:
        set_key(env_file, key, value)
    except OSError as exc:
        warnings.warn(
            f"Could not write to {env_file}: {exc}. "
            "The value has been set in the current process environment but "
            "will not persist across restarts.",
            stacklevel=3,
        )


def get_data_dir():
    """Return the data directory from the LATENT_SCOPE_DATA environment variable.

    Raises RuntimeError if the variable is not set, so callers (including
    library users) get a proper exception rather than a hard sys.exit().
    """
    _load_dotenv()
    data_dir = os.getenv('LATENT_SCOPE_DATA')
    if data_dir is None:
        raise RuntimeError(
            "LATENT_SCOPE_DATA environment variable is not set. "
            "Set it to your data directory, e.g.:\n"
            "  export LATENT_SCOPE_DATA=~/latentscope-data\n"
            "or call latentscope.init('/path/to/data') before using the library."
        )
    return data_dir


def update_data_dir(directory, env_file=".env"):
    """Create or update the data directory setting in the env file."""
    _load_dotenv(env_file)
    if not directory or directory == "":
        directory = os.getenv('LATENT_SCOPE_DATA')
        if not directory:
            raise ValueError("Please specify a data directory.")
        else:
            print("No directory specified, current directory is:", directory)
    if "~" in directory:
        directory = os.path.expanduser(directory)
    if directory.startswith("./") or directory.startswith("../") or not directory.startswith("/"):
        directory = os.path.abspath(directory)
    _safe_set_key(env_file, 'LATENT_SCOPE_DATA', directory)
    os.environ['LATENT_SCOPE_DATA'] = directory
    if not os.path.exists(directory):
        os.makedirs(directory)
    return directory


def get_key(key, env_file=".env"):
    """Retrieve any environment variable, loading from env_file first."""
    _load_dotenv(env_file)
    return os.getenv(key)


def get_supported_api_keys():
    """Return the list of API key names supported by latent-scope."""
    return list(_SUPPORTED_API_KEYS)


def set_api_key(key_name, value, env_file=".env"):
    """Set an API key in the env file and the current process environment.

    Args:
        key_name: The environment variable name (e.g. 'OPENAI_API_KEY').
        value: The key value to store.
        env_file: Path to the .env file to update (default: '.env').

    Raises:
        ValueError: If key_name is not a recognised API key.
    """
    if key_name not in _SUPPORTED_API_KEYS:
        raise ValueError(
            f"Unknown API key '{key_name}'. Supported keys: {_SUPPORTED_API_KEYS}"
        )
    _load_dotenv(env_file)
    _safe_set_key(env_file, key_name, value)
    os.environ[key_name] = value


# ---------------------------------------------------------------------------
# Backward-compatible per-provider helpers (thin wrappers around set_api_key)
# ---------------------------------------------------------------------------

def set_openai_key(openai_key, env_file=".env"):
    set_api_key("OPENAI_API_KEY", openai_key, env_file)

def set_voyage_key(voyage_key, env_file=".env"):
    set_api_key("VOYAGE_API_KEY", voyage_key, env_file)

def set_together_key(together_key, env_file=".env"):
    set_api_key("TOGETHER_API_KEY", together_key, env_file)

def set_cohere_key(cohere_key, env_file=".env"):
    set_api_key("COHERE_API_KEY", cohere_key, env_file)

def set_mistral_key(mistral_key, env_file=".env"):
    set_api_key("MISTRAL_API_KEY", mistral_key, env_file)
