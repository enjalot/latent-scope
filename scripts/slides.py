# Creates a set of slides from a clustering
# Usage: python slides.py <dataset_name> <cluster_name> 
# Example: python cluster.py dadabase-curated cluster-001
import os
import re
import sys
import json
import hdbscan
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.spatial import ConvexHull
from scipy.spatial.distance import cdist


def slider(dataset_name, cluster_name):
    # Check if clusters directory exists, if not, create it
    if not os.path.exists(f'../data/{dataset_name}/slides'):
        os.makedirs(f'../data/{dataset_name}/slides')
    # determine the index of the last cluster run by looking in the dataset directory
    # for files named umap-<number>.json
    slides_files = [f for f in os.listdir(f"../data/{dataset_name}/slides") if re.match(r"slides-\d+\.json", f)]
    print("slides files", sorted(slides_files))
    if len(slides_files) > 0:
        last_slides = sorted(slides_files)[-1]
        last_slides_number = int(last_slides.split("-")[1].split(".")[0])
        print("lastslides", last_slides, last_slides_number)
        next_slides_number = last_slides_number + 1
    else:
        next_slides_number = 1

    # make the umap name from the number, zero padded to 3 digits
    slides_name = f"slides-{next_slides_number:03d}"

    # read cluster labels from parquet
    df = pd.read_parquet(f"../data/{dataset_name}/clusters/{cluster_name}.parquet") 
    # group by cluster column and get the indices of each item in a cluster
    cluster_indices = df.groupby('cluster').groups

    # iterate over the clusters and create a row for each in a new dataframe with a label, description and array of indicies
    slides_df = pd.DataFrame(columns=['label', 'description', 'indices'])
    for cluster, indices in cluster_indices.items():
        label = f"Cluster {cluster}"
        description = f"This is cluster {cluster} with {len(indices)} items."
        new_row = pd.DataFrame({'label': [label], 'description': [description], 'indices': [list(indices)]})
        slides_df = pd.concat([slides_df, new_row], ignore_index=True)

    print(slides_df.head())

    # write the df to parquet
    slides_df.to_parquet(f"../data/{dataset_name}/slides/{slides_name}.parquet")

    with open(f'../data/{dataset_name}/slides/{slides_name}.json', 'w') as f:
        json.dump({
            "slides_name": slides_name,
            "cluster_name": cluster_name,
            "n_slides": slides_df.shape[0],
        }, f)
    
    # open the database meta json and add "active_slides" key with the name of the slides
    with open(f'../data/{dataset_name}/meta.json', 'r') as f:
        meta = json.load(f)
        meta['active_slides'] = slides_name
    with open(f'../data/{dataset_name}/meta.json', 'w') as f:
        # format the json when dumping to have spaces and newlines
        json.dump(meta, f, indent=2)


if __name__ == "__main__":
    dataset_name = sys.argv[1]
    cluster_name = sys.argv[2]
    slider(dataset_name, cluster_name)
