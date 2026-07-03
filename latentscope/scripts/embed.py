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


def decode_image_value(value):
    """Decode one stored image value (HF-style {"bytes": ...} dict or raw
    bytes) into a PIL RGB image, or None if missing/undecodable."""
    from io import BytesIO

    from PIL import Image
    if isinstance(value, dict):
        value = value.get("bytes")
    if not isinstance(value, (bytes, bytearray)) or len(value) == 0:
        return None
    try:
        img = Image.open(BytesIO(value))
        return img.convert("RGB")
    except Exception:
        return None


def decode_image_batch(values, start_index=0):
    """Decode a batch of stored image values to PIL images.

    Null or undecodable rows get a 1x1 black placeholder (mirrors the
    "[space]" substitution for empty text) so row alignment is preserved.
    """
    from PIL import Image
    images = []
    for offset, value in enumerate(values):
        img = decode_image_value(value)
        if img is None:
            print(start_index + offset,
                  "image is missing or undecodable, substituting a 1x1 black image")
            img = Image.new("RGB", (1, 1), (0, 0, 0))
        images.append(img)
    return images

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
    parser.add_argument('--task', type=str, default=None,
                        help='Task for task-conditioned models (e.g. jina-v3/v5): '
                             'retrieval, clustering, classification, text-matching')

    # Parse arguments
    args = parser.parse_args()
    embed(args.dataset_id, args.text_column, args.model_id, args.prefix, args.rerun, args.dimensions, args.batch_size, args.max_seq_length, task=args.task)

def _make_token_counter(model):
    """Best-effort per-text token counter using a tokenizer the embedding
    provider already loaded (sentence-transformers `.tokenizer`, OpenAI/tiktoken
    `.encoder`, ...). Returns a callable mapping a list of texts to a list of
    token counts, or None when no local tokenizer is available (e.g. an API
    provider that tokenizes server-side). Powers the token stats for issue #77.
    """
    tokenizer = getattr(model, "tokenizer", None) or getattr(model, "encoder", None)
    if tokenizer is None or not hasattr(tokenizer, "encode"):
        return None

    def count(texts):
        counts = []
        for t in texts:
            enc = tokenizer.encode(t)
            # HF tokenizers return an Encoding (with .ids); tiktoken returns a list
            counts.append(len(getattr(enc, "ids", enc)))
        return counts

    return count


def embed(dataset_id, text_column, model_id, prefix, rerun, dimensions, batch_size=100, max_seq_length=None, task=None):
    import numpy as np
    import pandas as pd

    from latentscope.util.embedding_store import (
        append_embeddings,
        get_embedding_count,
        get_storage_format,
        list_embedding_ids,
        migrate_hdf5_to_lancedb,
    )
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))

    # Determine whether the selected column holds binary images (flagged by
    # ingest in the dataset meta). Image columns are embedded as PIL images
    # through image-capable models; everything else is treated as text.
    input_type = "text"
    dataset_meta_path = os.path.join(DATA_DIR, dataset_id, "meta.json")
    if os.path.exists(dataset_meta_path):
        with open(dataset_meta_path) as f:
            dataset_meta = json.load(f)
        column_meta = dataset_meta.get("column_metadata", {}).get(text_column, {})
        if column_meta.get("type") == "image":
            input_type = "image"

    embedding_dir = os.path.join(DATA_DIR, dataset_id, "embeddings")
    if not os.path.exists(embedding_dir):
        os.makedirs(embedding_dir)
    # determine the embedding id
    if rerun is not None:
        embedding_id = rerun
        # Check LanceDB first, then fallback to HDF5
        fmt = get_storage_format(DATA_DIR, dataset_id, embedding_id)
        if fmt == "lancedb":
            existing_count = get_embedding_count(DATA_DIR, dataset_id, embedding_id)
        elif fmt == "hdf5":
            # Migrate HDF5 to LanceDB before resuming so new batches go to same store
            print(f"Migrating {embedding_id} from HDF5 to LanceDB before resuming...")
            result = migrate_hdf5_to_lancedb(DATA_DIR, dataset_id, embedding_id,
                                             on_progress=lambda cur, tot: print(f"  migrated {cur}/{tot}"))
            print(f"Migration complete: {result}")
            existing_count = get_embedding_count(DATA_DIR, dataset_id, embedding_id)
        else:
            existing_count = 0
    else:
        # Determine the index of the last embedding run. Check HDF5 files,
        # metadata JSONs, and LanceDB tables — a crashed run leaves only a
        # LanceDB table (the .json is written at the end), and reusing its id
        # would append a second run into the half-finished table.
        embedding_files = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.h5", f)]
        embedding_jsons = [f for f in os.listdir(embedding_dir) if re.match(r"embedding-\d+\.json", f)]
        lancedb_ids = [i for i in list_embedding_ids(DATA_DIR, dataset_id)
                       if re.match(r"embedding-\d+$", i)]
        all_names = embedding_files + embedding_jsons + lancedb_ids
        numbers = []
        for f in all_names:
            match = re.search(r"embedding-(\d+)", f)
            if match:
                numbers.append(int(match.group(1)))
        next_embedding_number = max(numbers) + 1 if numbers else 1
        # make the embedding name from the number, zero padded to 3 digits
        embedding_id = f"embedding-{next_embedding_number:03d}"
        existing_count = 0

    print("RUNNING:", embedding_id)
    print("MODEL ID", model_id)
    model = get_embedding_model(model_id)
    # Requested task for task-conditioned models (jina-v3/v5); the provider reads
    # this in load_model and falls back to a sensible default when unset.
    if task:
        model.task = task
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

    if prefix is None:
        prefix = ""
    # Prompt precedence: an explicit --prefix (user intent) wins over a model's
    # auto-applied prompt. Some sentence-transformers models set a default prompt
    # (default_prompt_name) so a corpus is embedded with the model's own document
    # prompt when the user gives no prefix. If the user DID specify a prefix,
    # honor it and disable the auto prompt so the two don't stack. This is
    # model-agnostic — it keys off whether the model advertises a default prompt.
    if isinstance(model, TransformersEmbedProvider):
        st = getattr(model, "model", None)
        auto_prompt = getattr(st, "default_prompt_name", None)
        if auto_prompt and prefix:
            print(f"Using the specified prefix {prefix!r}; disabling the model's "
                  f"auto-applied '{auto_prompt}' prompt so they don't stack.")
            st.default_prompt_name = None
    if input_type == "image":
        if not getattr(model, "supports_images", False):
            print(f"Error: column '{text_column}' is an image column but model "
                  f"'{model_id}' does not support image inputs. Choose an "
                  "image-capable model (CLIP, SigLIP, ViT, DINOv2).")
            sys.exit(1)
        # Keep the raw stored values; decode to PIL per batch (not all
        # upfront) so memory stays bounded.
        print("embedding image column", text_column)
        sentences = df[text_column].tolist()
    else:
        print("Checking for empty inputs")
        # Build the prefixed list directly from the column in a single pass so
        # only one full copy of the text exists (the column itself stays in df).
        sentences = []
        for i, s in enumerate(df[text_column]):
            # pd.isna catches None, NaN and pd.NA (a plain `s is None` check
            # misses the float NaN / pd.NA that pandas produces from null
            # parquet/CSV cells, which would crash on `prefix + s` below).
            if pd.isna(s) or s == "":
                print(i, s, "text is empty, adding a [space]")
                s = " "
            elif not isinstance(s, str):
                # Non-string cells (e.g. a numeric column) would also break
                # concatenation; coerce so row alignment is preserved.
                s = str(s)
            sentences.append(prefix + s)

    total_batches = (len(sentences) + batch_size - 1) // batch_size

    print("embedding", len(sentences), input_type, "inputs", "in", total_batches, "batches")
    if existing_count > 0:
        print(f"Resuming: {existing_count} rows already embedded")

    # Token accounting (#77): count tokens per row as we go. Late-interaction
    # models give exact counts from their per-token vectors; for dense models we
    # use a local tokenizer when the provider exposes one. Only collected on a
    # fresh run — a resume skips already-embedded batches, which would undercount.
    token_counter = None if input_type == "image" else _make_token_counter(model)
    collect_tokens = existing_count == 0
    token_counts = []

    for i, batch in enumerate(tqdm(chunked_iterable(sentences, batch_size), total=total_batches)):
        start_index = i * batch_size
        end_index = start_index + len(batch)
        if end_index <= existing_count:
            # fully covered by a previous run — re-embedding would append
            # duplicate ls_index rows
            continue
        if start_index < existing_count:
            # partial overlap (final partial batch of a completed run, or a
            # changed batch_size): embed only the rows not yet stored
            batch = batch[existing_count - start_index:]
            start_index = existing_count
        if input_type == "image":
            # decode this batch only; rows that fail get a 1x1 black placeholder
            batch_inputs = decode_image_batch(batch, start_index=start_index)
        else:
            batch_inputs = batch
        try:
            if is_late_interaction:
                mean_vectors, token_vectors_list = model.embed_multi(batch_inputs, dimensions=dimensions)
                append_embeddings(
                    DATA_DIR, dataset_id, embedding_id,
                    mean_vectors, start_index=start_index,
                    token_vectors_list=token_vectors_list,
                )
                if collect_tokens:
                    token_counts.extend(len(tv) for tv in token_vectors_list)
            else:
                embeddings = np.array(model.embed(batch_inputs, dimensions=dimensions))
                append_embeddings(
                    DATA_DIR, dataset_id, embedding_id,
                    embeddings, start_index=start_index,
                )
                if collect_tokens and token_counter is not None:
                    try:
                        token_counts.extend(token_counter(batch_inputs))
                    except Exception as te:
                        print("token counting disabled:", te)
                        token_counter = None
        except Exception as e:
            print(batch)
            print("error embedding batch", i, e)
            print("exiting prematurely", embedding_id)
            # extract the rows from the last batch from df
            df_batch = df.iloc[start_index:start_index + len(batch)].copy()
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

    # Compact fragments (one per batch was written) and index for search
    from latentscope.util.embedding_store import (
        create_scalar_index,
        create_vector_index,
        get_embedding_stats,
        optimize_table,
    )
    # All rows are written at this point; never let housekeeping kill the run
    # (searches fall back to a brute-force scan without the indexes).
    try:
        print("optimizing embedding table")
        optimize_table(DATA_DIR, dataset_id, embedding_id)
        print("creating indexes")
        create_vector_index(DATA_DIR, dataset_id, embedding_id)
        if is_late_interaction:
            # token-vector lookups filter on ls_index
            create_scalar_index(DATA_DIR, dataset_id, embedding_id)
    except Exception as e:
        print(f"Warning: table optimize/index failed ({e}); continuing without index")

    # Get stats from the stored embeddings
    stats = get_embedding_stats(DATA_DIR, dataset_id, embedding_id)

    # Summarize token counts (#77) so the UI can surface tokens per doc + total.
    token_stats = None
    if collect_tokens and token_counts:
        arr = np.asarray(token_counts)
        token_stats = {
            "total": int(arr.sum()),
            "mean": round(float(arr.mean()), 2),
            "min": int(arr.min()),
            "max": int(arr.max()),
            "count": int(arr.size),
        }
        print(f"tokens: {token_stats['total']} total, {token_stats['mean']} avg/doc")

    meta = {
        "id": embedding_id,
        "model_id": model_id,
        "dataset_id": dataset_id,
        "text_column": text_column,
        "input_type": input_type,
        "dimensions": stats["dimensions"],
        "max_seq_length": max_seq_length,
        "prefix": prefix,
        "task": getattr(model, "task", None),
        "late_interaction": is_late_interaction,
        "min_values": stats["min_values"],
        "max_values": stats["max_values"],
        "token_stats": token_stats,
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
