"""
API endpoints for estimating compute time and storage for pipeline steps.

Provides both formula-based estimates and benchmark-based estimates that
run a small sample through the actual pipeline step.
"""

import json
import os
import time

from flask import Blueprint, current_app, jsonify, request

estimate_bp = Blueprint('estimate_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


@estimate_bp.route('/embed', methods=['GET'])
def estimate_embed():
    """Estimate compute time and storage for embedding a dataset.

    Query params:
        dataset: dataset ID
        model_id: embedding model ID
        text_column: text column name
        dimensions: optional dimension truncation
    """
    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    model_id = request.args.get('model_id')
    text_column = request.args.get('text_column')
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None

    if not dataset or not model_id:
        return jsonify({"error": "Missing dataset or model_id"}), 400

    import numpy as np
    import pandas as pd

    # Load dataset to get stats
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))
    num_rows = len(df)

    # Get text stats
    if text_column and text_column in df.columns:
        texts = df[text_column].fillna("").astype(str)
        avg_text_length = int(texts.str.len().mean())
        max_text_length = int(texts.str.len().max())
        avg_word_count = int(texts.str.split().str.len().mean())
    else:
        avg_text_length = 100
        max_text_length = 1000
        avg_word_count = 20

    # Estimate dimensions from model
    from latentscope.models import get_embedding_model_list
    models = get_embedding_model_list()
    model_info = next((m for m in models if m['id'] == model_id), None)

    is_late_interaction = False
    if model_info:
        est_dimensions = dimensions or model_info.get('params', {}).get(
            'dimensions', [768]
        )
        if isinstance(est_dimensions, list):
            est_dimensions = est_dimensions[0]
        is_late_interaction = model_info.get('params', {}).get('late_interaction', False)
        group = model_info.get('group', model_info.get('provider', ''))
    else:
        est_dimensions = dimensions or 768
        # Check if it's a colbert model by ID prefix
        is_late_interaction = model_id.startswith('colbert-')
        group = 'unknown'

    # Estimate tokens per doc for late interaction
    avg_tokens_per_doc = min(avg_word_count * 1.3, 512)  # rough token estimate

    # Storage estimate
    from latentscope.util.embedding_store import estimate_embedding_storage
    storage = estimate_embedding_storage(
        num_rows, est_dimensions,
        has_tokens=is_late_interaction,
        avg_tokens_per_doc=int(avg_tokens_per_doc),
    )

    # Time estimate (rough heuristics)
    if group in ('openai', 'mistralai', 'cohereai', 'voyageai', 'togetherai'):
        # API-based: ~500-2000 items/sec depending on provider
        items_per_sec = 1000
    elif is_late_interaction:
        # Late interaction models are slower
        items_per_sec = 50  # conservative GPU estimate
    else:
        # Local transformers model
        items_per_sec = 200  # conservative GPU estimate

    estimated_seconds = num_rows / items_per_sec

    return jsonify({
        "num_rows": num_rows,
        "avg_text_length": avg_text_length,
        "max_text_length": max_text_length,
        "avg_word_count": avg_word_count,
        "dimensions": est_dimensions,
        "is_late_interaction": is_late_interaction,
        "avg_tokens_per_doc": int(avg_tokens_per_doc),
        "storage": storage,
        "estimated_seconds": round(estimated_seconds, 1),
        "estimated_time_human": _human_readable_time(estimated_seconds),
        "note": "Rough estimate. Use 'Benchmark' for accurate timing.",
    })


@estimate_bp.route('/umap', methods=['GET'])
def estimate_umap():
    """Estimate compute time and storage for UMAP projection."""
    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    neighbors = request.args.get('neighbors', 25)
    neighbors = int(neighbors)

    if not dataset or not embedding_id:
        return jsonify({"error": "Missing dataset or embedding_id"}), 400

    # Get embedding dimensions and count
    meta_path = os.path.join(DATA_DIR, dataset, "embeddings", f"{embedding_id}.json")
    if not os.path.exists(meta_path):
        return jsonify({"error": f"Embedding {embedding_id} not found"}), 404

    with open(meta_path) as f:
        meta = json.load(f)

    dimensions = meta.get('dimensions', 768)

    import pandas as pd
    df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))
    num_rows = len(df)

    # UMAP output: 2 floats per row + parquet overhead
    output_bytes = int(num_rows * 2 * 4 * 1.5)  # 2D coords, float32, 50% overhead

    # UMAP time scales roughly as O(N * log(N) * D)
    import math
    base_time_per_1000 = 5.0  # seconds per 1000 rows at 768D
    dim_factor = dimensions / 768
    estimated_seconds = (num_rows / 1000) * base_time_per_1000 * dim_factor * (1 + math.log10(max(num_rows, 10)) / 4)

    return jsonify({
        "num_rows": num_rows,
        "dimensions": dimensions,
        "neighbors": neighbors,
        "output_bytes": output_bytes,
        "output_human": _human_readable_size(output_bytes),
        "estimated_seconds": round(estimated_seconds, 1),
        "estimated_time_human": _human_readable_time(estimated_seconds),
        "note": "UMAP time varies significantly with data distribution.",
    })


@estimate_bp.route('/cluster', methods=['GET'])
def estimate_cluster():
    """Estimate compute time for clustering."""
    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    umap_id = request.args.get('umap_id')

    if not dataset or not umap_id:
        return jsonify({"error": "Missing dataset or umap_id"}), 400

    import pandas as pd
    umap_path = os.path.join(DATA_DIR, dataset, "umaps", f"{umap_id}.parquet")
    if not os.path.exists(umap_path):
        return jsonify({"error": f"UMAP {umap_id} not found"}), 404

    df = pd.read_parquet(umap_path)
    num_rows = len(df)

    # HDBSCAN on 2D data is fast - O(N log N)
    import math
    estimated_seconds = (num_rows / 10000) * 2 * (1 + math.log10(max(num_rows, 10)) / 5)

    # Output: cluster labels parquet + PNG
    output_bytes = int(num_rows * 4 * 2)  # cluster IDs + overhead

    return jsonify({
        "num_rows": num_rows,
        "output_bytes": output_bytes,
        "output_human": _human_readable_size(output_bytes),
        "estimated_seconds": round(estimated_seconds, 1),
        "estimated_time_human": _human_readable_time(estimated_seconds),
    })


@estimate_bp.route('/benchmark/embed', methods=['GET'])
def benchmark_embed():
    """Run embedding on a small sample to get accurate timing.

    Query params:
        dataset: dataset ID
        model_id: embedding model ID
        text_column: text column name
        sample_size: number of items to benchmark (default 10)
        dimensions: optional dimension truncation
    """
    DATA_DIR = _data_dir()
    dataset = request.args.get('dataset')
    model_id = request.args.get('model_id')
    text_column = request.args.get('text_column')
    sample_size = int(request.args.get('sample_size', 10))
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None

    if not dataset or not model_id or not text_column:
        return jsonify({"error": "Missing required parameters"}), 400

    import numpy as np
    import pandas as pd

    from latentscope.models import get_embedding_model

    df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))
    num_rows = len(df)

    # Sample texts
    sample_size = min(sample_size, num_rows)
    sample_df = df.sample(n=sample_size, random_state=42)
    texts = sample_df[text_column].fillna(" ").astype(str).tolist()

    # Load model
    model = get_embedding_model(model_id)
    model.load_model()

    is_late_interaction = getattr(model, 'late_interaction', False)

    # Warm up (1 item)
    if is_late_interaction:
        model.embed_multi([texts[0]], dimensions=dimensions)
    else:
        model.embed([texts[0]], dimensions=dimensions)

    # Benchmark
    start_time = time.time()
    if is_late_interaction:
        mean_vecs, token_vecs = model.embed_multi(texts, dimensions=dimensions)
        sample_dim = mean_vecs.shape[1]
        avg_tokens = int(np.mean([len(tv) for tv in token_vecs]))
    else:
        result = np.array(model.embed(texts, dimensions=dimensions))
        sample_dim = result.shape[1]
        avg_tokens = 0
    elapsed = time.time() - start_time

    time_per_item = elapsed / sample_size
    total_estimated_seconds = time_per_item * num_rows

    # Storage estimate based on actual dimensions
    from latentscope.util.embedding_store import estimate_embedding_storage
    storage = estimate_embedding_storage(
        num_rows, sample_dim,
        has_tokens=is_late_interaction,
        avg_tokens_per_doc=avg_tokens,
    )

    return jsonify({
        "sample_size": sample_size,
        "num_rows": num_rows,
        "time_per_item": round(time_per_item, 4),
        "sample_total_time": round(elapsed, 2),
        "estimated_total_seconds": round(total_estimated_seconds, 1),
        "estimated_total_time_human": _human_readable_time(total_estimated_seconds),
        "dimensions": sample_dim,
        "is_late_interaction": is_late_interaction,
        "avg_tokens_per_doc": avg_tokens,
        "storage": storage,
    })


def _human_readable_time(seconds):
    """Convert seconds to human-readable string."""
    if seconds < 60:
        return f"{seconds:.0f} seconds"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f} minutes"
    else:
        hours = seconds / 3600
        return f"{hours:.1f} hours"


def _human_readable_size(size_bytes):
    """Convert bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"
