import os
import json
from flask import Blueprint, current_app, jsonify, request

from latentscope.models import get_embedding_model

# Create a Blueprint
search_bp = Blueprint('search_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


# in memory cache of dataset metadata, embeddings, models and tokenizers
DATASETS = {}
DBS = {}
EMBEDDINGS = {}
FEATURES = {}
DATAFRAMES = {}


@search_bp.route('/nn', methods=['GET'])
def nn():
    import h5py
    import numpy as np
    from sklearn.neighbors import NearestNeighbors

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None
    query = request.args.get('query')

    if embedding_id not in EMBEDDINGS:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json"), 'r') as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[dataset + "-" + embedding_id] = model
    else:
        model = EMBEDDINGS[dataset + "-" + embedding_id]

    # If lancedb is available, use it for search
    if scope_id is not None:
        lance_path = os.path.join(DATA_DIR, dataset, "lancedb", scope_id + ".lance")
        if os.path.exists(lance_path):
            return nn_lance(DATA_DIR, dataset, scope_id, model, query, dimensions)

    # Otherwise use sklearn NearestNeighbors
    num = 150
    if dataset not in DATASETS or embedding_id not in DATASETS[dataset]:
        embedding_path = os.path.join(DATA_DIR, dataset, "embeddings", f"{embedding_id}.h5")
        with h5py.File(embedding_path, 'r') as f:
            embeddings = np.array(f["embeddings"])
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        if dataset not in DATASETS:
            DATASETS[dataset] = {}
        DATASETS[dataset][embedding_id] = nne
    else:
        nne = DATASETS[dataset][embedding_id]

    embedding = np.array(model.embed([query], dimensions=dimensions))
    distances, indices = nne.kneighbors(embedding)
    return jsonify(
        indices=indices[0].tolist(),
        distances=distances[0].tolist(),
        search_embedding=embedding.tolist(),
    )


def nn_lance(data_dir, dataset, scope_id, model, query, dimensions):
    import lancedb
    db = lancedb.connect(os.path.join(data_dir, dataset, "lancedb"))
    table = db.open_table(scope_id)
    embedding = model.embed([query], dimensions=dimensions)
    results = table.search(embedding).metric("cosine").select(["index"]).limit(100).to_list()
    indices = [result["index"] for result in results]
    distances = [result["_distance"] for result in results]
    return jsonify(indices=indices, distances=distances, search_embedding=embedding)


@search_bp.route('/feature_summary', methods=['POST'])
def feature_summary():
    dataset = request.args.get('dataset')
    feature_id = request.args.get('feature_id')


@search_bp.route('/feature', methods=['GET'])
def feature():
    import h5py
    import numpy as np

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    sae_id = request.args.get('sae_id')
    feature_id = request.args.get('feature_id')
    threshold = request.args.get('threshold')
    threshold = float(threshold) if threshold is not None else 0.1

    top_n = request.args.get('top_n')
    if top_n is not None:
        top_n = int(top_n)
    if top_n is None:
        top_n = 100

    sae_path = os.path.join(DATA_DIR, dataset, "saes", f"{sae_id}.h5")
    with h5py.File(sae_path, 'r') as f:
        all_top_indices = np.array(f["top_indices"])
        all_top_acts = np.array(f["top_acts"])

    feature_activations = np.zeros(len(all_top_indices))
    for row_idx, (indices, acts) in enumerate(zip(all_top_indices, all_top_acts)):
        feature_mask = indices == int(feature_id)
        if np.any(feature_mask):
            feature_activations[row_idx] = np.max(acts[feature_mask])

    non_zero_mask = feature_activations > 0
    if not np.any(non_zero_mask):
        return jsonify(top_row_indices=[])

    above_threshold_mask = feature_activations > threshold
    if not np.any(above_threshold_mask):
        return jsonify(top_row_indices=[])

    top_row_indices = np.argsort(feature_activations[above_threshold_mask])[::-1]
    actual_indices = np.where(above_threshold_mask)[0][top_row_indices]
    return jsonify(top_row_indices=actual_indices.tolist())


@search_bp.route('/features', methods=['GET'])
def features():
    import h5py
    import numpy as np
    from sklearn.neighbors import NearestNeighbors

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None

    num = 150
    if embedding_id not in EMBEDDINGS:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json"), 'r') as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[embedding_id] = model
    else:
        model = EMBEDDINGS[embedding_id]

    if dataset not in DATASETS or embedding_id not in DATASETS[dataset]:
        embedding_path = os.path.join(DATA_DIR, dataset, "embeddings", f"{embedding_id}.h5")
        with h5py.File(embedding_path, 'r') as f:
            embeddings = np.array(f["embeddings"])
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        if dataset not in DATASETS:
            DATASETS[dataset] = {}
        DATASETS[dataset][embedding_id] = nne
    else:
        nne = DATASETS[dataset][embedding_id]

    query = request.args.get('query')
    embedding = np.array(model.embed([query], dimensions=dimensions))
    distances, indices = nne.kneighbors(embedding)
    return jsonify(
        indices=indices[0].tolist(),
        distances=distances[0].tolist(),
        search_embedding=embedding.tolist(),
    )


@search_bp.route('/compare', methods=['GET'])
def compare():
    import numpy as np
    import pandas as pd

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    umap_left = request.args.get('umap_left')
    umap_right = request.args.get('umap_right')
    metric = request.args.get('metric', 'displacement')
    k = request.args.get('k')
    k = int(k) if k else 10

    umap_dir = os.path.join(DATA_DIR, dataset, "umaps")
    left = pd.read_parquet(os.path.join(umap_dir, f"{umap_left}.parquet")).to_numpy()
    right = pd.read_parquet(os.path.join(umap_dir, f"{umap_right}.parquet")).to_numpy()

    if metric == 'neighborhood':
        from sklearn.neighbors import NearestNeighbors
        nn_left = NearestNeighbors(n_neighbors=k, algorithm='auto').fit(left)
        nn_right = NearestNeighbors(n_neighbors=k, algorithm='auto').fit(right)
        _, idx_left = nn_left.kneighbors(left)
        _, idx_right = nn_right.kneighbors(right)
        scores = np.zeros(len(left))
        for i in range(len(left)):
            set_l = set(idx_left[i])
            set_r = set(idx_right[i])
            jaccard = len(set_l & set_r) / len(set_l | set_r)
            scores[i] = 1 - jaccard  # 0 = same neighborhood, 1 = completely different
        result = scores
    elif metric == 'relative':
        from sklearn.neighbors import NearestNeighbors
        displacement = np.linalg.norm(right - left, axis=1)
        nn_left = NearestNeighbors(n_neighbors=k, algorithm='auto').fit(left)
        _, idx_left = nn_left.kneighbors(left)
        # For each point, subtract the mean displacement of its neighbors
        relative = np.zeros(len(left))
        for i in range(len(left)):
            neighbor_mean = np.mean(displacement[idx_left[i]])
            relative[i] = abs(displacement[i] - neighbor_mean)
        result = relative
    else:
        # Default: absolute displacement (L2)
        result = np.linalg.norm(right - left, axis=1)

    # Normalize to [0, 1]
    min_val = np.min(result)
    max_val = np.max(result)
    if max_val - min_val > 0:
        result = (result - min_val) / (max_val - min_val)
    else:
        result = np.zeros_like(result)

    return jsonify(result.tolist())


@search_bp.route('/compare/neighbors', methods=['GET'])
def compare_neighbors():
    import numpy as np
    import pandas as pd
    from sklearn.neighbors import NearestNeighbors

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    umap_left = request.args.get('umap_left')
    umap_right = request.args.get('umap_right')
    point_index = int(request.args.get('point_index'))
    side = request.args.get('side', 'left')
    k = int(request.args.get('k', 10))

    umap_dir = os.path.join(DATA_DIR, dataset, "umaps")
    left = pd.read_parquet(os.path.join(umap_dir, f"{umap_left}.parquet")).to_numpy()
    right = pd.read_parquet(os.path.join(umap_dir, f"{umap_right}.parquet")).to_numpy()

    # Find k-NN based on which side was clicked
    source = left if side == 'left' else right
    nn = NearestNeighbors(n_neighbors=k + 1, algorithm='auto').fit(source)
    _, indices = nn.kneighbors([source[point_index]])
    # Remove the point itself from neighbors
    neighbor_indices = [int(i) for i in indices[0] if i != point_index][:k]

    return jsonify({
        "point_index": point_index,
        "side": side,
        "neighbor_indices": neighbor_indices,
    })


@search_bp.route('/compare-clusters', methods=['GET'])
def compare_clusters():
    import numpy as np
    import pandas as pd

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    cluster_left = request.args.get('cluster_left')
    cluster_right = request.args.get('cluster_right')

    if not all([dataset, cluster_left, cluster_right]):
        return jsonify({"error": "Missing required parameters"}), 400

    cluster_dir = os.path.join(DATA_DIR, dataset, "clusters")

    # Load cluster metadata to verify same UMAP
    with open(os.path.join(cluster_dir, f"{cluster_left}.json"), 'r') as f:
        meta_left = json.load(f)
    with open(os.path.join(cluster_dir, f"{cluster_right}.json"), 'r') as f:
        meta_right = json.load(f)

    if meta_left["umap_id"] != meta_right["umap_id"]:
        return jsonify({"error": "Clusters must be on the same UMAP"}), 400

    # Load cluster assignments
    left_df = pd.read_parquet(os.path.join(cluster_dir, f"{cluster_left}.parquet"))
    right_df = pd.read_parquet(os.path.join(cluster_dir, f"{cluster_right}.parquet"))
    labels_left = left_df['cluster'].to_numpy()
    labels_right = right_df['cluster'].to_numpy()

    if len(labels_left) != len(labels_right):
        return jsonify({"error": "Cluster assignments have different lengths"}), 400

    from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

    ari = float(adjusted_rand_score(labels_left, labels_right))
    nmi = float(normalized_mutual_info_score(labels_left, labels_right))

    # Build overlap matrix
    left_clusters = sorted(np.unique(labels_left).tolist())
    right_clusters = sorted(np.unique(labels_right).tolist())
    left_idx_map = {c: i for i, c in enumerate(left_clusters)}
    right_idx_map = {c: i for i, c in enumerate(right_clusters)}

    matrix = np.zeros((len(left_clusters), len(right_clusters)), dtype=int)
    for i in range(len(labels_left)):
        li = left_idx_map[labels_left[i]]
        ri = right_idx_map[labels_right[i]]
        matrix[li][ri] += 1

    # Equivalence map: for each left cluster, the right cluster with max overlap
    equivalence_map = {}
    for i, lc in enumerate(left_clusters):
        best_right_idx = int(np.argmax(matrix[i]))
        equivalence_map[str(lc)] = right_clusters[best_right_idx]

    # Changed indices: points whose right cluster != equivalent of their left cluster
    changed_indices = []
    for i in range(len(labels_left)):
        expected_right = equivalence_map[str(labels_left[i])]
        if labels_right[i] != expected_right:
            changed_indices.append(i)

    return jsonify({
        "ari": round(ari, 4),
        "nmi": round(nmi, 4),
        "overlap_matrix": matrix.tolist(),
        "left_clusters": left_clusters,
        "right_clusters": right_clusters,
        "changed_indices": changed_indices,
        "n_changed": len(changed_indices),
        "n_total": len(labels_left),
        "equivalence_map": equivalence_map,
        "umap_id": meta_left["umap_id"],
    })
