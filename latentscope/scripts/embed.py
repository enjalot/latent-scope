# Usage: python embed-local.py <dataset_name> <text_column> <model>
import os
import sys
import argparse
import numpy as np
import pandas as pd
from tqdm import tqdm

# TODO is this hacky way to import from the models directory?
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models import get_embedding_model

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def embedder(dataset_name, text_column="text", model_id="transformers-BAAI___bge-small-en-v1.5"):
    df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
    sentences = df[text_column].tolist()

    model = get_embedding_model(model_id)
    print("loading", model.name)
    model.load_model()

    batch_size = 100
    sentence_embeddings = []

    print("embedding", len(sentences), "sentences")
    for batch in tqdm(chunked_iterable(sentences, batch_size),  total=len(sentences)//batch_size):
        embeddings = model.embed(batch)
        sentence_embeddings.extend(embeddings)

    # Convert sentence_embeddings to numpy
    np_embeds = np.array(sentence_embeddings)
    print("sentence embeddings:", np_embeds.shape)

    # Save embeddings as a numpy file
    if not os.path.exists(f'../data/{dataset_name}/embeddings'):
        os.makedirs(f'../data/{dataset_name}/embeddings')

    np.save(f'../data/{dataset_name}/embeddings/{model_id}.npy', np_embeds)
    print("done")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Embed a dataset')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model', type=str, help='ID of embedding model to use', default="transformers-BAAI___bge-small-en-v1.5")

    # Parse arguments
    args = parser.parse_args()

    embedder(args.name, args.text_column, args.model)
