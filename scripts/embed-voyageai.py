# Usage: python embed-openai.py <dataset_name> <text_column>
import os
import sys
import time
import argparse
import numpy as np
import pandas as pd
from tqdm import tqdm
from dotenv import load_dotenv

# TODO is this hacky way to import from the models directory?
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models import get_model


load_dotenv()

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]


def embedder(dataset_name, text_column="text", model_id="voyageai-voyage-02"):
    # TODO: have lookup table for truncate lengths

    df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
    # Sentences we want sentence embeddings for
    sentences = df[text_column].tolist()
    print("embedding", len(sentences), "sentences")

    batch_size = 100
    sentence_embeddings = []

    model = get_model(model_id)
    model.load_model()

    for batch in tqdm(chunked_iterable(sentences, batch_size),  total=len(sentences)//batch_size):
        embeddings = model.embed(batch)
        sentence_embeddings.extend(embeddings)

        time.sleep(0.1)

    print("sentence embeddings:", len(sentence_embeddings))
    # Convert sentence_embeddings to numpy
    np_embeds = np.array(sentence_embeddings)
    print("sentence embeddings:", np_embeds.shape)

    # Save embeddings as a numpy file
    if not os.path.exists(f'../data/{dataset_name}/embeddings'):
        os.makedirs(f'../data/{dataset_name}/embeddings')

    np.save(f'../data/{dataset_name}/embeddings/{model_id}.npy', np_embeds)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Embed a dataset using OpenAI')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model', type=str, help='Name of Transformer Embedding model to use', default="voyage-02")

    # Parse arguments
    args = parser.parse_args()

    embedder(args.name, args.text_column, args.model)
