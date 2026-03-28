#!/usr/bin/env python
"""
Experiment: Project token/patch vectors through a UMAP model trained on mean vectors.

Tests the hypothesis that token vectors for a document will cluster near their
document's mean-pool UMAP position, making per-token exploration useful.

Usage:
    python experiments/umap_token_projection.py <dataset_id> <embedding_id> <umap_id>

    # With a real late-interaction model (e.g. colbert-ir/colbertv2.0):
    python experiments/umap_token_projection.py mydata embedding-001 umap-001 \
        --model colbert-ir/colbertv2.0

    # Simulation mode (no model required, uses gaussian noise around mean):
    python experiments/umap_token_projection.py mydata embedding-001 umap-001 \
        --simulate --n_tokens 8 --noise_scale 0.05

Results are written to:
    <data_dir>/<dataset_id>/experiments/umap_token_projection_<embedding_id>_<umap_id>.parquet

That parquet has columns: row_id, token_idx, x, y, mean_x, mean_y, spread
allowing direct overlay on the existing UMAP scatter plot.
"""

import os
import sys
import argparse
import pickle
import numpy as np


def load_mean_embeddings(dataset_path, embedding_id):
    import h5py
    path = os.path.join(dataset_path, "embeddings", f"{embedding_id}.h5")
    with h5py.File(path, "r") as f:
        embeddings = np.array(f["embeddings"], dtype=np.float32)
    print(f"Loaded mean embeddings: {embeddings.shape}")
    return embeddings


def load_umap_model(dataset_path, umap_id):
    path = os.path.join(dataset_path, "umaps", f"{umap_id}.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No saved UMAP model at {path}. "
            "Re-run UMAP with model saving enabled (it saves by default)."
        )
    with open(path, "rb") as f:
        model = pickle.load(f)
    print(f"Loaded UMAP model from {path}")
    return model


def load_existing_umap_coords(dataset_path, umap_id):
    """Load the pre-computed UMAP coords so we can compare against transform() output."""
    import pandas as pd
    path = os.path.join(dataset_path, "umaps", f"{umap_id}.parquet")
    df = pd.read_parquet(path)
    return df[["x", "y"]].values.astype(np.float32)


def simulate_token_vectors(mean_embeddings, n_tokens, noise_scale, seed=42):
    """
    Simulate token vectors by adding gaussian noise around the mean.
    This is a stand-in for real late-interaction model output.
    noise_scale controls how spread out the tokens are relative to the mean.
    """
    rng = np.random.default_rng(seed)
    N, D = mean_embeddings.shape
    # (N, T, D): each token is the mean + small perturbation
    token_vecs = (
        mean_embeddings[:, None, :]
        + rng.normal(0, noise_scale, (N, n_tokens, D)).astype(np.float32)
    )
    # L2-normalize each token vector (ColBERT normalizes its outputs)
    norms = np.linalg.norm(token_vecs, axis=-1, keepdims=True)
    token_vecs = token_vecs / np.maximum(norms, 1e-8)
    return token_vecs  # (N, T, D)


def embed_tokens_with_model(texts, model_name, device="cpu"):
    """
    Encode texts with a real late-interaction model (e.g. ColBERT via pylate).
    Returns a ragged list of arrays, each shape (T_i, D).
    Falls back to sentence-transformers with output_value='token_embeddings'.
    """
    try:
        from pylate import models as pylate_models
        model = pylate_models.ColBERT(model_name, device=device)
        token_vecs = model.encode(
            texts,
            is_query=False,
            convert_to_numpy=True,
            show_progress_bar=True,
        )
        # pylate returns list of (T_i, D) arrays
        return token_vecs
    except ImportError:
        pass

    # Fallback: sentence-transformers with token_embeddings output
    from sentence_transformers import SentenceTransformer
    st_model = SentenceTransformer(model_name, trust_remote_code=True)
    token_vecs = st_model.encode(
        texts,
        output_value="token_embeddings",
        convert_to_numpy=True,
        show_progress_bar=True,
    )
    # Returns list of (T_i, D) tensors/arrays
    return [t.numpy() if hasattr(t, "numpy") else t for t in token_vecs]


def project_tokens_batched(umap_model, token_vecs_flat, batch_size=10_000):
    """
    Project a large (N*T, D) array through umap_model.transform() in batches.
    UMAP transform is stateless per-point so batching is safe.
    """
    n = len(token_vecs_flat)
    results = []
    for start in range(0, n, batch_size):
        end = min(start + batch_size, n)
        batch = token_vecs_flat[start:end]
        coords = umap_model.transform(batch)
        results.append(coords)
        print(f"  projected {end}/{n} token vectors", end="\r", flush=True)
    print()
    return np.concatenate(results, axis=0)  # (N*T, 2)


def normalize_coords(coords, reference_coords):
    """
    Apply the same [-1, 1] normalization the UMAP pipeline uses,
    derived from the reference (mean) coordinate range.
    """
    min_xy = reference_coords.min(axis=0)
    max_xy = reference_coords.max(axis=0)
    return 2 * (coords - min_xy) / (max_xy - min_xy + 1e-8) - 1


def compute_spread(token_coords, mean_coords):
    """
    For each row, compute the mean distance of its token projections
    from the document's mean-pool UMAP coordinate.
    Returns (N, T) distances.
    """
    # token_coords: (N, T, 2), mean_coords: (N, 2)
    diff = token_coords - mean_coords[:, None, :]  # (N, T, 2)
    return np.linalg.norm(diff, axis=-1)  # (N, T)


def build_results_dataframe(token_coords, mean_coords, spread, row_ids=None):
    """
    Build a long-form dataframe with one row per (document, token) pair.
    Columns: row_id, token_idx, x, y, mean_x, mean_y, spread
    """
    import pandas as pd
    N, T, _ = token_coords.shape
    row_id_col = np.repeat(row_ids if row_ids is not None else np.arange(N), T)
    token_idx_col = np.tile(np.arange(T), N)
    x_col = token_coords[:, :, 0].ravel()
    y_col = token_coords[:, :, 1].ravel()
    mean_x_col = np.repeat(mean_coords[:, 0], T)
    mean_y_col = np.repeat(mean_coords[:, 1], T)
    spread_col = spread.ravel()

    return pd.DataFrame({
        "row_id":    row_id_col,
        "token_idx": token_idx_col,
        "x":         x_col.astype(np.float32),
        "y":         y_col.astype(np.float32),
        "mean_x":    mean_x_col.astype(np.float32),
        "mean_y":    mean_y_col.astype(np.float32),
        "spread":    spread_col.astype(np.float32),
    })


def print_summary(spread, existing_coords, projected_mean_coords):
    """Print diagnostic statistics."""
    print("\n=== Results ===")
    print(f"Token spread from document mean (UMAP units):")
    print(f"  mean:   {spread.mean():.4f}")
    print(f"  median: {np.median(spread):.4f}")
    print(f"  p95:    {np.percentile(spread, 95):.4f}")
    print(f"  max:    {spread.max():.4f}")

    # Check how well transform() reproduces the saved UMAP coords
    if existing_coords is not None and projected_mean_coords is not None:
        coord_err = np.linalg.norm(existing_coords - projected_mean_coords, axis=1)
        print(f"\nTransform vs saved coords error (mean: {coord_err.mean():.4f}, max: {coord_err.max():.4f})")
        print("(small error = UMAP transform is consistent with the original fit)")

    coord_range = spread.max() - spread.min()
    relative_spread = spread.mean() / 2.0  # coords are in [-1, 1], range=2
    print(f"\nRelative spread (fraction of full UMAP range): {relative_spread:.3f}")
    if relative_spread < 0.02:
        print("→ Tokens cluster very tightly around mean. Token projection is useful for detail.")
    elif relative_spread < 0.10:
        print("→ Moderate token spread. Tokens visible as small clouds around each document point.")
    else:
        print("→ High token spread. Tokens may overlap across documents — consider clustering tokens.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset_id", help="Dataset id (directory name in LATENT_SCOPE_DATA)")
    parser.add_argument("embedding_id", help="Embedding id, e.g. embedding-001")
    parser.add_argument("umap_id", help="UMAP id, e.g. umap-001")
    parser.add_argument("--model", default=None,
                        help="HuggingFace model name for real token embeddings (e.g. colbert-ir/colbertv2.0)")
    parser.add_argument("--simulate", action="store_true",
                        help="Use gaussian simulation instead of a real model")
    parser.add_argument("--n_tokens", type=int, default=8,
                        help="Tokens per document in simulation mode (default: 8)")
    parser.add_argument("--noise_scale", type=float, default=0.05,
                        help="Noise magnitude in simulation mode (default: 0.05)")
    parser.add_argument("--max_rows", type=int, default=None,
                        help="Limit to first N rows (useful for quick tests)")
    parser.add_argument("--batch_size", type=int, default=10_000,
                        help="UMAP projection batch size (default: 10000)")
    parser.add_argument("--device", default="cpu", help="Device for model inference (default: cpu)")
    args = parser.parse_args()

    from latentscope.util import get_data_dir
    DATA_DIR = get_data_dir()
    dataset_path = os.path.join(DATA_DIR, args.dataset_id)

    # --- Load mean embeddings and UMAP model ---
    mean_embeddings = load_mean_embeddings(dataset_path, args.embedding_id)
    if args.max_rows:
        mean_embeddings = mean_embeddings[:args.max_rows]
        print(f"Limited to {args.max_rows} rows")
    N, D = mean_embeddings.shape

    umap_model = load_umap_model(dataset_path, args.umap_id)
    existing_coords = load_existing_umap_coords(dataset_path, args.umap_id)
    if args.max_rows:
        existing_coords = existing_coords[:args.max_rows]

    # --- Project mean embeddings (sanity check) ---
    print("Projecting mean embeddings (sanity check)...")
    projected_mean = umap_model.transform(mean_embeddings)  # (N, 2)

    # Normalize to [-1, 1] using the saved coord range as reference
    projected_mean_norm = normalize_coords(projected_mean, existing_coords)

    # --- Get token vectors ---
    if args.simulate or args.model is None:
        print(f"\nSimulation mode: {args.n_tokens} tokens/doc, noise_scale={args.noise_scale}")
        token_vecs = simulate_token_vectors(
            mean_embeddings, args.n_tokens, args.noise_scale
        )  # (N, T, D)
        T = args.n_tokens

        # Project all tokens
        print(f"Projecting {N * T} token vectors in batches of {args.batch_size}...")
        flat_tokens = token_vecs.reshape(-1, D)
        flat_coords = project_tokens_batched(umap_model, flat_tokens, args.batch_size)
        flat_coords_norm = normalize_coords(flat_coords, existing_coords)
        token_coords = flat_coords_norm.reshape(N, T, 2)

    else:
        print(f"\nReal model mode: {args.model}")
        import pandas as pd
        input_df = pd.read_parquet(os.path.join(dataset_path, "input.parquet"))
        # Detect text column from embedding metadata
        import json
        with open(os.path.join(dataset_path, "embeddings", f"{args.embedding_id}.json")) as f:
            emb_meta = json.load(f)
        text_col = emb_meta.get("text_column", "text")
        texts = input_df[text_col].tolist()
        if args.max_rows:
            texts = texts[:args.max_rows]

        print(f"Encoding {len(texts)} texts with {args.model}...")
        token_vecs_ragged = embed_tokens_with_model(texts, args.model, args.device)
        # token_vecs_ragged: list of (T_i, D) arrays — variable length per doc

        # Project each doc's tokens; store as ragged then flatten
        print(f"Projecting token vectors...")
        all_row_ids, all_token_idxs, all_xs, all_ys, all_mean_xs, all_mean_ys, all_spreads = \
            [], [], [], [], [], [], []

        for i, (doc_tokens, m_coord) in enumerate(zip(token_vecs_ragged, projected_mean_norm)):
            doc_tokens = np.array(doc_tokens, dtype=np.float32)
            doc_coords = umap_model.transform(doc_tokens)  # (T_i, 2)
            doc_coords_norm = normalize_coords(doc_coords, existing_coords)
            T_i = len(doc_coords_norm)
            spread_i = np.linalg.norm(doc_coords_norm - m_coord[None, :], axis=1)
            all_row_ids.extend([i] * T_i)
            all_token_idxs.extend(range(T_i))
            all_xs.extend(doc_coords_norm[:, 0].tolist())
            all_ys.extend(doc_coords_norm[:, 1].tolist())
            all_mean_xs.extend([m_coord[0]] * T_i)
            all_mean_ys.extend([m_coord[1]] * T_i)
            all_spreads.extend(spread_i.tolist())
            if (i + 1) % 100 == 0:
                print(f"  {i+1}/{N}", end="\r", flush=True)
        print()

        import pandas as pd
        results_df = pd.DataFrame({
            "row_id": all_row_ids,
            "token_idx": all_token_idxs,
            "x": np.array(all_xs, dtype=np.float32),
            "y": np.array(all_ys, dtype=np.float32),
            "mean_x": np.array(all_mean_xs, dtype=np.float32),
            "mean_y": np.array(all_mean_ys, dtype=np.float32),
            "spread": np.array(all_spreads, dtype=np.float32),
        })
        # Write results and exit early (ragged path)
        out_dir = os.path.join(dataset_path, "experiments")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"token_projection_{args.embedding_id}_{args.umap_id}.parquet")
        results_df.to_parquet(out_path, index=False)
        spread_arr = np.array(all_spreads)
        print_summary(spread_arr.reshape(-1, 1), existing_coords, projected_mean_norm)
        print(f"\nResults written to: {out_path}")
        return

    # --- Fixed-T path (simulation) ---
    spread = compute_spread(token_coords, projected_mean_norm)  # (N, T)
    results_df = build_results_dataframe(token_coords, projected_mean_norm, spread)

    # --- Write output ---
    out_dir = os.path.join(dataset_path, "experiments")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(
        out_dir,
        f"token_projection_{args.embedding_id}_{args.umap_id}.parquet"
    )
    results_df.to_parquet(out_path, index=False)

    print_summary(spread, existing_coords, projected_mean_norm)
    print(f"\nResults written to: {out_path}")
    print(f"Columns: {list(results_df.columns)}")
    print(f"Rows: {len(results_df):,} ({N} docs × {T} tokens)")


if __name__ == "__main__":
    main()
