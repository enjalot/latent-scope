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
    k = request.args.get('k')
    k = int(k) if k else 5

    umap_dir = os.path.join(DATA_DIR, dataset, "umaps")
    left = pd.read_parquet(os.path.join(umap_dir, f"{umap_left}.parquet")).to_numpy()
    right = pd.read_parquet(os.path.join(umap_dir, f"{umap_right}.parquet")).to_numpy()

    absolute_displacement = np.linalg.norm(right - left, axis=1)
    min_abs = np.min(absolute_displacement)
    max_abs = np.max(absolute_displacement)
    if max_abs - min_abs > 0:
        absolute_displacement = (absolute_displacement - min_abs) / (max_abs - min_abs)
    else:
        absolute_displacement = np.zeros_like(absolute_displacement)

    return jsonify(absolute_displacement.tolist())
