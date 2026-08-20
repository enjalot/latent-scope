# Usage: ls-basemap-register <checkpoint.pt> --id my-map --embedding-model sentence-transformers/all-MiniLM-L6-v2
#
# Adds (or updates) an entry in basemap_models.json for a basemap checkpoint,
# computing the canonical extent from the map's own training coordinates
# (sibling coordinates.npy, or --coordinates). Registration is what makes a
# map a stable, comparable target: the extent is derived once from the
# training rows — the same padded percentile box the density render uses — so
# every dataset projected through the map lands in the same frame, and the
# embedding-model compatibility check has something to check against.
import argparse
import json
import os

from importlib.resources import files


def main():
    parser = argparse.ArgumentParser(
        description='Register a basemap checkpoint in basemap_models.json')
    parser.add_argument('checkpoint', type=str, help='Path to the .pt checkpoint')
    parser.add_argument('--id', type=str, default=None,
                        help='Registry id (default: the checkpoint directory name)')
    parser.add_argument('--name', type=str, default=None, help='Human-friendly name')
    parser.add_argument('--embedding-model', type=str, required=True,
                        help="Embedding model the map was trained on, e.g. "
                             "'sentence-transformers/all-MiniLM-L6-v2'")
    parser.add_argument('--coordinates', type=str, default=None,
                        help='Training coordinates .npy (default: sibling coordinates.npy)')
    parser.add_argument('--description', type=str, default=None)
    parser.add_argument('--embedding-prompt', type=str, default=None,
                        choices=['raw'], help="Set 'raw' when the map was trained on "
                        "prompt-free embeddings (enables the prompt-convention check)")
    parser.add_argument('--force', action='store_true',
                        help='Replace an existing entry with the same id')
    args = parser.parse_args()
    register(args.checkpoint, map_id=args.id, name=args.name,
             embedding_model=args.embedding_model, coordinates=args.coordinates,
             description=args.description, embedding_prompt=args.embedding_prompt,
             force=args.force)


def registry_path():
    return str(files('latentscope.models').joinpath('basemap_models.json'))


def register(checkpoint, *, map_id=None, name=None, embedding_model=None,
             coordinates=None, description=None, embedding_prompt=None, force=False):
    from latentscope.scripts.basemap import (
        EXTENT_PAD,
        EXTENT_PERCENTILES,
        _extent_from_coordinates,
        _pack_artifacts,
    )
    from latentscope.scripts.basemap_nets import load_basemap_checkpoint

    checkpoint = os.path.abspath(checkpoint)
    if not os.path.exists(checkpoint):
        raise ValueError(f"checkpoint not found: {checkpoint}")
    pack = _pack_artifacts(checkpoint)
    coordinates = coordinates or pack.get("coordinates")
    if not coordinates or not os.path.exists(coordinates):
        raise ValueError("no training coordinates found (no sibling coordinates.npy; "
                         "pass --coordinates) — without them there is no canonical frame")

    map_id = map_id or os.path.basename(os.path.dirname(checkpoint))
    _, info = load_basemap_checkpoint(checkpoint, "cpu")

    import numpy as np
    n_reference = int(np.load(coordinates, mmap_mode="r").shape[0])
    mins, maxs = _extent_from_coordinates(coordinates)

    entry = {
        "id": map_id,
        "name": name or map_id,
        "checkpoint": checkpoint,
        "coordinates": coordinates,
        "embedding_model": embedding_model,
        "dimensions": info["d_in"],
        "extent": {
            "min_values": mins,
            "max_values": maxs,
            "percentiles": list(EXTENT_PERCENTILES),
            "pad": EXTENT_PAD,
            "n_reference": n_reference,
            "reference": "the map's own training rows (coordinates.npy), "
                         "same box as density.png",
        },
    }
    if "density_png" in pack:
        entry["density_png"] = pack["density_png"]
    if description:
        entry["description"] = description
    if embedding_prompt:
        entry["embedding_prompt"] = embedding_prompt

    # provenance from a summary.json sibling when present (map packs write one)
    if "summary" in pack:
        with open(pack["summary"]) as f:
            summary = json.load(f)
        for key in ("provenance", "evidence_status", "rows"):
            if key in summary:
                entry.setdefault("summary", {})[key] = summary[key]

    path = registry_path()
    with open(path) as f:
        registry = json.load(f)
    existing = [i for i, m in enumerate(registry) if m["id"] == map_id]
    if existing and not force:
        raise ValueError(f"'{map_id}' already registered (use --force to replace)")
    if existing:
        registry[existing[0]] = entry
    else:
        registry.append(entry)
    with open(path, "w") as f:
        json.dump(registry, f, indent=2)
        f.write("\n")
    print(f"registered '{map_id}' ({info['d_in']}d, {n_reference:,} reference rows) -> {path}")
    return entry


if __name__ == "__main__":
    main()
