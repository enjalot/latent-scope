import json
import os

from flask import Blueprint, current_app, jsonify, request

from latentscope.models import get_embedding_model
from latentscope.server.job_utils import _safe_dataset
from latentscope.util.lru import LRUCache

# Create a Blueprint
search_bp = Blueprint('search_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


# Bounded in-memory caches. Embedding models can pin GPU memory and fitted
# NearestNeighbors objects hold a full copy of the embedding matrix, so both
# are capped; evicted entries are simply dropped (CUDA memory is freed when
# the model object is garbage collected).
EMBEDDINGS = LRUCache(maxsize=2)  # loaded embedding models
NN_CACHE = LRUCache(maxsize=2)  # fitted sklearn NearestNeighbors, keyed (dataset, embedding_id)

# UMAP comparison caches. The Compare page hits /compare and /compare/neighbors
# repeatedly (on every metric/k change and every point click); previously each
# call re-read both umap parquets and refit a fresh NearestNeighbors index over
# all N points. These caches make the coordinates and the fitted kNN a shared,
# reusable resource so repeat clicks are effectively instant.
UMAP_COORDS = LRUCache(maxsize=6)  # (N,2) float32 coords, keyed (dataset, umap_id)
UMAP_KNN = LRUCache(maxsize=6)  # (NearestNeighbors, neighbor_idx matrix), keyed (dataset, umap_id, k)


def _umap_coords(dataset, umap_id):
    """Load a umap's (N, 2) float32 coordinate array, cached by (dataset, umap).

    Reads only the ``x``/``y`` columns so extra columns (should they ever be
    written alongside) can't change the array shape the metrics rely on.
    """
    import pandas as pd

    key = (dataset, umap_id)
    coords = UMAP_COORDS.get(key)
    if coords is None:
        DATA_DIR = _data_dir()
        path = os.path.join(DATA_DIR, dataset, "umaps", f"{umap_id}.parquet")
        df = pd.read_parquet(path, columns=["x", "y"])
        coords = df.to_numpy(dtype="float32")
        UMAP_COORDS[key] = coords
    return coords


def _umap_knn(dataset, umap_id, k):
    """Fit (once) and cache a NearestNeighbors index + neighbor-index matrix.

    Returns ``(nn, neighbor_idx)`` where ``neighbor_idx`` is an ``(N, k+1)``
    array of each point's own index followed by its k nearest neighbors (the
    self-match at column 0 is kept so callers can strip it or reuse it). Keyed
    by ``(dataset, umap_id, k)`` so changing only k on the other side is cheap.
    """
    from sklearn.neighbors import NearestNeighbors

    key = (dataset, umap_id, k)
    cached = UMAP_KNN.get(key)
    if cached is None:
        coords = _umap_coords(dataset, umap_id)
        n_neighbors = min(k + 1, len(coords))
        nn = NearestNeighbors(n_neighbors=n_neighbors, algorithm="auto").fit(coords)
        _, neighbor_idx = nn.kneighbors(coords)
        cached = (nn, neighbor_idx)
        UMAP_KNN[key] = cached
    return cached


@search_bp.route('/nn', methods=['GET'])
def nn():
    import numpy as np

    DATA_DIR = _data_dir()
    dataset = _safe_dataset(request.args.get('dataset'))
    scope_id = request.args.get('scope_id')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None
    query = request.args.get('query')
    # Late interaction (MaxSim over stored token vectors) is the point of a
    # ColBERT-style embedding, so it's the default whenever the embedding
    # supports it. Pass late_interaction=false to force mean-vector ANN.
    use_late_interaction = request.args.get('late_interaction', 'true').lower() == 'true'

    cache_key = dataset + "-" + embedding_id
    model = EMBEDDINGS.get(cache_key)
    if model is None:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")) as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[cache_key] = model

    # Check if late interaction search is requested and supported
    is_late_interaction = getattr(model, 'late_interaction', False)
    embedding_meta_path = os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")
    with open(embedding_meta_path) as f:
        emb_meta = json.load(f)
    has_token_vecs = emb_meta.get('late_interaction', False)

    # A scoped request must stay within its scope. The scope-level LanceDB
    # table holds only the rows in that scope, so it has to take precedence
    # over the MaxSim default below — otherwise a ColBERT embedding would fall
    # into nn_late_interaction(), which searches the full token table and
    # returns global indices outside the current scope (the UI has no way to
    # pass late_interaction=false for that path). Scoped late-interaction
    # therefore degrades to mean-vector ANN within the scope, which is correct
    # if less precise than global MaxSim.
    if scope_id is not None:
        lance_path = os.path.join(DATA_DIR, dataset, "lancedb", scope_id + ".lance")
        if os.path.exists(lance_path):
            return nn_lance(DATA_DIR, dataset, scope_id, model, query, dimensions)

    if use_late_interaction and is_late_interaction and has_token_vecs:
        return nn_late_interaction(DATA_DIR, dataset, embedding_id, model, query, dimensions)

    # Try embedding-level LanceDB table. Only the existence check is guarded:
    # once a table exists this path is always taken, so an embed/search error
    # surfaces instead of silently degrading to the full-matrix sklearn
    # fallback below.
    from latentscope.util.embedding_store import get_embedding_count, search_nn
    try:
        count = get_embedding_count(DATA_DIR, dataset, embedding_id)
    except Exception:
        count = 0
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

    # Fallback: legacy HDF5-era embeddings (no lance table) — fit sklearn
    # NearestNeighbors over the full embedding matrix, cached with an LRU cap.
    from sklearn.neighbors import NearestNeighbors

    from latentscope.util.embedding_store import load_embeddings as lance_load

    num = 150
    nn_key = (dataset, embedding_id)
    nne = NN_CACHE.get(nn_key)
    if nne is None:
        embeddings = lance_load(DATA_DIR, dataset, embedding_id)
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        NN_CACHE[nn_key] = nne

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
    _, query_token_vectors = model.embed_multi([query], dimensions=dimensions, is_query=True)
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
    dataset = _safe_dataset(request.args.get('dataset'))
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
    dataset = _safe_dataset(request.args.get('dataset'))
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None

    num = 150
    model = EMBEDDINGS.get(embedding_id)
    if model is None:
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json")) as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[embedding_id] = model

    nn_key = (dataset, embedding_id)
    nne = NN_CACHE.get(nn_key)
    if nne is None:
        embeddings = lance_load(DATA_DIR, dataset, embedding_id)
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        NN_CACHE[nn_key] = nne

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

    dataset = _safe_dataset(request.args.get('dataset'))
    umap_left = request.args.get('umap_left')
    umap_right = request.args.get('umap_right')
    metric = request.args.get('metric', 'displacement')
    k = request.args.get('k')
    k = int(k) if k else 10

    left = _umap_coords(dataset, umap_left)
    right = _umap_coords(dataset, umap_right)

    if metric == 'neighborhood':
        # Jaccard overlap of each point's k-NN set in the two projections.
        # Both indices include the point itself at column 0; drop it so the
        # score reflects the k true neighbors on each side.
        _, idx_left = _umap_knn(dataset, umap_left, k)
        _, idx_right = _umap_knn(dataset, umap_right, k)
        idx_left = idx_left[:, 1:]
        idx_right = idx_right[:, 1:]
        scores = np.empty(len(left))
        for i in range(len(left)):
            inter = np.intersect1d(idx_left[i], idx_right[i], assume_unique=True).size
            union = idx_left.shape[1] + idx_right.shape[1] - inter
            scores[i] = 1 - inter / union  # 0 = same neighborhood, 1 = completely different
        result = scores
    elif metric == 'relative':
        # Per-point displacement minus the mean displacement of its left-map
        # neighbors — highlights points that move differently than their local
        # cohort. Vectorized over the cached neighbor-index matrix.
        displacement = np.linalg.norm(right - left, axis=1)
        _, idx_left = _umap_knn(dataset, umap_left, k)
        idx_left = idx_left[:, 1:]
        neighbor_means = displacement[idx_left].mean(axis=1)
        result = np.abs(displacement - neighbor_means)
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
    dataset = _safe_dataset(request.args.get('dataset'))
    umap_left = request.args.get('umap_left')
    umap_right = request.args.get('umap_right')
    point_index = int(request.args.get('point_index'))
    side = request.args.get('side', 'left')
    k = int(request.args.get('k', 10))

    # Reuse the cached kNN index for the clicked side rather than refitting a
    # fresh NearestNeighbors over all N points on every click.
    umap_id = umap_left if side == 'left' else umap_right
    _, neighbor_idx = _umap_knn(dataset, umap_id, k)
    # Row point_index holds [self, n1, n2, ...]; drop the point itself.
    neighbor_indices = [int(i) for i in neighbor_idx[point_index] if int(i) != point_index][:k]

    return jsonify({
        "point_index": point_index,
        "side": side,
        "neighbor_indices": neighbor_indices,
    })


# Selections above this many points are subsampled for the O(n^2) mean-pairwise
# distance so the spread stat stays responsive; the convex hull is cheap and is
# always computed on the full selection.
SPREAD_SAMPLE_CAP = 2000


def _spread_stats(coords, indices):
    """Cohesion stats for a selected point set within one projection.

    Returns mean pairwise distance, convex-hull area, bounding-box area and
    centroid. ``mean_pairwise`` is subsampled above ``SPREAD_SAMPLE_CAP`` points
    (flagged via ``sampled``); the hull needs >= 3 non-collinear points and is
    reported as 0 otherwise.
    """
    import numpy as np
    from scipy.spatial import ConvexHull
    from scipy.spatial.distance import pdist

    pts = coords[indices]
    n = len(pts)
    stats = {
        "n": int(n),
        "mean_pairwise": None,
        "hull_area": 0.0,
        "bbox_area": 0.0,
        "centroid": None,
        "sampled": False,
    }
    if n == 0:
        return stats

    centroid = pts.mean(axis=0)
    stats["centroid"] = [float(centroid[0]), float(centroid[1])]

    mins = pts.min(axis=0)
    maxs = pts.max(axis=0)
    stats["bbox_area"] = float((maxs[0] - mins[0]) * (maxs[1] - mins[1]))

    if n >= 2:
        sample = pts
        if n > SPREAD_SAMPLE_CAP:
            # Deterministic evenly-spaced subsample (no RNG => stable readout).
            step = n / SPREAD_SAMPLE_CAP
            sel = (np.arange(SPREAD_SAMPLE_CAP) * step).astype(int)
            sample = pts[sel]
            stats["sampled"] = True
        stats["mean_pairwise"] = float(pdist(sample).mean())

    if n >= 3:
        try:
            stats["hull_area"] = float(ConvexHull(pts).volume)  # 2D volume == area
        except Exception:
            # Degenerate (collinear/coincident) points have no 2D hull.
            stats["hull_area"] = 0.0

    return stats


@search_bp.route('/compare/spread', methods=['POST'])
def compare_spread():
    """Compare how coherent a selected set of points is in each projection.

    Body: ``{ dataset, umap_left, umap_right, indices: [...] }``. Returns
    per-side spread stats so the UI can say e.g. "this region is 2.3x more
    spread out in the right map".
    """
    import numpy as np

    req = request.get_json() or {}
    dataset = _safe_dataset(req.get('dataset'))
    umap_left = req.get('umap_left')
    umap_right = req.get('umap_right')
    indices = req.get('indices') or []

    left = _umap_coords(dataset, umap_left)
    right = _umap_coords(dataset, umap_right)

    # Keep only in-range indices so a stale selection can't index out of bounds.
    n_points = len(left)
    idx = np.asarray([i for i in indices if 0 <= int(i) < n_points], dtype=int)

    return jsonify({
        "n_selected": int(len(idx)),
        "left": _spread_stats(left, idx),
        "right": _spread_stats(right, idx),
    })


@search_bp.route('/compare-clusters', methods=['GET'])
def compare_clusters():
    import numpy as np
    import pandas as pd

    DATA_DIR = _data_dir()
    dataset = _safe_dataset(request.args.get('dataset'))
    cluster_left = request.args.get('cluster_left')
    cluster_right = request.args.get('cluster_right')

    if not all([dataset, cluster_left, cluster_right]):
        return jsonify({"error": "Missing required parameters"}), 400

    cluster_dir = os.path.join(DATA_DIR, dataset, "clusters")

    # Load cluster metadata to verify same UMAP
    with open(os.path.join(cluster_dir, f"{cluster_left}.json")) as f:
        meta_left = json.load(f)
    with open(os.path.join(cluster_dir, f"{cluster_right}.json")) as f:
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
