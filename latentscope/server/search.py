import json
import os

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
    import numpy as np

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None
    query = request.args.get('query')
    use_late_interaction = request.args.get('late_interaction', 'false').lower() == 'true'

    cache_key = dataset + "-" + embedding_id
    if cache_key not in EMBEDDINGS:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")) as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[cache_key] = model
    else:
        model = EMBEDDINGS[cache_key]

    # Check if late interaction search is requested and supported
    is_late_interaction = getattr(model, 'late_interaction', False)
    embedding_meta_path = os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")
    with open(embedding_meta_path) as f:
        emb_meta = json.load(f)
    has_token_vecs = emb_meta.get('late_interaction', False)

    if use_late_interaction and is_late_interaction and has_token_vecs:
        return nn_late_interaction(DATA_DIR, dataset, embedding_id, model, query, dimensions)

    # If lancedb is available, use it for search (scope-level table)
    if scope_id is not None:
        lance_path = os.path.join(DATA_DIR, dataset, "lancedb", scope_id + ".lance")
        if os.path.exists(lance_path):
            return nn_lance(DATA_DIR, dataset, scope_id, model, query, dimensions)

    # Try embedding-level LanceDB table first
    from latentscope.util.embedding_store import get_embedding_count, search_nn
    try:
        count = get_embedding_count(DATA_DIR, dataset, embedding_id)
        if count > 0:
            embedding = np.array(model.embed([query], dimensions=dimensions))
            query_vec = embedding[0] if embedding.ndim > 1 else embedding
            indices, distances = search_nn(
                DATA_DIR, dataset, embedding_id, query_vec, limit=150
            )
            return jsonify(
                indices=indices,
                distances=distances,
                search_embedding=embedding.tolist(),
            )
    except Exception:
        pass  # Fall through to sklearn

    # Fallback: sklearn NearestNeighbors with HDF5 or LanceDB-loaded embeddings
    import h5py
    from sklearn.neighbors import NearestNeighbors

    from latentscope.util.embedding_store import load_embeddings as lance_load

    num = 150
    if dataset not in DATASETS or embedding_id not in DATASETS[dataset]:
        embeddings = lance_load(DATA_DIR, dataset, embedding_id)
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


def nn_late_interaction(data_dir, dataset, embedding_id, model, query, dimensions):
    """Late interaction (MaxSim) search using per-token embeddings."""
    import numpy as np

    from latentscope.util.embedding_store import search_late_interaction

    # Get per-token query embeddings
    _, query_token_vectors = model.embed_multi([query], dimensions=dimensions)
    query_tokens = query_token_vectors[0]  # (Q, D)

    # Also get the mean embedding for the response
    mean_embedding = query_tokens.mean(axis=0)
    mean_embedding = mean_embedding / (np.linalg.norm(mean_embedding) + 1e-10)

    indices, scores = search_late_interaction(
        data_dir, dataset, embedding_id,
        query_tokens, prefilter_limit=200, final_limit=100,
    )

    return jsonify(
        indices=indices,
        distances=scores,
        search_embedding=mean_embedding.tolist(),
        search_type="late_interaction",
    )


@search_bp.route('/feature_summary', methods=['POST'])
def feature_summary():
    request.args.get('dataset')
    request.args.get('feature_id')


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
    import numpy as np
    from sklearn.neighbors import NearestNeighbors

    from latentscope.util.embedding_store import load_embeddings as lance_load

    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None

    num = 150
    if embedding_id not in EMBEDDINGS:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")) as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[embedding_id] = model
    else:
        model = EMBEDDINGS[embedding_id]

    if dataset not in DATASETS or embedding_id not in DATASETS[dataset]:
        embeddings = lance_load(DATA_DIR, dataset, embedding_id)
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
    # Clamp k to dataset size to avoid sklearn error
    k = min(k, len(source) - 1)
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
