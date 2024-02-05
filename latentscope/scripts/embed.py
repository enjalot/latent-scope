# Usage: ls-embed <dataset_id> <text_column> <model_id>
import os
import re
import sys
import json
import time
import h5py
import argparse
import numpy as np
import pandas as pd
try:
    # Check if the runtime environment is a Jupyter notebook
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError as e:
    # Fallback to the standard console version if import fails
    from tqdm import tqdm

from latentscope.models import get_embedding_model
from latentscope.util import get_data_dir

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def append_to_hdf5(file_path, new_data):
    dataset_name = "embeddings"
    with h5py.File(file_path, 'a') as f:
        if dataset_name in f:
            dataset = f[dataset_name]
            dataset.resize((dataset.shape[0] + new_data.shape[0],) + dataset.shape[1:])
            dataset[-new_data.shape[0]:] = new_data
        else:
            maxshape = (None,) + new_data.shape[1:]
            dataset = f.create_dataset(dataset_name, data=new_data, maxshape=maxshape, chunks=True)

def get_last_batch(file_path):
    with h5py.File(file_path, 'r') as f:
        dataset = f["embeddings"]
        return dataset.shape[0]


def main():
    parser = argparse.ArgumentParser(description='Embed a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model_id', type=str, help='ID of embedding model to use', default="transformers-BAAI___bge-small-en-v1.5")
    parser.add_argument('prefix', type=str, help='Prefix to prepend to text before embedding', default="")
    parser.add_argument('--rerun', type=str, help='Rerun the given embedding from last completed batch')

    # Parse arguments
    args = parser.parse_args()
    embed(args.dataset_id, args.text_column, args.model_id, args.prefix, args.rerun)

def embed(dataset_id, text_column, model_id, prefix, rerun):
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

    # determine the embedding id
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    if not os.path.exists(embedding_dir):
        os.makedirs(embedding_dir)

    batch_size = 100
    # sentence_embeddings = []
    total_batches = len(sentences)//batch_size

    if rerun is not None:
        embedding_id = rerun
        starting_batch = get_last_batch(os.path.join(embedding_dir, f"{embedding_id}.h5")) // batch_size
    else:
        # determine the index of the last umap run by looking in the dataset directory
        # for files named umap-<number>.json
        embedding_files = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.h5", f)]
        if len(embedding_files) > 0:
            last_umap = sorted(embedding_files)[-1]
            last_embedding_number = int(last_umap.split("-")[1].split(".")[0])
            next_embedding_number = last_embedding_number + 1
        else:
            next_embedding_number = 1
        # make the umap name from the number, zero padded to 3 digits
        embedding_id = f"embedding-{next_embedding_number:03d}"
        starting_batch = 0

    print("RUNNING:", embedding_id)
    model = get_embedding_model(model_id)
    print("loading", model.name)
    model.load_model()

    print("embedding", len(sentences), "sentences", "in", total_batches, "batches")
    if starting_batch > 0:
        print("Rerunning starting at batch", starting_batch)

    for i, batch in enumerate(tqdm(chunked_iterable(sentences, batch_size), total=total_batches)):
        if i < starting_batch:
            print(f"skipping batch {i}/{total_batches}")
            continue
        try:
            embeddings = np.array(model.embed(batch))
            append_to_hdf5(os.path.join(embedding_dir, f"{embedding_id}.h5"), embeddings)
        except Exception as e:
            print(batch)
            print("error embedding batch", i, e)
            print("exiting prematurely", embedding_id)
            sys.exit(1)
        # sentence_embeddings.extend(embeddings)

    # Convert sentence_embeddings to numpy
    # np_embeds = np.array(sentence_embeddings)
    # print("sentence embeddings:", np_embeds.shape)

    # Save embeddings as a numpy file
    with open(os.path.join(embedding_dir, f"{embedding_id}.json"), 'w') as f:
        json.dump({
            "id": embedding_id,
            "model_id": model_id,
            "dataset_id": dataset_id,
            "text_column": text_column,
            # "dimensions": np_embeds.shape[1],
            "dimensions": embeddings.shape[1],
            "prefix": prefix,
            }, f, indent=2)


    # np.save(os.path.join(embedding_dir, f"{embedding_id}.npy"), np_embeds)
    print("done with", embedding_id)

if __name__ == "__main__":
   main() 