# Usage: python embed-openai.py <dataset_name> <text_column>
import os
import json
import time
import tiktoken
import argparse
import numpy as np
import pandas as pd
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModel

load_dotenv()

enc = tiktoken.encoding_for_model("text-embedding-ada-002")

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def embedder(dataset_name, text_column="text"):
    model_name = "OpenAI/text-embedding-ada-002"

    df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
    # Sentences we want sentence embeddings for
    sentences = df[text_column].tolist()
    print("embedding", len(sentences), "sentences")

    batch_size = 100
    sentence_embeddings = []


    # openai.api_key = os.getenv("OPENAI_API_KEY")
    rate_limit = 400  # number of requests per minute
    start_time = time.time()
    request_count = 0
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    for batch in tqdm(chunked_iterable(sentences, batch_size),  total=len(sentences)//batch_size):
        # Ensure the text b doesn't exceed the token length of 8192 tokens
        inputs = [b.replace("\n", " ") for b in batch]
        inputs = [enc.decode(enc.encode(b)[:8192]) if len(enc.encode(b)) > 8192 else b for b in batch]

        response = client.embeddings.create(
            input=inputs,
            model="text-embedding-ada-002",
        )
        embeddings = [embedding.embedding for embedding in response.data]
        sentence_embeddings.extend(embeddings)

        # Rate limit the requests
        request_count += 1
        if request_count >= rate_limit:
            elapsed_time = time.time() - start_time
            if elapsed_time < 60:
                time.sleep(60 - elapsed_time)
            start_time = time.time()
            request_count = 0

    print("sentence embeddings:", len(sentence_embeddings))
    # Convert sentence_embeddings to numpy
    np_embeds = np.array(sentence_embeddings)
    print("sentence embeddings:", np_embeds.shape)


    # Save embeddings as a numpy file
    if not os.path.exists(f'../data/{dataset_name}/embeddings'):
        os.makedirs(f'../data/{dataset_name}/embeddings')

    # TODO: make the sanitization a function
    safe_model_name = model_name.replace("/", "___")
    np.save(f'../data/{dataset_name}/embeddings/{safe_model_name}.npy', np_embeds)
    # write out a json file with the model name and shape of the embeddings
    # with open(f'../data/{dataset_name}/meta.json', 'w') as f:
    #     json.dump({
    #         "id": dataset_name,
    #         "text_column": text_column, 
    #         "length": len(sentences),
    #         }, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Embed a dataset using OpenAI')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')

    # Parse arguments
    args = parser.parse_args()

    embedder(args.name, args.text_column)
