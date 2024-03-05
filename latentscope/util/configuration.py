import os
import sys
from dotenv import load_dotenv, set_key

def get_data_dir():
    print("Loading environment variables from:", os.path.join(os.getcwd(), '.env'))
    load_dotenv()
    DATA_DIR = os.getenv('LATENT_SCOPE_DATA')
    if DATA_DIR is None:
        print("""LATENT_SCOPE_DATA environment variable not set. Please set it to the directory where you want to store your data.
e.g.: export LATENT_SCOPE_DATA=~/latentscope-data""")
        sys.exit(1)
    return DATA_DIR

def update_data_dir(directory, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    if not directory or directory == "":
        directory = os.getenv('LATENT_SCOPE_DATA')
        if not directory:
            print("ERROR: Please specify a directory")
            return
        else:
            print("No directory specified, current directory is:", directory)
    if "~" in directory:
        directory = os.path.expanduser(directory)
    # Update the .env file with the new directory
    set_key(env_file, 'LATENT_SCOPE_DATA', directory)
    # Update the environment variable for the current process
    os.environ['LATENT_SCOPE_DATA'] = directory
    if not os.path.exists(directory):
        os.makedirs(directory)
    return directory

def get_key(key, env_file=".env"):
    print("get key", os.getcwd())
    load_dotenv(env_file)
    return os.getenv(key)

def get_supported_api_keys():
    return [
        "OPENAI_API_KEY",
        "VOYAGE_API_KEY",
        "TOGETHER_API_KEY",
        "COHERE_API_KEY",
        "MISTRAL_API_KEY"
    ]

def set_openai_key(openai_key, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    # Update the .env file with the new directory
    set_key(env_file, 'OPENAI_API_KEY', openai_key)
    # Update the environment variable for the current process
    os.environ['OPENAI_API_KEY'] = openai_key

def set_voyage_key(voyage_key, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    # Update the .env file with the new directory
    set_key(env_file, 'VOYAGE_API_KEY', voyage_key)
    # Update the environment variable for the current process
    os.environ['VOYAGE_API_KEY'] = voyage_key

def set_together_key(together_key, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    # Update the .env file with the new directory
    set_key(env_file, 'TOGETHER_API_KEY', together_key)
    # Update the environment variable for the current process
    os.environ['TOGETHER_API_KEY'] = together_key

def set_cohere_key(cohere_key, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    # Update the .env file with the new directory
    set_key(env_file, 'COHERE_API_KEY', cohere_key)
    # Update the environment variable for the current process
    os.environ['COHERE_API_KEY'] = cohere_key

def set_mistral_key(mistral_key, env_file=".env"):
    # Load existing .env file, or create one if it doesn't exist
    load_dotenv(env_file)
    # Update the .env file with the new directory
    set_key(env_file, 'MISTRAL_API_KEY', mistral_key)
    # Update the environment variable for the current process
    os.environ['MISTRAL_API_KEY'] = mistral_key