# Usage: python cluster.py <dataset_id> <umap_id> <samples> <min_samples>
# Example: python cluster.py dadabase-curated umap-001 50 5
import argparse
import json
import os
import re
import sys

try:
    # Check if the runtime environment is a Jupyter notebook
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError:
    # Fallback to the standard console version if import fails
    from tqdm import tqdm

from latentscope.util import get_data_dir
from latentscope.util.device import resolve_device


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
    parser.add_argument('samples', type=int,
                        help='Minimum cluster size (evoc/hdbscan) or number of '
                             'clusters (kmeans/gmm)')
    parser.add_argument('min_samples', type=int, help='Minimum samples for HDBSCAN')
    parser.add_argument('cluster_selection_epsilon', type=float, help='Cluster selection Epsilon', default=0)
    parser.add_argument('column', type=str, nargs='?', help='Use column as cluster labels', default=None)
    parser.add_argument('--method', type=str, default='evoc',
                        choices=['evoc', 'hdbscan', 'kmeans', 'gmm'],
                        help='Clustering method (default: evoc)')
    parser.add_argument('--cluster_on', type=str, default=None,
                        choices=['umap', 'embedding'],
                        help='Input space to cluster on. Default (None) preserves '
                             'per-method behavior: evoc->embedding, '
                             'hdbscan/kmeans/gmm->umap.')
    parser.add_argument('--n_neighbors', type=int, default=15,
                        help='Number of neighbors for EVoC kNN graph (default: 15)')
    parser.add_argument('--noise_level', type=float, default=0.5,
                        help='EVoC noise level 0.0-1.0 (default: 0.5)')
    parser.add_argument('--approx_n_clusters', type=int, default=None,
                        help='EVoC: aim for approximately this many clusters '
                             '(picks the closest cluster layer)')
    parser.add_argument('--name', type=str, default=None,
                        help='Human-friendly title for this cluster run')
    parser.add_argument('--description', type=str, default=None,
                        help='Free-text description for this cluster run')

    args = parser.parse_args()
    clusterer(args.dataset_id, args.umap_id, args.samples, args.min_samples,
              args.cluster_selection_epsilon, args.column,
              method=args.method, cluster_on=args.cluster_on,
              n_neighbors=args.n_neighbors, noise_level=args.noise_level,
              approx_n_clusters=args.approx_n_clusters,
              name=args.name, description=args.description)


def _load_embeddings(dataset_id, embedding_id):
    """Load raw embedding vectors for a dataset (LanceDB with HDF5 fallback)."""
    from latentscope.util.embedding_store import load_embeddings

    DATA_DIR = get_data_dir()
    return load_embeddings(DATA_DIR, dataset_id, embedding_id)


def _as_numpy_labels(labels):
    """Coerce cluster labels from cuML/cudf/cupy (or numpy) into a numpy array."""
    import numpy as np

    if hasattr(labels, 'to_numpy'):  # cudf.Series / pandas.Series
        labels = labels.to_numpy()
    elif hasattr(labels, 'get'):  # cupy.ndarray
        labels = labels.get()
    return np.asarray(labels)


def _evoc_node_embedding_dim(n_features, n_neighbors):
    """Cap EVoC's internal node-embedding dimension on low-dimensional input.

    EVoC PCA-initializes its node embedding with min(max(n_neighbors // 4, 4), 15)
    components; when the clustering input has fewer features than that (e.g. the
    2-D umap with --cluster_on umap) PCA raises ValueError. Return the feature
    count in that case, or None to keep EVoC's default.
    """
    default_dim = min(max(n_neighbors // 4, 4), 15)
    if n_features < default_dim:
        return n_features
    return None


def _run_evoc(embeddings, samples, n_neighbors=15, noise_level=0.5, approx_n_clusters=None):
    """Run EVoC clustering on the input vectors (always CPU — no cuML equivalent)."""
    import evoc
    kwargs = {}
    node_dim = _evoc_node_embedding_dim(embeddings.shape[1], n_neighbors)
    if node_dim is not None:
        kwargs['node_embedding_dim'] = node_dim
    if approx_n_clusters is not None:
        kwargs['approx_n_clusters'] = approx_n_clusters
    print(f"Running EVoC clustering with base_min_cluster_size={samples}, "
          f"n_neighbors={n_neighbors}, noise_level={noise_level}"
          + (f", {kwargs}" if kwargs else ""))
    clusterer = evoc.EVoC(
        base_min_cluster_size=samples,
        n_neighbors=n_neighbors,
        noise_level=noise_level,
        **kwargs,
    )
    labels = clusterer.fit_predict(embeddings)
    return labels


def _run_hdbscan(embeddings, samples, min_samples, cluster_selection_epsilon, use_cuml=False):
    """Run HDBSCAN clustering, on the GPU (cuML) when available, else CPU."""
    import numpy as np

    if use_cuml:
        try:
            from cuml.cluster import HDBSCAN as cuHDBSCAN
            print(f"Running cuML HDBSCAN clustering with min_cluster_size={samples}, "
                  f"min_samples={min_samples}, epsilon={cluster_selection_epsilon}")
            clusterer = cuHDBSCAN(
                min_cluster_size=samples,
                min_samples=min_samples,
                metric='euclidean',
                cluster_selection_epsilon=cluster_selection_epsilon,
            )
            clusterer.fit(np.asarray(embeddings, dtype=np.float32))
            return _as_numpy_labels(clusterer.labels_)
        except Exception as e:
            print(f"cuML HDBSCAN failed ({e}); falling back to CPU hdbscan")

    import hdbscan
    print(f"Running HDBSCAN clustering with min_cluster_size={samples}, min_samples={min_samples}, epsilon={cluster_selection_epsilon}")
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=samples,
        min_samples=min_samples,
        metric='euclidean',
        cluster_selection_epsilon=cluster_selection_epsilon,
    )
    clusterer.fit(embeddings)
    return clusterer.labels_


def _run_kmeans(embeddings, n_clusters, use_cuml=False):
    """Run KMeans clustering, on the GPU (cuML) when available, else sklearn.

    ``n_clusters`` is mapped from the ``samples`` positional CLI argument.
    """
    import numpy as np

    if use_cuml:
        try:
            from cuml.cluster import KMeans as cuKMeans
            print(f"Running cuML KMeans clustering with n_clusters={n_clusters}")
            km = cuKMeans(n_clusters=n_clusters, random_state=42)
            labels = km.fit_predict(np.asarray(embeddings, dtype=np.float32))
            return _as_numpy_labels(labels)
        except Exception as e:
            print(f"cuML KMeans failed ({e}); falling back to sklearn KMeans")

    from sklearn.cluster import KMeans
    print(f"Running KMeans clustering with n_clusters={n_clusters} (sklearn/CPU)")
    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    return km.fit_predict(embeddings)


def _run_gmm(embeddings, n_clusters):
    """Run Gaussian Mixture Model clustering (sklearn/CPU — no stable cuML equivalent).

    ``n_clusters`` (number of mixture components) is mapped from the ``samples``
    positional CLI argument.
    """
    from sklearn.mixture import GaussianMixture
    print(f"Running GMM clustering with n_components={n_clusters} (sklearn/CPU)")
    gmm = GaussianMixture(n_components=n_clusters, random_state=42)
    return gmm.fit_predict(embeddings)


def clusterer(dataset_id, umap_id, samples, min_samples, cluster_selection_epsilon, column,
              method='evoc', cluster_on=None, n_neighbors=15, noise_level=0.5,
              approx_n_clusters=None, name=None, description=None):
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

    # Resolve compute backend once; branch on res.use_cuml per method below.
    res = resolve_device()

    # Resolve the effective input space to cluster on. None preserves today's
    # per-method behavior: evoc clusters on high-dim embeddings, everything else
    # on the 2D umap projection. The effective value is always recorded in the
    # cluster meta JSON (CONTRACT §2).
    if cluster_on is None:
        effective_cluster_on = 'embedding' if method == 'evoc' else 'umap'
    else:
        effective_cluster_on = cluster_on
    print(f"cluster_on: {effective_cluster_on} (method={method})")

    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    from scipy.spatial import ConvexHull
    from scipy.spatial.distance import cdist

    umap_embeddings_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "umaps", f"{umap_id}.parquet"))
    # Extract x,y columns into numpy array with shape (n,2). This 2D projection
    # is always used for plotting, hulls and noise reassignment regardless of
    # which space we cluster on.
    umap_embeddings = np.column_stack((umap_embeddings_df['x'], umap_embeddings_df['y']))

    if column is not None:
        input_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))
        # use the column as the cluster labels
        cluster_labels = input_df[column].to_numpy()
    else:
        # Choose the input matrix to cluster on.
        if effective_cluster_on == 'embedding':
            # Look up embedding_id from the UMAP metadata and load high-dim vectors.
            with open(os.path.join(DATA_DIR, dataset_id, "umaps", f"{umap_id}.json")) as f:
                umap_meta = json.load(f)
            embedding_id = umap_meta['embedding_id']
            print(f"Loading embeddings from {embedding_id}")
            cluster_input = _load_embeddings(dataset_id, embedding_id)
        else:
            cluster_input = umap_embeddings

        if method == 'evoc':
            cluster_labels = _run_evoc(cluster_input, samples,
                                       n_neighbors=n_neighbors, noise_level=noise_level,
                                       approx_n_clusters=approx_n_clusters)
        elif method == 'kmeans':
            cluster_labels = _run_kmeans(cluster_input, samples, use_cuml=res.use_cuml)
        elif method == 'gmm':
            cluster_labels = _run_gmm(cluster_input, samples)
        else:  # hdbscan
            cluster_labels = _run_hdbscan(cluster_input, samples, min_samples,
                                          cluster_selection_epsilon, use_cuml=res.use_cuml)

    # copy cluster labels to another array
    raw_cluster_labels = cluster_labels.copy()

    # Determine points with no assigned cluster
    unique_labels = np.unique(cluster_labels)
    non_noise_labels = unique_labels[unique_labels != -1]
    centroids = [umap_embeddings[cluster_labels == label].mean(axis=0) for label in non_noise_labels]

    # Assign noise points to the closest cluster centroid. kmeans/gmm never emit
    # -1, so noise_points is empty and this block cleanly no-ops for them.
    noise_points = umap_embeddings[cluster_labels == -1]
    if non_noise_labels.shape[0] > 0 and noise_points.shape[0] > 0:
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
    # Compute convex hulls around each cluster on the UMAP 2D coordinates.
    # Hulls are only spatially meaningful when we clustered on the 2D umap
    # projection (hdbscan/kmeans/gmm default). When clustering on high-dim
    # embeddings (evoc default) the clusters may be scattered across the 2D
    # projection, so convex hulls are not meaningful — skip them.
    hulls_by_label = {}
    compute_hulls = (effective_cluster_on == 'umap')
    for label in non_noise_labels:
        indices = np.where(cluster_labels == label)[0]
        points = umap_embeddings[indices]
        if not compute_hulls or len(points) < 3:
            hulls_by_label[label] = []
            continue
        try:
            hull = ConvexHull(points)
            hull_list = [indices[s] for s in hull.vertices.tolist()]
            hulls_by_label[label] = hull_list
            for simplex in hull.simplices:
                plt.plot(points[simplex, 0], points[simplex, 1], 'k-')
        except Exception:
            hulls_by_label[label] = []

    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(os.path.join(cluster_dir, f"{cluster_id}.png"))

    # Build metadata - include method-specific params
    meta = {
        "id": cluster_id,
        "umap_id": umap_id,
        "method": method,
        "cluster_on": effective_cluster_on,
        "samples": samples,
        "min_samples": min_samples,
        "cluster_selection_epsilon": cluster_selection_epsilon,
        "n_clusters": len(non_noise_labels),
        "n_noise": len(noise_points),
    }
    if method == 'evoc':
        meta["n_neighbors"] = n_neighbors
        meta["noise_level"] = noise_level
        if approx_n_clusters is not None:
            meta["approx_n_clusters"] = approx_n_clusters
    if name is not None:
        meta["name"] = name
    if description is not None:
        meta["description"] = description

    with open(os.path.join(cluster_dir, f"{cluster_id}.json"), 'w') as f:
        json.dump(meta, f, indent=2)

    # create the data structure for labeling clusters
    # get the indices of each item in a cluster
    cluster_indices = df.groupby('cluster').groups

    # iterate over the clusters and create a row for each in a new dataframe with a label, description and array of indicies
    slides_df = pd.DataFrame(columns=['label', 'description', 'indices'])
    for cluster_label, indices in tqdm(cluster_indices.items()):
        label = f"Cluster {cluster_label}"
        description = f"This is cluster {cluster_label} with {len(indices)} items."
        hull = hulls_by_label.get(cluster_label, [])
        new_row = pd.DataFrame({'label': [label], 'description': [description], 'indices': [list(indices)], 'hull': [hull]})
        slides_df = pd.concat([slides_df, new_row], ignore_index=True)

    # write the df to parquet
    slides_df.to_parquet(os.path.join(cluster_dir, f"{cluster_id}-labels-default.parquet"))
    print("done with", cluster_id)

if __name__ == "__main__":
    main()
