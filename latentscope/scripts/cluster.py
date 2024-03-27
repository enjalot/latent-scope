# Usage: python cluster.py <dataset_id> <umap_id> <samples> <min_samples>
# Example: python cluster.py dadabase-curated umap-001 50 5
import os
import re
import sys
import json
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

from latentscope.util import get_data_dir

# TODO move this into shared space
def calculate_point_size(num_points, min_size=10, max_size=30, base_num_points=100):
    import numpy as np
    """
    Calculate the size of points for a scatter plot based on the number of points.
    """
    # TODO fix this to actually calculate a log scale between min and max size
    if num_points <= base_num_points:
        return max_size
    else:
        return min(min_size + min_size * np.log(num_points / base_num_points), max_size)


def main():
    parser = argparse.ArgumentParser(description='Cluster UMAP embeddings')
    parser.add_argument('dataset_id', type=str, help='ID of the dataset')
    parser.add_argument('umap_id', type=str, help='ID of the UMAP file')
    parser.add_argument('samples', type=int, help='Minimum cluster size')
    parser.add_argument('min_samples', type=int, help='Minimum samples for HDBSCAN')
    parser.add_argument('cluster_selection_epsilon', type=float, help='Cluster selection Epsilon', default=0)
    
    args = parser.parse_args()
    clusterer(args.dataset_id, args.umap_id, args.samples, args.min_samples, args.cluster_selection_epsilon)


def clusterer(dataset_id, umap_id, samples, min_samples, cluster_selection_epsilon):
    DATA_DIR = get_data_dir()
    cluster_dir = os.path.join(DATA_DIR, dataset_id, "clusters")
    # Check if clusters directory exists, if not, create it
    if not os.path.exists(cluster_dir):
        os.makedirs(cluster_dir)
    # determine the index of the last cluster run by looking in the dataset directory
    # for files named umap-<number>.json
    cluster_files = [f for f in os.listdir(cluster_dir) if re.match(r"cluster-\d+\.json", f)]
    if len(cluster_files) > 0:
        last_cluster = sorted(cluster_files)[-1]
        last_cluster_number = int(last_cluster.split("-")[1].split(".")[0])
        next_cluster_number = last_cluster_number + 1
    else:
        next_cluster_number = 1

    # make the umap name from the number, zero padded to 3 digits
    cluster_id = f"cluster-{next_cluster_number:03d}"
    print("RUNNING:", cluster_id)

    import hdbscan
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt
    from scipy.spatial import ConvexHull
    from scipy.spatial.distance import cdist

    umap_embeddings_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "umaps", f"{umap_id}.parquet"))
    umap_embeddings = umap_embeddings_df.to_numpy()

    clusterer = hdbscan.HDBSCAN(min_cluster_size=samples, min_samples=min_samples, metric='euclidean', cluster_selection_epsilon=cluster_selection_epsilon)
    clusterer.fit(umap_embeddings)

    # Get the cluster labels
    cluster_labels = clusterer.labels_
    # copy cluster labels to another array
    raw_cluster_labels = cluster_labels.copy()

    # Determine points with no assigned cluster
    unique_labels = np.unique(cluster_labels)
    non_noise_labels = unique_labels[unique_labels != -1]
    centroids = [umap_embeddings[cluster_labels == label].mean(axis=0) for label in non_noise_labels]

    # TODO: look into soft clustering
    # https://hdbscan.readthedocs.io/en/latest/soft_clustering.html
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
    output_file = os.path.join(cluster_dir, f"{cluster_id}.parquet")
    df.to_parquet(output_file)
    print(df.head())
    print("wrote", output_file)

    # generate a scatterplot of the umap embeddings and save it to a file
    fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px by 1024px at 72 dpi
    point_size = calculate_point_size(umap_embeddings.shape[0])
    print("POINT SIZE", point_size, "for", umap_embeddings.shape[0], "points")
    plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5, c=cluster_labels, cmap='Spectral')
    # plot a convex hull around each cluster
    hulls = []
    for label in non_noise_labels:
        indices = np.where(cluster_labels == label)[0]
        points = umap_embeddings[indices]
        # points = umap_embeddings[cluster_labels == label]
        hull = ConvexHull(points)
        hull_list = [indices[s] for s in hull.vertices.tolist()]
        hulls.append(hull_list)
        for simplex in hull.simplices:
            plt.plot(points[simplex, 0], points[simplex, 1], 'k-')

    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(os.path.join(cluster_dir, f"{cluster_id}.png"))

    with open(os.path.join(cluster_dir,f"{cluster_id}.json"), 'w') as f:
        json.dump({
            "id": cluster_id,
            "umap_id": umap_id, 
            "samples": samples, 
            "min_samples": min_samples,
            "cluster_selection_epsilon": cluster_selection_epsilon,
            "n_clusters": len(non_noise_labels),
            "n_noise": len(noise_points)
        }, f, indent=2)
    f.close()

    # create the data structure for labeling clusters
    # get the indices of each item in a cluster
    cluster_indices = df.groupby('cluster').groups

    # iterate over the clusters and create a row for each in a new dataframe with a label, description and array of indicies
    slides_df = pd.DataFrame(columns=['label', 'description', 'indices'])
    for cluster, indices in tqdm(cluster_indices.items()):
        label = f"Cluster {cluster}"
        description = f"This is cluster {cluster} with {len(indices)} items."
        new_row = pd.DataFrame({'label': [label], 'description': [description], 'indices': [list(indices)], 'hull': [hulls[cluster]]})
        slides_df = pd.concat([slides_df, new_row], ignore_index=True)

    # write the df to parquet
    slides_df.to_parquet(os.path.join(cluster_dir, f"{cluster_id}-labels-default.parquet"))
    print("done with", cluster_id)

if __name__ == "__main__":
    main()