# Usage: python embed-openai.py <dataset_name> <text_column>
import os
import json
import time
import argparse
import voyageai
import numpy as np
import pandas as pd
from tqdm import tqdm
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModel

load_dotenv()

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]


def embedder(dataset_name, text_column="text", model_name="voyage-02"):
    # TODO: have lookup table for truncate lengths

    df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
    # Sentences we want sentence embeddings for
    sentences = df[text_column].tolist()
    print("embedding", len(sentences), "sentences")

    batch_size = 100
    sentence_embeddings = []

    rate_limit = 60  # number of requests per minute
    start_time = time.time()
    request_count = 0
    voyageai.api_key = os.getenv("VOYAGE_API_KEY")
    client = voyageai.Client()

    for batch in tqdm(chunked_iterable(sentences, batch_size),  total=len(sentences)//batch_size):
        # inputs = [b.replace("\n", " ") for b in batch]
        response = client.embed(batch, model=model_name, truncation=True)
        embeddings = response.embeddings
        sentence_embeddings.extend(embeddings)

        time.sleep(0.1)
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
    safe_model_name = "voyageai-" + model_name.replace("/", "___")
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
    parser.add_argument('model', type=str, help='Name of Transformer Embedding model to use', default="voyage-02")

    # Parse arguments
    args = parser.parse_args()

    embedder(args.name, args.text_column, args.model)
