# Usage: python umapper.py <dataset_name> <model> <neighbors> <min_dist>
# Example: python umapper.py dadabase-curated BAAI_bge-small-en-v1.5 50 0.075
import os
import re
import sys
import json
import umap
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


def umapper(dataset_name, model, neighbors=25, min_dist=0.075):
    # read in the embeddings
    embeddings = np.load(f'../data/{dataset_name}/embeddings/{model}.npy')

    if not os.path.exists(f'../data/{dataset_name}/umaps'):
        os.makedirs(f'../data/{dataset_name}/umaps')

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_files = [f for f in os.listdir(f"../data/{dataset_name}/umaps") if re.match(r"umap-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1

    # make the umap name from the number, zero padded to 3 digits
    umap_name = f"umap-{next_umap_number:03d}"
 

    reducer = umap.UMAP(
        n_neighbors=neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=42,
        n_components=2,
        verbose=True,
    )

    umap_embeddings = reducer.fit_transform(embeddings)

    min_values = np.min(umap_embeddings, axis=0)
    max_values = np.max(umap_embeddings, axis=0)

    # Scale the embeddings to the range [0, 1]
    umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)

    # Scale the embeddings to the range [-1, 1]
    umap_embeddings = 2 * umap_embeddings - 1

    # save umap embeddings to a parquet file with columns x,y
    df = pd.DataFrame(umap_embeddings, columns=['x', 'y'])
    output_file = f"../data/{dataset_name}/umaps/{umap_name}.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)

    # generate a scatterplot of the umap embeddings and save it to a file
    
    fig, ax = plt.subplots(figsize=(6, 6))
    plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=1, alpha=0.5)
    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(f"../data/{dataset_name}/umaps/{umap_name}.png")

    # save a json file with the umap parameters
    with open(f'../data/{dataset_name}/umaps/{umap_name}.json', 'w') as f:
        json.dump({
            "name": umap_name, 
            "embeddings": model,
            "neighbors": neighbors, 
            "min_dist": min_dist}, f, indent=2)
    f.close()
    


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='UMAP embeddings for a dataset')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('model', type=str, help='(Sanitized) Name of embedding model to use', default="BAAI_bge-small-en-v1.5")
    parser.add_argument('neighbors', type=int, help='Output file', default=25)
    parser.add_argument('min_dist', type=float, help='Output file', default=0.075)

    # Parse arguments
    args = parser.parse_args()
    umapper(args.name, args.model, args.neighbors, args.min_dist)
