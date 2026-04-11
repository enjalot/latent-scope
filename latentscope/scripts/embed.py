# Usage: ls-embed <dataset_id> <text_column> <model_id>
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

try:
    # Check if the runtime environment is a Jupyter notebook
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError:
    # Fallback to the standard console version if import fails
    from tqdm import tqdm

from latentscope.models import TransformersEmbedProvider, get_embedding_model
from latentscope.util import get_data_dir


def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

# Legacy HDF5 functions kept for backward compatibility
def append_to_hdf5(file_path, new_data):
    import h5py
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
    import h5py
    try:
        with h5py.File(file_path, 'r') as f:
            dataset = f["embeddings"]
            return dataset.shape[0]
    except FileNotFoundError:
        return 0


def main():
    parser = argparse.ArgumentParser(description='Embed a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model_id', type=str, help='ID of embedding model to use', default="transformers-BAAI___bge-small-en-v1.5")
    parser.add_argument('--prefix', type=str, help='Prefix to prepend to text before embedding', default="")
    parser.add_argument('--dimensions', type=int, help='Truncate embeddings to dimensions a la Matroyshka embeddings')
    parser.add_argument('--rerun', type=str, help='Rerun the given embedding from last completed batch')
    parser.add_argument('--batch_size', type=int, help='Set the batch size (number of sentences to embed in one call)', default=100)
    parser.add_argument('--max_seq_length', type=int, help='Set the max sequence length for the model', default=None)

    # Parse arguments
    args = parser.parse_args()
    embed(args.dataset_id, args.text_column, args.model_id, args.prefix, args.rerun, args.dimensions, args.batch_size, args.max_seq_length)

def embed(dataset_id, text_column, model_id, prefix, rerun, dimensions, batch_size=100, max_seq_length=None):
    import numpy as np
    import pandas as pd

    from latentscope.util.embedding_store import (
        append_embeddings, get_embedding_count, get_storage_format, migrate_hdf5_to_lancedb,
    )
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))

    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    if not os.path.exists(embedding_dir):
        os.makedirs(embedding_dir)
    # determine the embedding id
    if rerun is not None:
        embedding_id = rerun
        # Check LanceDB first, then fallback to HDF5
        fmt = get_storage_format(DATA_DIR, dataset_id, embedding_id)
        if fmt == "lancedb":
            starting_batch = get_embedding_count(DATA_DIR, dataset_id, embedding_id) // batch_size
        elif fmt == "hdf5":
            # Migrate HDF5 to LanceDB before resuming so new batches go to same store
            print(f"Migrating {embedding_id} from HDF5 to LanceDB before resuming...")
            result = migrate_hdf5_to_lancedb(DATA_DIR, dataset_id, embedding_id,
                                             on_progress=lambda cur, tot: print(f"  migrated {cur}/{tot}"))
            print(f"Migration complete: {result}")
            starting_batch = get_embedding_count(DATA_DIR, dataset_id, embedding_id) // batch_size
        else:
            starting_batch = 0
    else:
        # determine the index of the last embedding run
        # Check both HDF5 files and LanceDB tables
        embedding_files = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.h5", f)]
        embedding_jsons = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.json", f)]
        all_files = embedding_files + embedding_jsons
        if len(all_files) > 0:
            numbers = []
            for f in all_files:
                match = re.search(r"embedding-(\d+)", f)
                if match:
                    numbers.append(int(match.group(1)))
            next_embedding_number = max(numbers) + 1 if numbers else 1
        else:
            next_embedding_number = 1
        # make the embedding name from the number, zero padded to 3 digits
        embedding_id = f"embedding-{next_embedding_number:03d}"
        starting_batch = 0

    print("RUNNING:", embedding_id)
    print("MODEL ID", model_id)
    model = get_embedding_model(model_id)
    print("MODEL", model)
    print("loading", model.name)
    model.load_model()

    # Check if this is a late interaction model
    is_late_interaction = getattr(model, 'late_interaction', False)
    if is_late_interaction:
        print("Late interaction model detected - will store per-token vectors")

    if max_seq_length is not None and isinstance(model, TransformersEmbedProvider):
        # Check if max_seq_length is a setter property
        try:
            model.model.max_seq_length = max_seq_length
        except AttributeError:
            print("Warning: This model does not support setting max_seq_length. Continuing with default length.")

    print("Checking for empty inputs")
    sentences = df[text_column].tolist()
    prefixed = []
    if prefix is None:
        prefix = ""
    for i,s in enumerate(sentences):
        if s is None or s == "":
            print(i,s, "text is empty, adding a [space]")
            s = " "
        prefixed.append(prefix + s)
    sentences = prefixed

    total_batches = len(sentences)//batch_size

    print("embedding", len(sentences), "sentences", "in", total_batches, "batches")
    if starting_batch > 0:
        print("Rerunning starting at batch", starting_batch)

    for i, batch in enumerate(tqdm(chunked_iterable(sentences, batch_size), total=total_batches)):
        if i < starting_batch:
            print(f"skipping batch {i}/{total_batches}", flush=True)
            continue
        try:
            start_index = i * batch_size
            if is_late_interaction:
                mean_vectors, token_vectors_list = model.embed_multi(batch, dimensions=dimensions)
                append_embeddings(
                    DATA_DIR, dataset_id, embedding_id,
                    mean_vectors, start_index=start_index,
                    token_vectors_list=token_vectors_list,
                )
            else:
                embeddings = np.array(model.embed(batch, dimensions=dimensions))
                append_embeddings(
                    DATA_DIR, dataset_id, embedding_id,
                    embeddings, start_index=start_index,
                )
        except Exception as e:
            print(batch)
            print("error embedding batch", i, e)
            print("exiting prematurely", embedding_id)
            # extract the rows from the last batch from df
            df_batch = df.iloc[i*batch_size:(i+1)*batch_size].copy()
            df_batch["_ls_text_"] = batch
            batch_path = os.path.join(embedding_dir, f"{embedding_id}-batch-{i}.parquet")
            df_batch.to_parquet(batch_path)
            print("wrote original data for batch along with processed inputs in _ls_sentences_ column to\n", batch_path)
            print("debug with command:")
            print("ls-embed-debug", batch_path, model_id)

            sys.exit(1)

    # track history of model_id used
    history_file_path = os.path.join(DATA_DIR, "embedding_model_history.csv")
    try:
        with open(history_file_path, 'a') as history_file:
            history_file.write(f"{datetime.now().isoformat()},{model_id}\n")
    except FileNotFoundError:
        with open(history_file_path, 'w') as history_file:
            history_file.write(f"{datetime.now().isoformat()},{model_id}\n")

    # Get stats from the stored embeddings
    from latentscope.util.embedding_store import get_embedding_stats
    stats = get_embedding_stats(DATA_DIR, dataset_id, embedding_id)

    meta = {
        "id": embedding_id,
        "model_id": model_id,
        "dataset_id": dataset_id,
        "text_column": text_column,
        "dimensions": stats["dimensions"],
        "max_seq_length": max_seq_length,
        "prefix": prefix,
        "late_interaction": is_late_interaction,
        "min_values": stats["min_values"],
        "max_values": stats["max_values"],
    }

    with open(os.path.join(embedding_dir, f"{embedding_id}.json"), 'w') as f:
        json.dump(meta, f, indent=2)

    print("done with", embedding_id)

def truncate():
    parser = argparse.ArgumentParser(description='Make a copy of an existing embedding truncated to a smaller number of dimensions')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='ID of embedding to use')
    parser.add_argument('dimensions', type=int, help='Number of dimensions to truncate to')
    args = parser.parse_args()
    embed_truncate(args.dataset_id, args.embedding_id, args.dimensions)

def embed_truncate(dataset_id, embedding_id, dimensions):
    import numpy as np

    from latentscope.util.embedding_store import append_embeddings
    from latentscope.util.embedding_store import load_embeddings as lance_load

    DATA_DIR = get_data_dir()
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")

    embedding_meta_path = os.path.join(embedding_dir, f"{embedding_id}.json")
    with open(embedding_meta_path) as f:
        embedding_meta = json.load(f)

    # Determine next embedding number
    embedding_jsons = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.json", f)]
    embedding_files = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.h5", f)]
    all_files = embedding_jsons + embedding_files
    if len(all_files) > 0:
        numbers = []
        for f in all_files:
            match = re.search(r"embedding-(\d+)", f)
            if match:
                numbers.append(int(match.group(1)))
        next_embedding_number = max(numbers) + 1 if numbers else 1
    else:
        next_embedding_number = 1
    new_embedding_id = f"embedding-{next_embedding_number:03d}"
    print("RUNNING:", new_embedding_id)

    # Load embeddings (from LanceDB or HDF5)
    embeddings = lance_load(DATA_DIR, dataset_id, embedding_id)

    print("truncating to", dimensions, "dimensions")
    matroyshka = embeddings[:, :dimensions]
    # Normalize the truncated embeddings
    matroyshka = matroyshka / np.linalg.norm(matroyshka, axis=1, keepdims=True)

    # Store in LanceDB
    append_embeddings(DATA_DIR, dataset_id, new_embedding_id, matroyshka, start_index=0)

    # Calculate min and max values for each index
    np.min(matroyshka, axis=0)
    np.max(matroyshka, axis=0)

    with open(os.path.join(embedding_dir, f"{new_embedding_id}.json"), 'w') as f:
        json.dump({
            "id": new_embedding_id,
            "model_id": embedding_meta["model_id"],
            "dataset_id": dataset_id,
            "text_column": embedding_meta["text_column"],
            "max_seq_length": embedding_meta.get("max_seq_length"),
            "dimensions": matroyshka.shape[1],
            "prefix": embedding_meta["prefix"],
            "late_interaction": False,
            }, f, indent=2)

    print("wrote", new_embedding_id, "to LanceDB")
    print("done")


def update_embedding_stats():
    parser = argparse.ArgumentParser(description='Update embedding stats')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='ID of embedding to use')
    args = parser.parse_args()
    embedding_stats(args.dataset_id, args.embedding_id)

def embedding_stats(dataset_id, embedding_id):
    import os

    import numpy as np

    from latentscope.util.embedding_store import load_embeddings as lance_load

    DATA_DIR = get_data_dir()
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")

    # Load embeddings from LanceDB or HDF5
    embeddings = lance_load(DATA_DIR, dataset_id, embedding_id)

    # Calculate min and max values for each index
    min_values = np.min(embeddings, axis=0)
    max_values = np.max(embeddings, axis=0)

    metadata_path = os.path.join(embedding_dir, f"{embedding_id}.json")
    # Read existing metadata
    with open(metadata_path) as f:
        metadata = json.load(f)

    # Add min and max values to metadata
    metadata['min_values'] = min_values.tolist()
    metadata['max_values'] = max_values.tolist()

    # Write updated metadata back to file
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"Updated metadata for {embedding_id} with min and max values")


def debug():
    parser = argparse.ArgumentParser(description='Debug embedding a batch')
    parser.add_argument('parquet_file', type=str, help='Parquet file output by embed process')
    parser.add_argument('model_id', type=str, help='ID of embedding model to use')
    parser.add_argument('--text_column', type=str, help='Column name for text data', default="_ls_text_")
    args = parser.parse_args()
    embed_debug(args.parquet_file, args.model_id, args.text_column)

def embed_debug(parquet_file, model_id, text_column):
    import pandas as pd
    df = pd.read_parquet(parquet_file)
    model = get_embedding_model(model_id)
    print("loading", model.name)
    model.load_model()

    for i,row in enumerate(df.iterrows()):
        print("batch index:", i)
        print("original index:", row[0])
        text = row[1][text_column]
        print("text:", text)
        embedding = model.embed([text])
        print("embedding", embedding)

def importer():
    import numpy as np
    import pandas as pd

    parser = argparse.ArgumentParser(description='Import embeddings from an input dataset column')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('embedding_column', type=str, help='Column to use as embedding input')
    parser.add_argument('model_id', type=str, help='ID of embedding to use')
    parser.add_argument('text_column', type=str, help='Column used to create embeddings')
    args = parser.parse_args()

    DATA_DIR = get_data_dir()
    # read the input parquet
    df = pd.read_parquet(os.path.join(DATA_DIR, args.dataset_id, "input.parquet"))
    # extract the column
    embeddings = df[args.embedding_column].to_numpy()
    # Ensure embeddings is an ndarray with shape [N, M]
    if not isinstance(embeddings, np.ndarray):
        embeddings = np.array(list(embeddings))
    if embeddings.ndim == 1:
        embeddings = np.stack(embeddings)


    import_embeddings(args.dataset_id, embeddings, args.model_id, args.text_column)

def import_embeddings(dataset_id, embeddings, model_id="", text_column="", prefix=""):
    import numpy as np

    from latentscope.util.embedding_store import append_embeddings
    DATA_DIR = get_data_dir()
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    os.makedirs(embedding_dir, exist_ok=True)

    # Determine next embedding number
    embedding_jsons = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.json", f)]
    embedding_files = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.h5", f)]
    all_files = embedding_jsons + embedding_files
    if len(all_files) > 0:
        numbers = []
        for f in all_files:
            match = re.search(r"embedding-(\d+)", f)
            if match:
                numbers.append(int(match.group(1)))
        next_embedding_number = max(numbers) + 1 if numbers else 1
    else:
        next_embedding_number = 1
    embedding_id = f"embedding-{next_embedding_number:03d}"

    print("importing embeddings with shape", embeddings.shape, "to LanceDB as", embedding_id)
    append_embeddings(DATA_DIR, dataset_id, embedding_id, embeddings, start_index=0)

    # Calculate min and max values for each index
    min_values = np.min(embeddings, axis=0)
    max_values = np.max(embeddings, axis=0)

    with open(os.path.join(embedding_dir, f"{embedding_id}.json"), 'w') as f:
        json.dump({
            "id": embedding_id,
            "model_id": model_id,
            "dataset_id": dataset_id,
            "dimensions": embeddings.shape[1],
            "text_column": text_column,
            "prefix": prefix,
            "late_interaction": False,
            "min_values": min_values.tolist(),
            "max_values": max_values.tolist(),
        }, f, indent=2)
    print("done with", embedding_id)

if __name__ == "__main__":
   main()
