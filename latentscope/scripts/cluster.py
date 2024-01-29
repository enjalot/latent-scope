# Usage: python cluster.py <dataset_name> <umap_name> <samples> <min_samples>
# Example: python cluster.py dadabase-curated umap-001 50 5
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


def clusterer(dataset_name, umap_name, samples, min_samples):
    # Check if clusters directory exists, if not, create it
    if not os.path.exists(f'../data/{dataset_name}/clusters'):
        os.makedirs(f'../data/{dataset_name}/clusters')
    # determine the index of the last cluster run by looking in the dataset directory
    # for files named umap-<number>.json
    cluster_files = [f for f in os.listdir(f"../data/{dataset_name}/clusters") if re.match(r"cluster-\d+\.json", f)]
    print("cluster files", sorted(cluster_files))
    if len(cluster_files) > 0:
        last_cluster = sorted(cluster_files)[-1]
        last_cluster_number = int(last_cluster.split("-")[1].split(".")[0])
        print("lastcluster", last_cluster, last_cluster_number)
        next_cluster_number = last_cluster_number + 1
    else:
        next_cluster_number = 1

    # make the umap name from the number, zero padded to 3 digits
    cluster_name = f"cluster-{next_cluster_number:03d}"

    umap_embeddings_df = pd.read_parquet(f"../data/{dataset_name}/umaps/{umap_name}.parquet")
    umap_embeddings = umap_embeddings_df.to_numpy()

    clusterer = hdbscan.HDBSCAN(min_cluster_size=samples, min_samples=min_samples, metric='euclidean')
    clusterer.fit(umap_embeddings)

    # Get the cluster labels
    cluster_labels = clusterer.labels_
    # copy cluster labels to another array
    raw_cluster_labels = cluster_labels.copy()

    # Determine points with no assigned cluster
    unique_labels = np.unique(cluster_labels)
    non_noise_labels = unique_labels[unique_labels != -1]
    centroids = [umap_embeddings[cluster_labels == label].mean(axis=0) for label in non_noise_labels]

    # Assign noise points to the closest cluster centroid
    noise_points = umap_embeddings[cluster_labels == -1]
    if(non_noise_labels.shape[0] > 0):
      closest_centroid_indices = np.argmin(cdist(noise_points, centroids), axis=1)

      # Update cluster_labels with the new assignments for noise points
      noise_indices = np.where(cluster_labels == -1)[0]
      new_assignments = [non_noise_labels[index] for index in closest_centroid_indices]
      cluster_labels[noise_indices] = new_assignments

    
    print("n_clusters:", len(non_noise_labels))
    print("noise points assigned to clusters:", len(noise_points))

    # save umap embeddings to a parquet file with columns x,y
    df = pd.DataFrame({"cluster": cluster_labels, "raw_cluster": raw_cluster_labels})
    output_file = f"../data/{dataset_name}/clusters/{cluster_name}.parquet"
    df.to_parquet(output_file)
    print(df.head())
    print("wrote", output_file)

    # generate a scatterplot of the umap embeddings and save it to a file
    fig, ax = plt.subplots(figsize=(6, 6))
    plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=1, alpha=0.5, c=cluster_labels, cmap='Spectral')
    # plot a convex hull around each cluster
    for label in non_noise_labels:
        points = umap_embeddings[cluster_labels == label]
        hull = ConvexHull(points)
        for simplex in hull.simplices:
            plt.plot(points[simplex, 0], points[simplex, 1], 'k-')

    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(f"../data/{dataset_name}/clusters/{cluster_name}.png")

    with open(f'../data/{dataset_name}/clusters/{cluster_name}.json', 'w') as f:
        json.dump({
            "cluster_name": cluster_name,
            "umap_name": umap_name, 
            "samples": samples, 
            "min_samples": min_samples,
            "n_clusters": len(non_noise_labels),
            "n_noise": len(noise_points)
        }, f, indent=2)
    f.close()

    # create the data structure for labeling clusters
    # get the indices of each item in a cluster
    cluster_indices = df.groupby('cluster').groups

    # iterate over the clusters and create a row for each in a new dataframe with a label, description and array of indicies
    slides_df = pd.DataFrame(columns=['label', 'description', 'indices'])
    for cluster, indices in cluster_indices.items():
        label = f"Cluster {cluster}"
        description = f"This is cluster {cluster} with {len(indices)} items."
        new_row = pd.DataFrame({'label': [label], 'description': [description], 'indices': [list(indices)]})
        slides_df = pd.concat([slides_df, new_row], ignore_index=True)

    # write the df to parquet
    slides_df.to_parquet(f"../data/{dataset_name}/clusters/{cluster_name}-labels.parquet")
    print("done")

if __name__ == "__main__":
    dataset_name = sys.argv[1]
    umap_name = sys.argv[2]
    samples = int(sys.argv[3])
    min_samples = int(sys.argv[4])
    clusterer(dataset_name, umap_name, samples, min_samples)
