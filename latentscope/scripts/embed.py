# Usage: ls-embed <dataset_id> <text_column> <embedding_id>
import os
import json
import argparse
import numpy as np
import pandas as pd
from tqdm import tqdm

from latentscope.models import get_embedding_model
from latentscope.util import get_data_dir

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def main():
    parser = argparse.ArgumentParser(description='Embed a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('embedding_id', type=str, help='ID of embedding model to use', default="transformers-BAAI___bge-small-en-v1.5")
    parser.add_argument('prefix', type=str, help='Prefix to prepend to text before embedding', default="")

    # Parse arguments
    args = parser.parse_args()
    embed(args.dataset_id, args.text_column, args.embedding_id, args.prefix)

def embed(dataset_id, text_column, embedding_id, prefix):
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))
    sentences = df[text_column].tolist()
    prefixed = []
    if prefix is None:
        prefix = ""
    for i,s in enumerate(sentences):
        if s is None:
            print(i,s)
            s = ""
        prefixed.append(prefix + s)
    sentences = prefixed #[prefix + s for s in sentences]

    model = get_embedding_model(embedding_id)
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
    emb_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    if not os.path.exists(emb_dir):
        os.makedirs(emb_dir)

    directory = os.path.join(DATA_DIR, dataset_id, "embeddings")
    with open(os.path.join(directory, f"{embedding_id}.json"), 'w') as f:
        json.dump({
            "id": embedding_id,
            "dataset_id": dataset_id,
            "text_column": text_column,
            "dimensions": np_embeds.shape[1],
            "prefix": prefix,
            }, f, indent=2)


    np.save(os.path.join(directory, f"{embedding_id}.npy"), np_embeds)
    print("done")

if __name__ == "__main__":
   main() 