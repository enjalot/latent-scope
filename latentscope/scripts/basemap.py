# Usage: ls-basemap <dataset_id> <embedding_id> <basemap_id>
# Example: ls-basemap ls-squad embedding-002 basemap-minilm-ded-30m-bigger
#
# Projects a dataset's embeddings to 2D through a pretrained basemap
# (parametric UMAP) model, writing the result as a regular umap-NNN so the
# rest of the pipeline (cluster, scope, explore) works unchanged. The basemap
# model must have been trained on the same embedding model the embedding was
# made with; compatibility is checked against the basemap registry.
import argparse
import json
import os
import re

from latentscope.util import get_data_dir


def main():
    parser = argparse.ArgumentParser(
        description='Project embeddings through a pretrained basemap (parametric UMAP) model')
    parser.add_argument('dataset_id', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='Embedding to project (e.g. embedding-002)')
    parser.add_argument('basemap_id', type=str,
                        help='Basemap model id from basemap_models.json, or a path to a .pt checkpoint')
    parser.add_argument('--device', type=str, default=None,
                        help='torch device (default: cpu; basemap encoders are small enough '
                             'that CPU inference is fine even for large datasets)')
    parser.add_argument('--frame', type=str, choices=['canonical', 'dataset'], default=None,
                        help="How to map raw model output into [-1, 1]: 'canonical' uses the "
                             "model's global extent from the registry (comparable across "
                             "datasets), 'dataset' min-max normalizes per dataset. "
                             "Default: canonical when the registry has an extent, else dataset.")
    parser.add_argument('--force', action='store_true',
                        help='Skip the embedding-model compatibility check')
    parser.add_argument('--no-underlay', dest='underlay', action='store_false',
                        help="Don't draw the basemap's density render behind the projected "
                             'points in the thumbnail (default: draw it when available)')
    parser.add_argument('--name', type=str, default=None, help='Human-friendly name for this umap')
    parser.add_argument('--description', type=str, default=None,
                        help='Free-text description for this umap')
    args = parser.parse_args()
    basemapper(args.dataset_id, args.embedding_id, args.basemap_id, device=args.device,
               frame=args.frame, force=args.force, underlay=args.underlay,
               name=args.name, description=args.description)


def _strip_model_prefix(model_id):
    """Normalize an embedding model id to its bare HF-style name.

    '🤗-sentence-transformers___all-MiniLM-L6-v2' -> 'sentence-transformers/all-MiniLM-L6-v2'
    """
    if model_id is None:
        return None
    name = model_id
    for prefix in ("🤗-", "huggingface-", "transformers-", "custom_embedding-"):
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    return name.replace("___", "/")


# A latent-basemap run directory ships the checkpoint next to the artifacts that
# describe the map it draws: the training rows' coordinates (which define the
# map's canonical frame) and a 1024x1024 binned density render of them (the
# underlay). Anything found here is used automatically when a checkpoint is
# given by path, so sandbox/round models work with no registry entry.
PACK_FILES = {
    "coordinates": "coordinates.npy",
    "density_png": "density.png",
    "summary": "summary.json",
}
# Frame convention, matched to latent-basemap's render (experiments/map_renders.py
# robust_extent): the extent is the 0.1/99.9 percentile box padded by 2%, so one
# outlier island cannot shrink the map. The density render uses exactly this box,
# so a frame built the same way puts projected points in register with it.
EXTENT_PERCENTILES = (0.1, 99.9)
EXTENT_PAD = 0.02


def _pack_artifacts(checkpoint_path):
    """Sibling artifacts of a checkpoint (coordinates / density render / summary)."""
    run_dir = os.path.dirname(os.path.abspath(checkpoint_path))
    found = {}
    for key, filename in PACK_FILES.items():
        path = os.path.join(run_dir, filename)
        if os.path.exists(path):
            found[key] = path
    return found


def _extent_from_coordinates(coordinates_path, sample_rows=2_000_000):
    """Derive a canonical [-1, 1] frame from a map's own training coordinates.

    Reads the memmap in a strided subsample (never materializes the array — a
    100M-row coordinates file is 800 MB) and returns (min_values, max_values)
    for the padded percentile box.
    """
    import numpy as np
    coords = np.load(coordinates_path, mmap_mode="r")
    if coords.ndim != 2 or coords.shape[1] != 2:
        raise ValueError(f"{coordinates_path}: expected (N, 2) coordinates, got {coords.shape}")
    if len(coords) > sample_rows:
        idx = np.linspace(0, len(coords) - 1, sample_rows).astype(np.int64)
        pts = np.asarray(coords[idx], dtype=np.float64)
    else:
        pts = np.asarray(coords, dtype=np.float64)
    lo, hi = np.percentile(pts, EXTENT_PERCENTILES, axis=0)
    pad = EXTENT_PAD * (hi - lo)
    pad[pad == 0] = 1.0
    return (lo - pad).tolist(), (hi + pad).tolist()


def _underlay_aligns(extent):
    """True when a frame was built the same way the density render's box was.

    A density PNG only registers with the points if the [-1, 1] frame is the
    identical percentile box; a frame from a differently-derived extent (e.g. the
    legacy registry entries, which store an unpadded percentile box over a 300k
    reference sample) would be off by a few percent, so no underlay is drawn.
    """
    if not extent:
        return False
    return (tuple(extent.get("percentiles") or ()) == EXTENT_PERCENTILES
            and extent.get("pad") == EXTENT_PAD)


def _resolve_basemap(basemap_id):
    """Resolve a registry id or checkpoint path to (registry_entry, checkpoint_path).

    A bare checkpoint path gets a synthetic registry entry built from its run
    directory, so current sandbox/round models project into their own canonical
    frame (and draw their own underlay) without being registered first.
    """
    from latentscope.models import get_basemap_model_dict
    if basemap_id.endswith(".pt") or os.path.sep in basemap_id:
        if not os.path.exists(basemap_id):
            raise ValueError(f"basemap checkpoint not found: {basemap_id}")
        pack = _pack_artifacts(basemap_id)
        # in a latent-basemap run directory the DIRECTORY names the map (the
        # checkpoint is always "model.pt"); a loose checkpoint names itself
        run_dir = os.path.dirname(os.path.abspath(basemap_id))
        is_run_dir = "coordinates" in pack or "summary" in pack
        entry = {
            "id": (os.path.basename(run_dir) if is_run_dir else os.path.basename(basemap_id)),
            "checkpoint": basemap_id,
            "unregistered": True,
        }
        entry.update(pack)
        return entry, basemap_id
    entry = get_basemap_model_dict(basemap_id)
    checkpoint = entry["checkpoint"]
    if not os.path.isabs(checkpoint):
        base_dir = os.environ.get("LATENT_SCOPE_BASEMAP_DIR", "")
        checkpoint = os.path.join(base_dir, checkpoint)
    if not os.path.exists(checkpoint):
        raise ValueError(f"basemap checkpoint for '{basemap_id}' not found: {checkpoint}")
    # registry entries may name their own artifacts; otherwise fall back to
    # whatever sits next to the checkpoint
    entry = {**_pack_artifacts(checkpoint), **entry}
    return entry, checkpoint


def basemapper(dataset_id, embedding_id, basemap_id, device=None, frame=None, force=False,
               underlay=True, name=None, description=None):
    DATA_DIR = get_data_dir()
    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    entry, checkpoint_path = _resolve_basemap(basemap_id)

    # compatibility check: the basemap was trained on a specific embedding model
    emb_meta_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{embedding_id}.json")
    with open(emb_meta_path) as f:
        emb_meta = json.load(f)
    emb_model = _strip_model_prefix(emb_meta.get("model_id"))
    if entry is not None:
        expected = entry.get("embedding_model")
        if expected is None:
            # unregistered checkpoint given by path: nothing declares which
            # embedding model it was trained on, so only the input dimension
            # (checked below) guards the projection
            print(f"NOTE: '{entry['id']}' is not in the basemap registry; the embedding model "
                  f"('{emb_model}') cannot be verified against it")
        elif emb_model != expected:
            msg = (f"embedding {embedding_id} was made with '{emb_model}' but basemap "
                   f"'{entry['id']}' expects '{expected}'")
            if not force:
                raise ValueError(msg + " (use --force to project anyway)")
            print("WARNING:", msg)
        # prompt-convention check: a basemap trained on prompt-free corpora
        # cannot faithfully project embeddings made with the model's default
        # prompt (or a manual prefix) — the shift is large (e.g. jina-v5
        # "Document: " moves cosine to 0.73-0.94)
        if entry.get("embedding_prompt") == "raw":
            applied = emb_meta.get("applied_prompt")
            user_prefix = emb_meta.get("prefix") or ""
            if applied or user_prefix:
                msg = (f"basemap '{entry['id']}' was trained on prompt-free embeddings, but "
                       f"{embedding_id} was embedded with "
                       f"{'prompt ' + repr(applied) if applied else 'prefix ' + repr(user_prefix)}"
                       f"; re-embed with --no-prompt (and no --prefix) for a faithful projection")
                if not force:
                    raise ValueError(msg + " (use --force to project anyway)")
                print("WARNING:", msg)
            elif "applied_prompt" not in emb_meta:
                print(f"WARNING: {embedding_id} predates prompt tracking; if it was embedded "
                      "through latent-scope with a prompt-bearing model the projection may be "
                      "unfaithful (this basemap expects prompt-free embeddings)")

    from latentscope.scripts.umapper import _next_umap_id, calculate_point_size
    umap_id = _next_umap_id(umap_dir)
    # the job runner parses run_id from this exact line format
    print("RUNNING:", umap_id)
    print("projecting with basemap", basemap_id)

    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import torch

    from latentscope.scripts.basemap_nets import load_basemap_checkpoint
    from latentscope.scripts.registration import apply_normalization, count_out_of_frame
    from latentscope.util.embedding_store import load_embeddings

    if device is None:
        device = "cpu"  # small encoder; stay off the GPU by default (it may be training)
    print("loading basemap model from", checkpoint_path)
    model, info = load_basemap_checkpoint(checkpoint_path, device)
    print(f"basemap model: {info['arch']} d_in={info['d_in']} hidden={info['hidden_dim']} "
          f"({info['n_params']:,} params)")

    print("loading embeddings")
    embeddings = load_embeddings(DATA_DIR, dataset_id, embedding_id)
    if embeddings.shape[1] != info["d_in"]:
        raise ValueError(f"embedding dimension {embeddings.shape[1]} does not match "
                         f"basemap input dimension {info['d_in']}")

    print(f"projecting {embeddings.shape[0]:,} rows")
    batch_size = 4096
    parts = []
    with torch.no_grad():
        for i in range(0, len(embeddings), batch_size):
            chunk = np.asarray(embeddings[i:i + batch_size], dtype=np.float32)
            batch = torch.from_numpy(chunk).to(device)
            parts.append(model(batch).cpu().numpy())
    raw = np.concatenate(parts, axis=0)

    # map raw model coordinates into the [-1, 1] frame
    extent = entry.get("extent") if entry is not None else None
    extent_source = "registry" if extent else None
    coordinates_path = entry.get("coordinates") if entry is not None else None
    if extent is None and coordinates_path:
        # no registry extent, but the map's own training coordinates are on disk:
        # derive the same padded percentile box the density render uses
        print("deriving canonical extent from", coordinates_path)
        mins, maxs = _extent_from_coordinates(coordinates_path)
        extent = {"min_values": mins, "max_values": maxs,
                  "percentiles": list(EXTENT_PERCENTILES), "pad": EXTENT_PAD,
                  "source": coordinates_path}
        extent_source = "coordinates"
    if frame is None:
        frame = "canonical" if extent else "dataset"
    if frame == "canonical":
        if not extent:
            raise ValueError(f"basemap '{basemap_id}' has no canonical extent (no registry entry "
                             "and no coordinates.npy next to the checkpoint); use --frame dataset")
        min_values = np.array(extent["min_values"], dtype=np.float64)
        max_values = np.array(extent["max_values"], dtype=np.float64)
        coords = apply_normalization(raw, min_values, max_values).astype(np.float32)
        outside = count_out_of_frame(coords)
        if outside > 0:
            print(f"{umap_id}: {outside} points fall outside the canonical [-1, 1] frame")
    else:
        min_values = raw.min(axis=0)
        max_values = raw.max(axis=0)
        coords = (2 * (raw - min_values) / (max_values - min_values) - 1).astype(np.float32)

    df = pd.DataFrame(coords, columns=['x', 'y'])
    output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
    df.to_parquet(output_file)
    print("wrote", output_file)

    # thumbnail: the projected points, over the basemap's own density render when
    # one is available in the same frame (this is the underlay — every latent-scope
    # surface that already shows umap-NNN.png shows the user's data over the map)
    density_png = entry.get("density_png") if entry is not None else None
    underlay_drawn = False
    if underlay and density_png and frame == "canonical" and _underlay_aligns(extent):
        underlay_drawn = True

    fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px square at 72 dpi
    point_size = calculate_point_size(coords.shape[0])
    if underlay_drawn:
        import matplotlib.image as mpimg
        print("drawing basemap density underlay from", density_png)
        # latent-basemap's density render is a 180-degree rotation of the natural
        # axes (see experiments/map_renders.render_png: the transpose is followed
        # by a rot90(2) and a row flip, which nets to an x-mirror). Rotate it back
        # so it lines up with points plotted x-right / y-up.
        ax.imshow(np.rot90(mpimg.imread(density_png), 2), extent=(-1, 1, -1, 1),
                  alpha=0.85, interpolation='nearest', zorder=0)
        ax.scatter(coords[:, 0], coords[:, 1], s=point_size, alpha=0.6,
                   c='#d1495b', linewidths=0, zorder=1)
    else:
        ax.scatter(coords[:, 0], coords[:, 1], s=point_size, alpha=0.5)
    ax.set_xlim(-1.05, 1.05)
    ax.set_ylim(-1.05, 1.05)
    ax.axis('off')
    ax.set_position([0, 0, 1, 1])
    plt.savefig(os.path.join(umap_dir, f"{umap_id}.png"))
    plt.close(fig)

    meta = {
        "id": umap_id,
        "embedding_id": embedding_id,
        "neighbors": None,
        "min_dist": None,
        "min_values": np.asarray(min_values, dtype=np.float64).tolist(),
        "max_values": np.asarray(max_values, dtype=np.float64).tolist(),
        "basemap": {
            "basemap_id": entry["id"] if entry is not None else os.path.basename(checkpoint_path),
            "checkpoint": checkpoint_path,
            "arch": info["arch"],
            "n_params": info["n_params"],
            "frame": frame,
            "extent_source": extent_source,
            # training-time knobs off the checkpoint: which map this actually is
            "provenance": info.get("provenance") or {},
            # the density render behind the points, in the same [-1, 1] frame
            "density_png": density_png if underlay_drawn else None,
        },
        "name": name or (entry.get("name") if entry is not None else None) or basemap_id,
    }
    if description is not None:
        meta["description"] = description
    with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
        json.dump(meta, f, indent=2)

    print("done with", umap_id)
    return umap_id


if __name__ == "__main__":
    main()
