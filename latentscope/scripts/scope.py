import os
import re
import json
import argparse
from latentscope.util import get_data_dir


def main():
    parser = argparse.ArgumentParser(description='Setup a scope')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('embedding_id', type=str, help='Embedding id')
    parser.add_argument('umap_id', type=str, help='UMAP id')
    parser.add_argument('cluster_id', type=str, help='Cluster id')
    parser.add_argument('cluster_labels_id', type=str, help='Cluster labels id')
    parser.add_argument('label', type=str, help='Label for the scope')
    parser.add_argument('description', type=str, help='Description of the scope')

def scope(dataset_id, embedding_id, umap_id, cluster_id, cluster_labels_id, label, description):
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
    id = f"scopes-{next_scopes_number:03d}"
    print("RUNNING:", id)

    scope = {
        "id": id,
        "embedding_id": embedding_id,
        "umap_id": umap_id,
        "cluster_id": cluster_id,
        "cluster_labels_id": cluster_labels_id,
        "label": label,
        "description": description
    }
    
    file_path = os.path.join(directory, id + ".json")
    with open(file_path, 'w') as f:
        json.dump(scope, f, indent=2)
    print("wrote scope", id)