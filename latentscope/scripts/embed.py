# Usage: ls-embed <dataset_name> <text_column> <model>
import os
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
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model', type=str, help='ID of embedding model to use', default="transformers-BAAI___bge-small-en-v1.5")

    # Parse arguments
    args = parser.parse_args()
    embed(args.name, args.text_column, args.model)

def embed(dataset_name, text_column, model_id):
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_name, "input.parquet"))
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
    emb_dir = os.path.join(DATA_DIR, dataset_name, "embeddings")
    if not os.path.exists(emb_dir):
        os.makedirs(emb_dir)

    np.save(os.path.join(DATA_DIR, dataset_name, "embeddings", f"{model_id}.npy"), np_embeds)
    print("done")

if __name__ == "__main__":
   main() 