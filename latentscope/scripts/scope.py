import os
import re
import json
import argparse
from datetime import datetime
from latentscope.util import get_data_dir
from latentscope import __version__


def main():
    parser = argparse.ArgumentParser(description='Setup a scope')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('embedding_id', type=str, help='Embedding id')
    parser.add_argument('umap_id', type=str, help='UMAP id')
    parser.add_argument('cluster_id', type=str, help='Cluster id')
    parser.add_argument('cluster_labels_id', type=str, help='Cluster labels id')
    parser.add_argument('label', type=str, help='Label for the scope')
    parser.add_argument('description', type=str, help='Description of the scope')
    parser.add_argument('--scope_id', type=str, help='Scope id to overwrite existing scope', default=None)

    args = parser.parse_args()
    scope(**vars(args))

def scope(dataset_id, embedding_id, umap_id, cluster_id, cluster_labels_id, label, description, scope_id=None):
    DATA_DIR = get_data_dir()
    print("DATA DIR", DATA_DIR)
    directory = os.path.join(DATA_DIR, dataset_id, "scopes")

    def get_next_scopes_number(dataset):
        # figure out the latest scope number
        scopes_files = [f for f in os.listdir(directory) if re.match(r"scopes-\d+\.json", f)]
        if len(scopes_files) > 0:
            last_scopes = sorted(scopes_files)[-1]
            last_scopes_number = int(last_scopes.split("-")[1].split(".")[0])
            next_scopes_number = last_scopes_number + 1
        else:
            next_scopes_number = 1
        return next_scopes_number

    next_scopes_number = get_next_scopes_number(dataset_id)
    # make the umap name from the number, zero padded to 3 digits
    if not scope_id:
        id = f"scopes-{next_scopes_number:03d}"
    else:
        id = scope_id

    print("RUNNING:", id)

    import pandas as pd

    scope = {
        "ls_version": __version__,
        "id": id,
        "embedding_id": embedding_id,
        "umap_id": umap_id,
        "cluster_id": cluster_id,
        "cluster_labels_id": cluster_labels_id,
        "label": label,
        "description": description
    }

    # read each json file and add its contents to the scope file
    dataset_file = os.path.join(DATA_DIR, dataset_id, "meta.json")
    with open(dataset_file) as f:
        dataset = json.load(f)
        scope["dataset"] = dataset

    embedding_file = os.path.join(DATA_DIR, dataset_id, "embeddings", embedding_id + ".json")
    with open(embedding_file) as f:
        embedding = json.load(f)
        scope["embedding"] = embedding
    
    umap_file = os.path.join(DATA_DIR, dataset_id, "umaps", umap_id + ".json")
    with open(umap_file) as f:
        umap = json.load(f)
        scope["umap"] = umap
    
    cluster_file = os.path.join(DATA_DIR, dataset_id, "clusters", cluster_id + ".json")
    with open(cluster_file) as f:
        cluster = json.load(f)
        scope["cluster"] = cluster
    
    if cluster_labels_id == "default":
        cluster_labels_id = cluster_id + "-labels-default"
        scope["cluster_labels"] = {"id": cluster_labels_id, "cluster_id": cluster_id}
    else:
        cluster_labels_file = os.path.join(DATA_DIR, dataset_id, "clusters", cluster_labels_id + ".json")
        with open(cluster_labels_file) as f:
            cluster_labels = json.load(f)
            scope["cluster_labels"] = cluster_labels

    # load the actual labels and save everything but the indices in a dict
    cluster_labels_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "clusters", cluster_labels_id + ".parquet"))
    # remove the indices column

    cluster_labels_df = cluster_labels_df.drop(columns=[col for col in ["indices", "labeled", "label_raw"] if col in cluster_labels_df.columns])
    # cluster_labels_df = cluster_labels_df.drop(columns=["indices", "labeled", "label_raw"])
    # change hulls to a list of lists
    cluster_labels_df["hull"] = cluster_labels_df["hull"].apply(lambda x: x.tolist())
    cluster_labels_df["cluster"] = cluster_labels_df.index
    scope["cluster_labels_lookup"] = cluster_labels_df.to_dict(orient="records")
    
    # create a scope parquet by combining the parquets from umap and cluster, as well as getting the labels from cluster_labels
    # then write the parquet to the scopes directory
    umap_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "umaps", umap_id + ".parquet"))
    print("umap columns", umap_df.columns)
    cluster_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "clusters", cluster_id + ".parquet"))
    cluster_labels_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "clusters", cluster_labels_id + ".parquet"))
    # create a column where we lookup the label from cluster_labels_df for the index found in the cluster_df
    cluster_df["label"] = cluster_df["cluster"].apply(lambda x: cluster_labels_df.loc[x]["label"])
    print("cluster columns", cluster_df.columns)
    scope_parquet = pd.concat([umap_df, cluster_df], axis=1)
    # Add an ls_index column that is the index of each row in the dataframe
    scope_parquet['ls_index'] = scope_parquet.index
    print("scope columns", scope_parquet.columns)
    scope_parquet.to_parquet(os.path.join(directory, id + ".parquet"))

    scope["rows"] = len(scope_parquet)
    scope["columns"] = scope_parquet.columns.tolist()
    scope["size"] = os.path.getsize(os.path.join(directory, id + ".parquet"))
    scope["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    file_path = os.path.join(directory, id + ".json")
    with open(file_path, 'w') as f:
        json.dump(scope, f, indent=2)
    
    transactions_file_path = os.path.join(directory, id + "-transactions.json")
    if not os.path.exists(transactions_file_path):
        with open(transactions_file_path, 'w') as f:
            json.dump([], f)
    
    input_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))
    input_df.reset_index(inplace=True)
    input_df = input_df[input_df['index'].isin(scope_parquet['ls_index'])]
    combined_df = input_df.join(scope_parquet.set_index('ls_index'), on='index', rsuffix='_ls')
    combined_df.to_parquet(os.path.join(directory, id + "-input.parquet"))

    print("wrote scope", id)

