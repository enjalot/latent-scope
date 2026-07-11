# Usage: ls-sae <dataset_id> <embedding_id> [model_id] [k_expansion] [device]
# Encodes embeddings through a pretrained sparse autoencoder, storing the
# top-k feature activations per row. With --granularity tokens the per-token
# vectors of a late-interaction embedding are encoded instead (one h5 row per
# token, aligned with ls-tokenize's global token_index order).
import argparse
import json
import os
import re
import sys

from latentscope.util import get_data_dir


def main():
    parser = argparse.ArgumentParser(description='Generate SAE features from embeddings for a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='Name of embedding to use')
    parser.add_argument("model_id", type=str, nargs="?", help="HF id of model to use", default="enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT")
    parser.add_argument('k_expansion', type=str, nargs="?", help='Output file', default="64_32")
    parser.add_argument('device', type=str, nargs="?", help='Device to use')
    parser.add_argument('--checkpoint', type=str, default=None,
                        help='Load the SAE from a local checkpoint directory '
                             '(cfg.json + sae.safetensors) instead of the HF hub')
    parser.add_argument('--granularity', type=str, choices=['rows', 'tokens'], default='rows',
                        help='Encode one mean vector per dataset row (default) or every '
                             'token vector of a late-interaction embedding')
    parser.add_argument('--batch_size', type=int, default=None,
                        help='Vectors encoded per batch (default 128 for rows, 8192 for tokens)')

    # Parse arguments
    args = parser.parse_args()
    saer(args.dataset_id, args.embedding_id, args.model_id, args.k_expansion, args.device,
         checkpoint=args.checkpoint, granularity=args.granularity, batch_size=args.batch_size)


def _load_sae(model_id, k_expansion, device, checkpoint=None):
    from latentsae.sae import Sae
    if checkpoint:
        if not os.path.isdir(checkpoint):
            print(f"checkpoint directory not found: {checkpoint}")
            sys.exit(1)
        print(f"loading SAE from local checkpoint {checkpoint}")
        return Sae.load_from_disk(checkpoint, device=device)
    return Sae.load_from_hub(model_id, k_expansion, device)


def saer(dataset_id, embedding_id, model_id, k_expansion, device,
         checkpoint=None, granularity="rows", batch_size=None):
    DATA_DIR = get_data_dir()
    # read in the embeddings

    sae_dir = os.path.join(DATA_DIR, dataset_id, "saes")
    if not os.path.exists(sae_dir):
        os.makedirs(sae_dir)

    # determine the index of the last sae run by looking in the dataset directory
    # for files named sae-<number>.json
    sae_files = [f for f in os.listdir(sae_dir) if re.match(r"sae-\d+\.json", f)]
    if len(sae_files) > 0:
        last_sae = sorted(sae_files)[-1]
        last_sae_number = int(last_sae.split("-")[1].split(".")[0])
        next_sae_number = last_sae_number + 1
    else:
        next_sae_number = 1

    # make the sae name from the number, zero padded to 3 digits
    sae_id = f"sae-{next_sae_number:03d}"
    print("RUNNING:", sae_id, f"(granularity={granularity})")

    import h5py
    import numpy as np
    import pandas as pd
    import torch
    from tqdm import tqdm

    if device == "mps" or torch.backends.mps.is_available():
        device = torch.device("mps")
    elif device == "cuda" or torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")

    model = _load_sae(model_id, k_expansion, device, checkpoint=checkpoint)

    all_acts = []
    all_indices = []
    total_rows = 0

    if granularity == "tokens":
        from latentscope.util.embedding_store import (
            has_token_vectors,
            iter_token_vectors,
        )
        if not has_token_vectors(DATA_DIR, dataset_id, embedding_id):
            print(f"{embedding_id} has no per-token vectors; --granularity tokens "
                  "requires a late-interaction embedding")
            sys.exit(1)
        batch_size = batch_size or 8192

        print("Encoding token vectors with SAE (streaming)")
        buffer = []
        buffered = 0

        def encode_flush():
            nonlocal buffer, buffered
            if not buffer:
                return
            batch = torch.from_numpy(np.concatenate(buffer)).float()
            for i in range(0, len(batch), batch_size):
                chunk = batch[i:i + batch_size].to(device)
                with torch.no_grad():
                    features = model.encode(chunk)
                all_acts.append(features.top_acts.detach().cpu())
                all_indices.append(features.top_indices.detach().cpu())
            buffer = []
            buffered = 0

        for _, vec_list in tqdm(iter_token_vectors(DATA_DIR, dataset_id, embedding_id),
                                desc="Encoding token batches"):
            flat = np.concatenate(vec_list)
            total_rows += len(flat)
            buffer.append(flat)
            buffered += len(flat)
            if buffered >= batch_size:
                encode_flush()
        encode_flush()
    else:
        from latentscope.util.embedding_store import load_embeddings
        batch_size = batch_size or 128

        print("loading embeddings")
        embeddings = load_embeddings(DATA_DIR, dataset_id, embedding_id)
        total_rows = len(embeddings)
        # Keep the full matrix on CPU; only the active batch is moved to the
        # device inside the loop (moving everything up front defeats batching).
        all_embeddings = torch.from_numpy(embeddings).float()

        print("Encoding embeddings with SAE")
        for i in tqdm(range(0, len(all_embeddings), batch_size), desc="Encoding batches"):
            batch = all_embeddings[i:i + batch_size].to(device)
            with torch.no_grad():
                features = model.encode(batch)
            all_acts.append(features.top_acts.detach().cpu())
            all_indices.append(features.top_indices.detach().cpu())

    all_acts = torch.cat(all_acts, dim=0).numpy()
    all_indices = torch.cat(all_indices, dim=0).numpy()
    assert len(all_acts) == total_rows

    print("encoding completed")

    print("saving to disk")
    # save the acts and indices to the sae directory
    with h5py.File(os.path.join(sae_dir, f"{sae_id}.h5"), 'w') as f:
        f.create_dataset("top_acts", data=all_acts)
        f.create_dataset("top_indices", data=all_indices)

    print("calculating summary statistics")
    print("ALL ACTS SHAPE", all_acts.shape)
    print("ALL INDS SHAPE", all_indices.shape)

    # Vectorized per-feature stats over the flat (row, k) top-k arrays; the
    # previous per-row lil_matrix loop took minutes at token scale (millions
    # of rows).
    flat_indices = all_indices.reshape(-1).astype(np.int64)
    flat_acts = all_acts.reshape(-1).astype(np.float32)
    num_latents = model.num_latents
    feature_counts = np.bincount(flat_indices, weights=(flat_acts > 0), minlength=num_latents)
    act_sums = np.zeros(num_latents, dtype=np.float64)
    np.add.at(act_sums, flat_indices, flat_acts)
    max_activations = np.zeros(num_latents, dtype=np.float32)
    np.maximum.at(max_activations, flat_indices, flat_acts)
    avg_activations = act_sums / np.maximum(feature_counts, 1)

    # Create features DataFrame
    features_df = pd.DataFrame({
        'feature_id': range(num_latents),
        'max_activation': max_activations,
        'count': feature_counts.astype(np.int64),
        'avg_activation': avg_activations.astype(np.float32)
    })

    # Save features to parquet
    features_df.to_parquet(os.path.join(sae_dir, f"{sae_id}_features.parquet"))

    dead_features = np.where(max_activations <= 0)
    alive_features = np.where(max_activations > 0)
    num_dead_features = len(dead_features[0])
    print(f"Number of dead features: {num_dead_features}")

    # Update metadata json (removed max_activations)
    meta = {
        "id": sae_id,
        "model_id": model_id,
        "k_expansion": k_expansion,
        "embedding_id": embedding_id,
        "dataset_id": dataset_id,
        "granularity": granularity,
        "rows": int(total_rows),
        "num_features": num_latents,
        "dead_features": num_dead_features,
        "alive_features": len(alive_features[0])
    }
    if checkpoint:
        meta["checkpoint"] = checkpoint
    with open(os.path.join(sae_dir, f"{sae_id}.json"), 'w') as f:
        json.dump(meta, f)

    print("done with", sae_id)


if __name__ == "__main__":
    main()
