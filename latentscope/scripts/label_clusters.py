# Usage: ls-label <dataset_id> <text_column> <cluster_id> <model_id> <context>
import os
import re
import sys
import json
import time
import argparse
from datetime import datetime

try:
    # Check if the runtime environment is a Jupyter notebook
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError as e:
    # Fallback to the standard console version if import fails
    from tqdm import tqdm

from latentscope.util import get_data_dir
from latentscope.models import get_chat_model

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def too_many_duplicates(line, threshold=100):
    word_count = {}
    if not line:
        return False
    words = str(line).split()
    for word in words:
        word_count[word] = word_count.get(word, 0) + 1
    return any(count > threshold for count in word_count.values())

def main():
    parser = argparse.ArgumentParser(description='Label a set of slides using OpenAI')
    parser.add_argument('dataset_id', type=str, help='Dataset ID (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('cluster_id', type=str, help='ID of cluster set', default='cluster-001')
    parser.add_argument('model_id', type=str, help='ID of model to use', default="openai-gpt-3.5-turbo")
    parser.add_argument('samples', type=int, help='Number to sample from each cluster (default: 0 for all)', default=0)
    parser.add_argument('context', type=str, help='Additional context for labeling model', default="")
    parser.add_argument('--rerun', type=str, help='Rerun the given embedding from last completed batch')
    parser.add_argument('--max_tokens_per_sample', type=int, help='Max tokens per sample', default=-1)
    parser.add_argument('--max_tokens_total', type=int, help='Max tokens total', default=-1)

    # Parse arguments
    args = parser.parse_args()

    labeler(args.dataset_id, args.text_column, args.cluster_id, args.model_id, args.samples, args.context, args.rerun, args.max_tokens_per_sample, args.max_tokens_total)


def labeler(dataset_id, text_column="text", cluster_id="cluster-001", model_id="openai-gpt-3.5-turbo", samples=0, context="", rerun="", max_tokens_per_sample=-1, max_tokens_total=-1):
    import numpy as np
    import pandas as pd
    DATA_DIR = get_data_dir()
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))

    # Load the indices for each cluster from the prepopulated labels file generated by cluster.py
    cluster_dir = os.path.join(DATA_DIR, dataset_id, "clusters")
    clusters = pd.read_parquet(os.path.join(cluster_dir, f"{cluster_id}-labels-default.parquet"))
    # initialize the labeled property to false when loading default clusters
    clusters = clusters.copy()
    clusters['labeled'] = False
    
    cluster_rows = pd.read_parquet(os.path.join(cluster_dir, f"{cluster_id}.parquet"))
    df["cluster"] = cluster_rows["cluster"]
    df["raw_cluster"] = cluster_rows["raw_cluster"]

    with open(os.path.join(cluster_dir, f"{cluster_id}.json"), 'r') as f:
        cluster_meta = json.load(f)
    umap_id = cluster_meta["umap_id"]
    umap = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "umaps", f"{umap_id}.parquet"))
    df["x"] = umap["x"]
    df["y"] = umap["y"]

    unlabeled_row = 0
    if rerun is not None:
        label_id = rerun
        # print(clusters.columns)
        # find the first row where labeled isnt True
        unlabeled_row = clusters[~clusters['labeled']].first_valid_index()
        tqdm.write(f"First unlabeled row: {unlabeled_row}")
        

    else:
        # Determine the label id for the given cluster_id by checking existing label files
        label_files = [f for f in os.listdir(cluster_dir) if re.match(rf"{re.escape(cluster_id)}-labels-\d+\.parquet", f)]
        if label_files:
            # Extract label numbers and find the maximum
            label_numbers = [int(re.search(rf"{re.escape(cluster_id)}-labels-(\d+)\.parquet", f).group(1)) for f in label_files]
            next_label_number = max(label_numbers) + 1
        else:
            next_label_number = 1
        label_id = f"{cluster_id}-labels-{next_label_number:03d}"

    # track history of model_id used
    history_file_path = os.path.join(DATA_DIR, "chat_model_history.csv")
    try:
        with open(history_file_path, 'a') as history_file:
            history_file.write(f"{datetime.now().isoformat()},{model_id}\n")
    except FileNotFoundError:
        with open(history_file_path, 'w') as history_file:
            history_file.write(f"{datetime.now().isoformat()},{model_id}\n")

    tqdm.write(f"RUNNING: {label_id}")

    tqdm.write(f"Loading model {model_id} (may take a while if first time downloading from HF)")
    model = get_chat_model(model_id)
    model.load_model()
    enc = model.encoder
    tqdm.write(f"Model loaded")

    # unescape the context
    context = context.replace('\\"', '"')

    # Create the lists of items we will send for summarization
    # we truncate the list based on tokens and we also remove items that have too many duplicate words
    extracts = []
    for i, row in tqdm(clusters.iterrows(), total=clusters.shape[0], desc="Preparing extracts"):
    # for i, row in clusters.iterrows():
        indices = row['indices']
        # items = df.loc[list(indices), text_column]
        items = df.loc[list(indices)]
        if samples > 0 and samples < len(items):
            # first sample the items from cluster_rows where 'raw_cluster' matches the current cluster_id
            cluster_items = items[items['raw_cluster'] == i]

            if(len(cluster_items) < samples):
                cluster_items = pd.concat([cluster_items, items[items['cluster'] == i]])

            # Sort cluster items by distance from centroid
            # Get x,y coordinates for items
            coords = cluster_items[['x', 'y']].values
            
            # Calculate centroid
            centroid = coords.mean(axis=0)
            
            # Calculate distances from centroid
            distances = np.sqrt(np.sum((coords - centroid) ** 2, axis=1))
            
            # Add distances as column and sort
            cluster_items = cluster_items.assign(centroid_dist=distances)
            cluster_items = cluster_items.sort_values('centroid_dist')

            items = cluster_items[0:samples]
            # items = cluster_items.sample(samples)

        items = items.drop_duplicates()
        items = items[text_column]
        # tqdm.write(f"{i} items: {len(items)}")
        
        total_tokens = 0
        keep_items = []
        if enc is not None:
            for item in items:
                if item is None:
                    continue
                encoded_item = enc.encode(item)
                if max_tokens_per_sample > 0 and len(encoded_item) > max_tokens_per_sample:
                    item = enc.decode(encoded_item[:max_tokens_per_sample])
                    total_tokens += max_tokens_per_sample
                else:
                    total_tokens += len(encoded_item)
                if max_tokens_total > 0 and total_tokens > max_tokens_total:
                    break
                # tqdm.write(f"tokens: {len(encoded_item)}")
                keep_items.append(item)
        else:
            keep_items = items
        keep_items = [item for item in keep_items if item is not None]
        # tqdm.write(f"{i} total tokens: {total_tokens}, keep_items: {len(keep_items)}")
        extracts.append(keep_items)

        # text = '\n'.join([f"{i+1}. {t}" for i, t in enumerate(items) if not too_many_duplicates(t)])
        # text = '\n'.join([f"<ListItem>{t}</ListItem>" for i, t in enumerate(items) if not too_many_duplicates(t)])
        # encoded_text = enc.encode(text)
        # if len(encoded_text) > max_tokens:
        #     encoded_text = encoded_text[:max_tokens]
        # extract = enc.decode(encoded_text)
        # extracts.append(extract)

    # TODO we arent really batching these
    # each "batch" is the items for a single cluster
    batch_size = 1
    labels = []
    clean_labels = []

    for i,batch in enumerate(tqdm(chunked_iterable(extracts, batch_size),  total=len(extracts)//batch_size)):
        # tqdm.write(batch[0])
        if(unlabeled_row > 0):
            if clusters.loc[i, 'labeled']:
                tqdm.write(f"skipping {i} already labeled {clusters.loc[i, 'label']}")
                time.sleep(0.01)
                continue

        try:
            time.sleep(0.01)
            # tqdm.write(f"Summarizing {batch[0]}")
            label = model.summarize(batch[0], context)
            labels.append(label)
            
            # do some cleanup of the labels when the model doesn't follow instructions
            clean_label = label.replace("\n", " ")
            clean_label = clean_label.replace("<|eot_id|>", "")
            clean_label = clean_label.replace('*', '')
            clean_label = clean_label.replace('"', '')
            clean_label = clean_label.replace("'", '')
            # clean_label = clean_label.replace("-", '')
            clean_label = ' '.join(clean_label.split())
            clean_label = " ".join(clean_label.split(" ")[0:5])
            clean_labels.append(clean_label)
            if re.search(r"please provide", label, re.IGNORECASE):
                tqdm.write(f"cluster {i} label: {clean_label}")
                tqdm.write(f"batch: {batch[0]}")
                tqdm.write(f"label: {label}")
            
            tqdm.write(f"cluster {i} label: {clean_label}")
            clusters.loc[i, 'label'] = clean_label
            clusters.loc[i, 'label_raw'] = label
            clusters.loc[i, 'labeled'] = True
            # length = len(clean_labels) - 1
            # clusters_df.loc[unlabled_row:unlabled_row+length, 'label'] = clean_labels
            # clusters_df.loc[unlabled_row:unlabled_row+length, 'label_raw'] = labels
            # clusters_df.loc[unlabled_row:unlabled_row+length, 'labeled'] = [True for i in range(0, len(labels))]
            clusters.to_parquet(os.path.join(cluster_dir, f"{label_id}.parquet"))
            # update 

        except Exception as e: 
            tqdm.write(f"{batch[0]}")
            tqdm.write(f"ERROR: {e}")
            tqdm.write("exiting")
            exit(1)

    print("labels:", len(labels))
    # add lables to slides df

    # write the df to parquet
    with open(os.path.join(cluster_dir,f"{label_id}.json"), 'w') as f:
        json.dump({
            "id": label_id,
            "cluster_id": cluster_id,
            "model_id": model_id, 
            "text_column": text_column,
            "samples": samples,
            "context": context,
            # "system_prompt": system_prompt,
            "max_tokens_per_sample": max_tokens_per_sample,
            "max_tokens_total": max_tokens_total,
        }, f, indent=2)
    f.close()
    print("done with", label_id)

if __name__ == "__main__":
    main()
