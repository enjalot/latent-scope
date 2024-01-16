# Usage: python umapper.py <dataset_name> <neighbors> <min_dist>
# Example: python umapper.py dadabase-curated 50 0.075
# TODO: update this to match latest improvements in umapper.py
import os
import re
import sys
import json
import umap
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


def umapper(dataset_name, neighbors=25, min_dist=0.075):
    # read in the embeddings
    embeddings = np.load(f'../data/{dataset_name}/embeddings.npy')

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_files = [f for f in os.listdir(f"../data/{dataset_name}/umaps") if re.match(r"umap1d-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1

    # make the umap name from the number, zero padded to 3 digits
    umap_name = f"umap1d-{next_umap_number:03d}"

    # save a json file with the umap parameters
    with open(f'../data/{dataset_name}/umaps/{umap_name}.json', 'w') as f:
        json.dump({"neighbors": neighbors, "min_dist": min_dist}, f)

    reducer = umap.UMAP(
        n_neighbors=neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=42,
        n_components=1,
        verbose=True,
    )

    umap_embeddings = reducer.fit_transform(embeddings)

    min_values = np.min(umap_embeddings, axis=0)
    max_values = np.max(umap_embeddings, axis=0)

    # Scale the embeddings to the range [0, 1]
    umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)

    # Scale the embeddings to the range [-1, 1]
    # umap_embeddings = 2 * umap_embeddings - 1

    # save umap embeddings to a parquet file with columns x,y
    df = pd.DataFrame(umap_embeddings, columns=['x'])
    output_file = f"../data/{dataset_name}/umaps/{umap_name}.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)

    # generate a scatterplot of the umap embeddings and save it to a file
    
    fig, ax = plt.subplots(figsize=(6, 6))
    y_values = np.full(len(umap_embeddings), 0.5)
    plt.scatter(umap_embeddings[:, 0], y=y_values, s=1, alpha=0.5)
    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(f"../data/{dataset_name}/umaps/{umap_name}.png")
    


if __name__ == "__main__":
    dataset_name = sys.argv[1]
    neighbors = int(sys.argv[2])
    min_dist = float(sys.argv[3])
    umapper(dataset_name, neighbors=neighbors, min_dist=min_dist)
