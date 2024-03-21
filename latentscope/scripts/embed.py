# Usage: ls-embed <dataset_id> <text_column> <model_id>
import os
import re
import sys
import json
import time
import argparse

try:
    # Check if the runtime environment is a Jupyter notebook
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError as e:
    # Fallback to the standard console version if import fails
    from tqdm import tqdm

from latentscope.models import get_embedding_model, get_embedding_model_dict
from latentscope.util import get_data_dir

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

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

    # Parse arguments
    args = parser.parse_args()
    embed(args.dataset_id, args.text_column, args.model_id, args.prefix, args.rerun, args.dimensions, args.batch_size)

def embed(dataset_id, text_column, model_id, prefix, rerun, dimensions, batch_size=100):
    import pandas as pd
    import numpy as np
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))
    
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    if not os.path.exists(embedding_dir):
        os.makedirs(embedding_dir)
    # determine the embedding id
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
    sentences = prefixed #[prefix + s for s in sentences]

    total_batches = len(sentences)//batch_size

    print("embedding", len(sentences), "sentences", "in", total_batches, "batches")
    if starting_batch > 0:
        print("Rerunning starting at batch", starting_batch)

    for i, batch in enumerate(tqdm(chunked_iterable(sentences, batch_size), total=total_batches)):
        if i < starting_batch:
            print(f"skipping batch {i}/{total_batches}", flush=True)
            continue
        try:
            embeddings = np.array(model.embed(batch, dimensions=dimensions))
            append_to_hdf5(os.path.join(embedding_dir, f"{embedding_id}.h5"), embeddings)
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

def truncate():
    parser = argparse.ArgumentParser(description='Make a copy of an existing embedding truncated to a smaller number of dimensions')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='ID of embedding to use') 
    parser.add_argument('dimensions', type=int, help='Number of dimensions to truncate to') 
    args = parser.parse_args()
    embed_truncate(args.dataset_id, args.embedding_id, args.dimensions)

def embed_truncate(dataset_id, embedding_id, dimensions):
    import numpy as np
    import h5py

    DATA_DIR = get_data_dir()
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")

    embedding_meta_path = os.path.join(embedding_dir, f"{embedding_id}.json")
    with open(embedding_meta_path, 'r') as f:
        embedding_meta = json.load(f)
    # Load the embedding model
    model_id = embedding_meta["model_id"]
    model = get_embedding_model_dict(model_id)
    print("model params", model["params"])
    # Check if the model has the attribute 'dimensions'
    try:
        dims = model["params"]['dimensions']
    except KeyError:
        raise KeyError(f"The model {model_id} does not have the 'dimensions' parameter meaning it cannot be truncated.")

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
    new_embedding_id = f"embedding-{next_embedding_number:03d}"
    print("RUNNING:", new_embedding_id)

    # read in the embeddings from embedding_id
    embedding_path = os.path.join(embedding_dir, f"{embedding_id}.h5")
    with h5py.File(embedding_path, 'r') as f:
        dataset = f["embeddings"]
        embeddings = np.array(dataset)
   

    print("truncating to", dimensions, "dimensions")
    matroyshka = embeddings[:, :dimensions]
    # Normalize the truncated embeddings
    matroyshka = matroyshka / np.linalg.norm(matroyshka, axis=0, keepdims=True)
    append_to_hdf5(os.path.join(embedding_dir, f"{new_embedding_id}.h5"), matroyshka)
    
    with open(os.path.join(embedding_dir, f"{new_embedding_id}.json"), 'w') as f:
        json.dump({
            "id": new_embedding_id,
            "model_id": embedding_meta["model_id"],
            "dataset_id": dataset_id,
            "text_column": embedding_meta["text_column"],
            "dimensions": matroyshka.shape[1],
            "prefix": embedding_meta["prefix"],
            }, f, indent=2)

    print("wrote", os.path.join(embedding_dir, f"{new_embedding_id}.h5"))
    print("done")

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
        # print("tokens:", len(model.tokenizer.encode(text)))
        # print("batch index:", i, "DataFrame index:", row[0], "Text:", row[1][text_column])
        embedding = model.embed([text])
        print("embedding", embedding)
        
def importer():
    import pandas as pd
    import numpy as np

    parser = argparse.ArgumentParser(description='Import embeddings from an input dataset column to a standard HDF5 file')
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
    DATA_DIR = get_data_dir()
    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
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

    print("importing embeddings with shape", embeddings.shape, "to", os.path.join(embedding_dir, f"{embedding_id}.h5"))
    append_to_hdf5(os.path.join(embedding_dir, f"{embedding_id}.h5"), embeddings)
    with open(os.path.join(embedding_dir, f"{embedding_id}.json"), 'w') as f:
        json.dump({
            "id": embedding_id,
            "model_id": model_id,
            "dataset_id": dataset_id,
            "dimensions": embeddings.shape[1],
            "text_column": text_column,
            "prefix": prefix
        }, f, indent=2)
    print("done with", embedding_id)

if __name__ == "__main__":
   main() 