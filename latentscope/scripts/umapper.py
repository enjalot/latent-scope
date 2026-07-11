# Usage: python umapper.py <dataset_id> <model> <neighbors> <min_dist>
# Example: python umapper.py dadabase-curated BAAI_bge-small-en-v1.5 50 0.075
import argparse
import json
import os
import re
import sys

from latentscope.util import get_data_dir


def main():
    parser = argparse.ArgumentParser(description='UMAP embeddings for a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='Name of embedding model to use')
    parser.add_argument('neighbors', type=int, nargs="?", help='Output file', default=25)
    parser.add_argument('min_dist', type=float, nargs="?", help='Output file', default=0.075)
    parser.add_argument('--dimensions', type=int, help='Number of UMAP output dimensions (2 or 3)',
                        default=2)
    parser.add_argument('--init', type=str, help='Initialize with UMAP', default=None)
    parser.add_argument('--align', type=str, help='Align UMAP with multiple embeddings', default=None)
    parser.add_argument('--save', action='store_true', help='Save the UMAP model')
    parser.add_argument('--transform-from', dest='transform_from', type=str, default=None,
                        help='Project rows appended since an existing umap through its saved '
                             '(--save) reducer; old points keep their published positions')
    parser.add_argument('--register-to', dest='register_to', type=str, default=None,
                        help='Register the new layout onto an existing umap with a similarity '
                             'transform fit on the shared row prefix')
    parser.add_argument('--seed', type=int, help='Random seed', default=None)
    parser.add_argument('--sae_id', type=str, help='SAE to project instead of embedding', default=None)
    parser.add_argument('--granularity', type=str, choices=['rows', 'tokens'], default='rows',
                        help='Project one point per dataset row (default) or one point per '
                             'token of a late-interaction embedding (requires ls-tokenize)')
    parser.add_argument('--fit_sample', type=int, default=1_000_000,
                        help='Token granularity only: max tokens the reducer is fit on; '
                             'the rest are batch-transformed through the fitted reducer')
    parser.add_argument('--name', type=str, help='Human-friendly name for this umap', default=None)
    parser.add_argument('--description', type=str, help='Free-text description for this umap',
                        default=None)

    # Parse arguments
    args = parser.parse_args()

    seed = args.seed
    if seed == -1:
        seed = None

    if args.granularity == 'tokens':
        if args.align or args.init or args.sae_id or args.register_to or args.transform_from:
            parser.error("--granularity tokens cannot be combined with "
                         "--align/--init/--sae_id/--register-to/--transform-from")
        token_umapper(args.dataset_id, args.embedding_id, args.neighbors, args.min_dist,
                      seed=seed, fit_sample=args.fit_sample, save=args.save,
                      name=args.name, description=args.description)
    elif args.transform_from:
        if args.align or args.init or args.save or args.sae_id or args.register_to:
            parser.error("--transform-from cannot be combined with "
                         "--align/--init/--save/--sae_id/--register-to")
        # neighbors/min_dist are ignored in this mode (the saved reducer already
        # encodes them); the source umap's values are inherited for provenance.
        transform_umap(args.dataset_id, args.embedding_id, args.transform_from,
                       name=args.name, description=args.description)
    elif args.sae_id:
        if args.register_to:
            parser.error("--register-to is not supported with --sae_id")
        sparse_umapper(args.dataset_id, args.embedding_id, args.sae_id, args.neighbors, args.min_dist,
                       save=args.save, init=args.init, seed=seed, name=args.name,
                       description=args.description, dimensions=args.dimensions)
    else:
        umapper(args.dataset_id, args.embedding_id, args.neighbors, args.min_dist, save=args.save,
                init=args.init, align=args.align, seed=seed, register_to=args.register_to,
                name=args.name, description=args.description, dimensions=args.dimensions)


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

def _save_umap_preview(umap_embeddings, out_path, dimensions=2):
    """Render the gallery thumbnail PNG for a umap run.

    2D umaps get the classic flat scatter (unchanged). 3D umaps (``dimensions``
    >= 3, with a z column) get a matplotlib 3D scatter with subtle depth cueing:
    points are drawn back-to-front and their size / opacity / lightness fall off
    with distance from the camera so the projection reads as a volume rather than
    a flat blob. Output is 1024x1024 at 72 dpi, axis-free, filling the frame.
    """
    import math

    import matplotlib.pyplot as plt
    import numpy as np

    point_size = calculate_point_size(umap_embeddings.shape[0])

    if dimensions >= 3 and umap_embeddings.shape[1] >= 3:
        x = umap_embeddings[:, 0]
        y = umap_embeddings[:, 1]
        z = umap_embeddings[:, 2]
        fig = plt.figure(figsize=(14.22, 14.22))  # 1024px at 72 dpi
        ax = fig.add_subplot(111, projection='3d')
        elev, azim = 22, -60
        ax.view_init(elev=elev, azim=azim)
        # Unit vector from the scene toward the camera (matplotlib elev/azim
        # convention) -> a per-point depth scalar for the cueing ramp.
        e, a = math.radians(elev), math.radians(azim)
        cam = np.array([math.cos(e) * math.cos(a),
                        math.cos(e) * math.sin(a),
                        math.sin(e)])
        depth = x * cam[0] + y * cam[1] + z * cam[2]
        dmin, dmax = float(depth.min()), float(depth.max())
        t = (depth - dmin) / (dmax - dmin) if dmax > dmin else np.zeros_like(depth)
        order = np.argsort(depth)  # far first, near points drawn on top
        base = float(np.clip(point_size, 4, 16))
        sizes = base * (0.4 + 0.9 * t)
        colors = plt.cm.viridis(0.12 + 0.72 * t)
        colors[:, 3] = 0.25 + 0.55 * t  # nearer points more opaque
        ax.scatter(x[order], y[order], z[order], s=sizes[order], c=colors[order],
                   edgecolors='none', depthshade=False)
        ax.set_axis_off()
        try:
            ax.set_box_aspect((1, 1, 1))
        except Exception:
            pass
        # Overscan the axes so the projected cloud fills the thumbnail instead
        # of floating in the middle of the 3D axes' bounding cube.
        ax.set_position([-0.18, -0.18, 1.36, 1.36])
        fig.savefig(out_path, dpi=72)
        plt.close(fig)
        return

    fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px by 1024px at 72 dpi
    print("POINT SIZE", point_size, "for", umap_embeddings.shape[0], "points")
    ax.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5)
    ax.axis('off')  # remove axis
    ax.set_position([0, 0, 1, 1])  # remove margins
    fig.savefig(out_path)
    plt.close(fig)


def load_embeddings(dataset_id, embedding_id):
    import h5py
    import numpy as np

    from latentscope.util.embedding_store import load_embeddings as lance_load_embeddings
    DATA_DIR = get_data_dir()

    if embedding_id[0:3] == "sae":
        sae_path = os.path.join(DATA_DIR, dataset_id, "saes", f"{embedding_id}.h5")
        with h5py.File(sae_path, 'r') as f:
            all_acts = f.get("top_acts")[:]
            all_indices = f.get("top_indices")[:]

        # read the meta json for sae
        with open(os.path.join(DATA_DIR, dataset_id, "saes", f"{embedding_id}.json")) as f:
            meta = json.load(f)

        import scipy
        matrix = scipy.sparse.lil_matrix((all_acts.shape[0], meta["num_features"]), dtype=np.float32)
        for i in range(all_acts.shape[0]):
            matrix.rows[i] = all_indices[i].tolist()
            matrix.data[i] = all_acts[i].tolist()
        return matrix
    else:
        # Use LanceDB-backed store (with HDF5 fallback)
        return lance_load_embeddings(DATA_DIR, dataset_id, embedding_id)

def _make_cpu_reducer(neighbors, min_dist, seed, init_array=None, n_components=2):
    """Build a CPU umap-learn reducer with our canonical params."""
    import umap

    kwargs = dict(
        n_neighbors=neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=seed,
        n_components=n_components,
        verbose=True,
    )
    if init_array is not None:
        kwargs['init'] = init_array
    return umap.UMAP(**kwargs)


def _make_cuml_reducer(neighbors, min_dist, seed, n_components=2):
    """Build a cuML (GPU) reducer, mapping umap-learn params faithfully.

    Param mapping umap-learn -> cuml.manifold.UMAP:
      n_neighbors  -> n_neighbors
      min_dist     -> min_dist
      metric       -> metric ('cosine'; supported by cuML/cuvs >= 25.x)
      n_components -> n_components (2)
      random_state -> random_state (int seed; None => non-deterministic)
      verbose      -> verbose (accepts bool)
    Array warm-start `init` has no cuML equivalent (cuML `init` only takes the
    strings 'spectral'/'random'), so the warm-start path stays CPU-only.
    """
    import cuml

    return cuml.manifold.UMAP(
        n_neighbors=neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=seed,
        n_components=n_components,
        verbose=True,
    )


def _to_numpy(arr):
    """Coerce a cuML/cupy/cudf output into a numpy array."""
    import numpy as np

    if hasattr(arr, "to_numpy"):   # cudf/pandas DataFrame
        return arr.to_numpy()
    if hasattr(arr, "get"):        # cupy ndarray
        return arr.get()
    return np.asarray(arr)


def _reduce_umap(embeddings, neighbors, min_dist, seed, use_cuml, init_array=None, n_components=2):
    """Fit-transform embeddings to ``n_components`` dims, preferring cuML when requested.

    Returns (umap_embeddings, reducer). On the GPU path the fitted cuML reducer
    is returned too (callers only pickle CPU reducers). If cuML construction or
    fit raises, we log a clear message and fall back to CPU umap-learn so a run
    never dies on the GPU path. Array warm-start (init_array) is CPU-only.
    """
    if use_cuml and init_array is None:
        try:
            reducer = _make_cuml_reducer(neighbors, min_dist, seed, n_components=n_components)
            print("umapper: reducing with cuML GPU UMAP (metric=cosine)")
            sys.stdout.flush()
            umap_embeddings = _to_numpy(reducer.fit_transform(embeddings))
            return umap_embeddings, reducer
        except Exception as e:
            print(f"umapper: cuML UMAP failed ({e!r}); falling back to CPU umap-learn")
            sys.stdout.flush()
    elif use_cuml and init_array is not None:
        print("umapper: warm-start init has no cuML equivalent; using CPU umap-learn")

    reducer = _make_cpu_reducer(neighbors, min_dist, seed, init_array, n_components=n_components)
    print("umapper: reducing with CPU umap-learn UMAP (metric=cosine)")
    sys.stdout.flush()
    umap_embeddings = reducer.fit_transform(embeddings)
    return umap_embeddings, reducer


def _umap_columns(dimensions):
    """Canonical parquet column names for an ``n_components``-D UMAP.

    2 -> [x, y]; 3 -> [x, y, z]. Higher dims fall back to x, y, z, d3, d4, ...
    """
    base = ['x', 'y', 'z']
    if dimensions <= len(base):
        return base[:dimensions]
    return base + [f"d{i}" for i in range(len(base), dimensions)]


def _next_umap_id(umap_dir):
    """Allocate the next umap-NNN id from the json files already in umap_dir."""
    umap_files = [f for f in os.listdir(umap_dir) if re.match(r"umap-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1
    return f"umap-{next_umap_number:03d}"


def _read_umap_meta(umap_dir, umap_id):
    meta_path = os.path.join(umap_dir, f"{umap_id}.json")
    if not os.path.exists(meta_path):
        raise ValueError(f"umap meta not found: {meta_path}")
    with open(meta_path) as f:
        return json.load(f)


def _resolve_reducer_id(umap_dir, umap_id):
    """Follow the reducer_id chain from umap_id to a umap with a saved .pkl.

    A umap made with --save has its own pickle; a umap made with
    --transform-from records the reducer_id whose pickle produced it (pickles
    are large so they are never copied). Returns the id whose .pkl exists, or
    None if the chain dead-ends.
    """
    current = umap_id
    seen = set()
    while current and current not in seen:
        seen.add(current)
        if os.path.exists(os.path.join(umap_dir, f"{current}.pkl")):
            return current
        meta_path = os.path.join(umap_dir, f"{current}.json")
        if not os.path.exists(meta_path):
            return None
        with open(meta_path) as f:
            current = json.load(f).get("reducer_id")
    return None


def transform_umap(dataset_id, embedding_id, transform_from, name=None, description=None):
    """Project rows appended since `transform_from` through its saved reducer.

    The daily half of the growing-dataset workflow (issue #142): old rows are
    copied verbatim from the source umap's parquet so the published map stays
    pixel-stable; only the new rows (embedding rows beyond the source umap's
    length) are transformed, then mapped into the source's [-1, 1] frame using
    its stored min/max (or its registration transform if the source was made
    with --register-to). New points may land slightly outside [-1, 1]; they
    are left there rather than rescaling the old points.

    Returns the new umap id, or None if there were no new rows.
    """
    DATA_DIR = get_data_dir()
    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")

    import pickle

    import numpy as np
    import pandas as pd

    from latentscope.scripts.registration import (
        apply_normalization,
        apply_similarity,
        count_out_of_frame,
    )

    source_meta = _read_umap_meta(umap_dir, transform_from)
    source_embedding_id = source_meta.get("embedding_id")
    if source_embedding_id != embedding_id:
        raise ValueError(
            f"{transform_from} was fit on embedding {source_embedding_id!r}, not "
            f"{embedding_id!r}; transforming through a reducer fit on a different "
            "embedding is not meaningful")

    reducer_id = _resolve_reducer_id(umap_dir, transform_from)
    if reducer_id is None:
        raise ValueError(
            f"no saved reducer (.pkl) found for {transform_from} (or its reducer_id "
            "chain); re-run the source umap with --save to enable --transform-from")
    with open(os.path.join(umap_dir, f"{reducer_id}.pkl"), 'rb') as f:
        reducer = pickle.load(f)

    source_df = pd.read_parquet(os.path.join(umap_dir, f"{transform_from}.parquet"))
    n_old = len(source_df)

    print("loading embeddings")
    embeddings = load_embeddings(dataset_id, embedding_id)
    n_total = embeddings.shape[0]
    if n_total < n_old:
        raise ValueError(
            f"embedding {embedding_id} has {n_total} rows but source umap "
            f"{transform_from} has {n_old}; the dataset should only grow")
    if n_total == n_old:
        print(f"no new rows: {embedding_id} and {transform_from} both have {n_total} rows")
        return None

    umap_id = _next_umap_id(umap_dir)
    print("RUNNING:", umap_id)
    print(f"transforming {n_total - n_old} new rows through {reducer_id}")
    new_raw = reducer.transform(embeddings[n_old:])

    min_values = np.array(source_meta["min_values"])
    max_values = np.array(source_meta["max_values"])
    registration = source_meta.get("registration")
    if registration is not None:
        # the source's parquet frame came from a similarity registration, not
        # from min/max normalization; reuse the same transform for new points
        new_coords = apply_similarity(new_raw, registration["scale"],
                                      np.array(registration["rotation"]),
                                      np.array(registration["translation"]))
    else:
        new_coords = apply_normalization(new_raw, min_values, max_values)
    outside = count_out_of_frame(new_coords)
    if outside > 0:
        print(f"{outside} new points fall outside [-1, 1]; leaving them "
              "(old points stay fixed)")

    # old rows verbatim, new rows appended in the same dtype; the source umap's
    # dimensionality is inherited (a 3D source yields a 3D result)
    dimensions = source_meta.get("dimensions", 2)
    columns = _umap_columns(dimensions)
    coord_dtype = source_df[columns[0]].dtype
    new_df = pd.DataFrame(new_coords.astype(coord_dtype), columns=columns)
    df = pd.concat([source_df[columns], new_df], ignore_index=True)
    output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
    df.to_parquet(output_file)
    print("wrote", output_file)

    _save_umap_preview(df.to_numpy(), os.path.join(umap_dir, f"{umap_id}.png"),
                       dimensions=dimensions)

    with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
        meta = {
            "id": umap_id,
            "embedding_id": embedding_id,
            # inherited from the source for provenance; the pickled reducer
            # already encodes them
            "neighbors": source_meta.get("neighbors"),
            "min_dist": source_meta.get("min_dist"),
            # inherited from the source: a transform can't change dimensionality
            "dimensions": dimensions,
            # the source's frame is this umap's frame
            "min_values": min_values.tolist(),
            "max_values": max_values.tolist(),
            "transformed_from": transform_from,
            "reducer_id": reducer_id,
        }
        if registration is not None:
            meta["registration"] = registration
        if name is not None:
            meta["name"] = name
        if description is not None:
            meta["description"] = description
        json.dump(meta, f, indent=2)

    print("done with", umap_id)
    return umap_id


def umapper(dataset_id, embedding_id, neighbors=25, min_dist=0.1, save=False, init=None, align=None,
            seed=None, register_to=None, name=None, description=None, dimensions=2):
    DATA_DIR = get_data_dir()
    # read in the embeddings

    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_id = _next_umap_id(umap_dir)
    next_umap_number = int(umap_id.split("-")[1])
    print("RUNNING:", umap_id)

    import pickle

    import h5py
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import umap

    from latentscope.scripts.registration import (
        count_out_of_frame,
        prefix_relations,
        register_layout,
    )

    print("loading embeddings")
    # embedding_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{embedding_id}.h5")
    # with h5py.File(embedding_path, 'r') as f:
    #     dataset = f["embeddings"]
    #     embeddings = np.array(dataset)
    embeddings = load_embeddings(dataset_id, embedding_id)

    # --register-to: load the published layout the new one should be anchored to
    register_target = None
    if register_to is not None and register_to != "":
        print("registering onto", register_to)
        target_meta = _read_umap_meta(umap_dir, register_to)
        target_dimensions = target_meta.get("dimensions", 2)
        if target_dimensions != 2:
            raise ValueError(
                f"--register-to only supports 2D target umaps ({register_to} has "
                f"dimensions={target_dimensions}); similarity registration is 2D-only")
        if dimensions != target_dimensions:
            print(f"--register-to {register_to}: inheriting the target's dimensionality "
                  f"({target_dimensions}) instead of the requested {dimensions}")
            dimensions = target_dimensions
        target_df = pd.read_parquet(os.path.join(umap_dir, f"{register_to}.parquet"))
        register_target = {
            "umap_id": register_to,
            "coords": target_df[['x', 'y']].to_numpy(),
            # after registration the coords are already in the target's [-1, 1]
            # frame, so the target's frame values carry over (identity fallback
            # for old metas without them)
            "min_values": target_meta.get("min_values", [-1.0, -1.0]),
            "max_values": target_meta.get("max_values", [1.0, 1.0]),
        }

    def process_umap_embeddings(umap_id, umap_embeddings, emb_id, align_id=None):
        registration = None
        if register_target is not None:
            # similarity-register (rotation + uniform scale + translation) onto
            # the target via the shared row prefix; the result is already in the
            # target's [-1, 1] frame so min/max renormalization is skipped
            umap_embeddings, (r_scale, r_rot, r_trans) = register_layout(
                umap_embeddings, register_target["coords"])
            umap_embeddings = umap_embeddings.astype(np.float32)
            registration = {
                "scale": float(r_scale),
                "rotation": r_rot.tolist(),
                "translation": r_trans.tolist(),
            }
            min_values = np.array(register_target["min_values"])
            max_values = np.array(register_target["max_values"])
            outside = count_out_of_frame(umap_embeddings)
            if outside > 0:
                print(f"{umap_id}: {outside} registered points fall outside [-1, 1]; "
                      "not rescaling")
        else:
            min_values = np.min(umap_embeddings, axis=0)
            max_values = np.max(umap_embeddings, axis=0)

            # Scale the embeddings to the range [0, 1]
            umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)

            # Scale the embeddings to the range [-1, 1]
            umap_embeddings = 2 * umap_embeddings - 1

        print("writing normalized umap", umap_id)
        # save umap embeddings to a parquet file with columns x,y[,z]
        df = pd.DataFrame(umap_embeddings, columns=_umap_columns(dimensions))

        # TODO I moved this to scope.py it's cheap and it makes it backwards compatible
        # Calculate tile indices for a 64x64 grid from -1 to 1
        # def make_tiles(x, y, num_tiles=64):
        #     tile_size = 2.0 / num_tiles  # Size of each tile (-1 to 1 = range of 2)

        #     # Calculate row and column indices (0-63) for each point
        #     col_indices = np.floor((x + 1) / tile_size).astype(int)
        #     row_indices = np.floor((y + 1) / tile_size).astype(int)

        #     # Clip indices to valid range in case of numerical edge cases
        #     col_indices = np.clip(col_indices, 0, num_tiles - 1)
        #     row_indices = np.clip(row_indices, 0, num_tiles - 1)

        #     # Convert 2D grid indices to 1D tile index (row * num_cols + col)
        #     tile_indices = row_indices * num_tiles + col_indices
        #     return tile_indices

        # df['tile_index_32'] = make_tiles(umap_embeddings[:, 0], umap_embeddings[:, 1], 32)
        # df['tile_index_64'] = make_tiles(umap_embeddings[:, 0], umap_embeddings[:, 1], 64)
        # df['tile_index_128'] = make_tiles(umap_embeddings[:, 0], umap_embeddings[:, 1], 128)

        output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
        df.to_parquet(output_file)
        print("wrote", output_file)

        # generate a scatterplot of the umap embeddings and save it to a file.
        # 3D umaps get a depth-cued 3D projection thumbnail (see helper).
        _save_umap_preview(umap_embeddings, os.path.join(umap_dir, f"{umap_id}.png"),
                           dimensions=dimensions)

        # save a json file with the umap parameters
        with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
            meta = {
                "id": umap_id,
                "embedding_id": emb_id,
                "neighbors": neighbors,
                "min_dist": min_dist,
                "dimensions": dimensions,
                "min_values": min_values.tolist(),
                "max_values": max_values.tolist(),
            }
            if init is not None and init != "":
                meta["init"] = init,
            if align is not None and align != "":
                meta["align"] = f"{embedding_id},{align}"
                meta["align_id"] = align_id
            if register_target is not None:
                meta["registered_to"] = register_target["umap_id"]
                meta["registration"] = registration
            if name is not None:
                meta["name"] = name
            if description is not None:
                meta["description"] = description
            json.dump(meta, f, indent=2)
        f.close()

    ### END OF process_umap_embeddings


    # Resolve the compute backend once; only the plain 2D reduction below uses
    # the cuML GPU path. AlignedUMAP, warm-start init, and save (pickle) stay
    # CPU-only (see notes at each site).
    from latentscope.util.device import resolve_device
    res = resolve_device()

    if align is not None and align != "":
        print("aligned umap", align)
        print("umapper: AlignedUMAP has no cuML equivalent; running CPU umap-learn")
        # split the align string into umap names
        embs = align.split(",")
        # load each embedding from its h5 file
        a_embedding_ids = [embedding_id]
        a_embeddings = [embeddings]
        for emb in embs:
            print("loading", emb)
            # emb_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{emb}.h5")
            # with h5py.File(emb_path, 'r') as f:
            #     dataset = f["embeddings"]
            #     a_emb = np.array(dataset)
            a_emb = load_embeddings(dataset_id, emb)
            print("loaded", emb, "shape", a_emb.shape)
            a_embeddings.append(a_emb)
            a_embedding_ids.append(emb)

        reducer = umap.AlignedUMAP(
            n_neighbors=neighbors,
            min_dist=min_dist,
            metric='cosine',
            random_state=seed,
            n_components=dimensions,
            verbose=True,
        )
        # shared-prefix relations: for growing (append-only) windows the shared
        # rows between window i and i+1 are the index prefix of the shorter one;
        # identical to the old identity relations when lengths are equal
        lengths = [a_emb.shape[0] for a_emb in a_embeddings]
        print("a_embeddings", len(a_embeddings), "lengths", lengths)
        relations = prefix_relations(lengths)
        for i, rel in enumerate(relations):
            print(f"relation {i} -> {i + 1}: {len(rel)} shared rows")
        aligned = reducer.fit_transform(a_embeddings, relations=relations)
        print("ALIGNED", aligned)
        import pickle
        mappers = getattr(reducer, "mappers_", None)
        for i,emb in enumerate(a_embedding_ids):
            aligned_umap_id = f"umap-{next_umap_number+i:03d}"
            print("processing", emb, "umap", next_umap_number+i)
            process_umap_embeddings(aligned_umap_id, aligned[i], emb, umap_id)
            if save and mappers is not None:
                # Each slice's mapper is a full fitted UMAP, but its internal
                # embedding_ lives in the mapper's OWN frame, not the aligned
                # frame that was just written (alignment happens outside the
                # mappers). UMAP.transform embeds new points relative to
                # embedding_, so swap in the slice's aligned coordinates
                # before pickling — a later --transform-from then projects
                # newly appended rows into this slice's raw aligned frame,
                # and the meta's min/max (or registration transform) carries
                # them into the published frame.
                mapper = mappers[i]
                mapper.embedding_ = np.ascontiguousarray(
                    np.asarray(aligned[i]), dtype=np.float32)
                with open(os.path.join(umap_dir, f"{aligned_umap_id}.pkl"), "wb") as f:
                    pickle.dump(mapper, f)
                print(f"saved aligned reducer to {aligned_umap_id}.pkl")

        print("done with aligned umap")
        return

    init_array = None
    if init is not None and init != "":
        print("loading umap", init)
        initial_df = pd.read_parquet(os.path.join(umap_dir, f"{init}.parquet"))
        init_array = initial_df.to_numpy()
        print("initial shape", init_array.shape)

    # Save (pickle) requires a portable CPU umap-learn reducer, so force CPU when
    # saving. Warm-start init is also CPU-only (handled inside _reduce_umap).
    use_cuml = res.use_cuml and not save
    if res.use_cuml and save:
        print("umapper: --save pickles a CPU reducer; running CPU umap-learn")
    print("reducing", embeddings.shape[1], "embeddings to", dimensions, "dimensions")

    umap_embeddings, reducer = _reduce_umap(
        embeddings, neighbors, min_dist, seed, use_cuml, init_array=init_array,
        n_components=dimensions
    )
    process_umap_embeddings(umap_id, umap_embeddings, embedding_id)

    if save:
        # save a pickle of the umap
        with open(os.path.join(umap_dir, f'{umap_id}.pkl'), 'wb') as f:
            pickle.dump(reducer, f)

    print("done with", umap_id)

def token_umapper(dataset_id, embedding_id, neighbors=25, min_dist=0.1, seed=None,
                  fit_sample=1_000_000, save=False, name=None, description=None,
                  transform_batch_tokens=250_000):
    """Project every token of a late-interaction embedding to 2D.

    One point per stored token vector, in global token_index order (the same
    order ls-tokenize writes metadata in). Token counts routinely reach
    millions, so the full token set is never materialized: the reducer is fit
    on at most `fit_sample` uniformly sampled tokens, then every token is
    streamed through reducer.transform in bounded batches. When the corpus
    fits inside `fit_sample` a plain fit_transform runs instead.
    """
    DATA_DIR = get_data_dir()
    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    umap_id = _next_umap_id(umap_dir)
    print("RUNNING:", umap_id, "(granularity=tokens)")

    import pickle

    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd

    from latentscope.util.embedding_store import (
        count_token_metadata,
        has_token_metadata,
        iter_token_vectors,
    )

    if not has_token_metadata(DATA_DIR, dataset_id, embedding_id):
        print(f"No token metadata for {embedding_id}. Run:\n"
              f"  ls-tokenize {dataset_id} {embedding_id}\n"
              "first — it validates that token strings align with the stored "
              "token vectors, which token maps depend on.")
        sys.exit(1)

    total_tokens = count_token_metadata(DATA_DIR, dataset_id, embedding_id)
    print(f"{total_tokens} tokens total")

    from latentscope.util.device import resolve_device
    res = resolve_device()
    use_cuml = res.use_cuml and not save
    if res.use_cuml and save:
        print("umapper: --save pickles a CPU reducer; running CPU umap-learn")

    if total_tokens <= fit_sample:
        print("fitting on all tokens")
        parts = []
        for _, vec_list in iter_token_vectors(DATA_DIR, dataset_id, embedding_id):
            parts.append(np.concatenate(vec_list))
        all_tokens = np.concatenate(parts)
        parts = None
        umap_embeddings, reducer = _reduce_umap(
            all_tokens, neighbors, min_dist, seed, use_cuml)
        all_tokens = None
        fit_n = total_tokens
    else:
        fit_n = fit_sample
        print(f"fitting on a uniform sample of {fit_n} tokens, "
              "then transforming the rest")
        rng = np.random.default_rng(seed if seed is not None else 0)
        sample_idx = np.sort(rng.choice(total_tokens, size=fit_n, replace=False))

        parts = []
        position = 0
        for _, vec_list in iter_token_vectors(DATA_DIR, dataset_id, embedding_id):
            flat = np.concatenate(vec_list)
            lo = np.searchsorted(sample_idx, position)
            hi = np.searchsorted(sample_idx, position + len(flat))
            if hi > lo:
                parts.append(flat[sample_idx[lo:hi] - position])
            position += len(flat)
        fit_matrix = np.concatenate(parts)
        parts = None

        _, reducer = _reduce_umap(fit_matrix, neighbors, min_dist, seed, use_cuml)
        fit_matrix = None

        print("transforming all tokens through the fitted reducer")
        outputs = []
        buffer = []
        buffered = 0
        def flush():
            nonlocal buffer, buffered
            if not buffer:
                return
            batch = np.concatenate(buffer)
            outputs.append(_to_numpy(reducer.transform(batch)).astype(np.float32))
            buffer = []
            buffered = 0
        for _, vec_list in iter_token_vectors(DATA_DIR, dataset_id, embedding_id):
            flat = np.concatenate(vec_list)
            buffer.append(flat)
            buffered += len(flat)
            if buffered >= transform_batch_tokens:
                flush()
        flush()
        umap_embeddings = np.concatenate(outputs)
        outputs = None

    assert len(umap_embeddings) == total_tokens, (
        f"projected {len(umap_embeddings)} tokens, expected {total_tokens}")

    min_values = np.min(umap_embeddings, axis=0)
    max_values = np.max(umap_embeddings, axis=0)
    umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)
    umap_embeddings = 2 * umap_embeddings - 1

    print("writing normalized umap", umap_id)
    df = pd.DataFrame(umap_embeddings.astype(np.float32), columns=['x', 'y'])
    output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
    df.to_parquet(output_file)
    print("wrote", output_file)

    fig, ax = plt.subplots(figsize=(14.22, 14.22))
    # calculate_point_size is tuned for row counts; token maps are 100-300x
    # denser, so scale the preview marker down or the PNG is a solid blob
    n_points = umap_embeddings.shape[0]
    point_size = 0.1 if n_points > 100_000 else calculate_point_size(n_points)
    print("POINT SIZE", point_size, "for", n_points, "points")
    plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5)
    plt.axis('off')
    plt.gca().set_position([0, 0, 1, 1])
    plt.savefig(os.path.join(umap_dir, f"{umap_id}.png"))
    plt.close(fig)

    with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
        meta = {
            "id": umap_id,
            "embedding_id": embedding_id,
            "neighbors": neighbors,
            "min_dist": min_dist,
            "min_values": min_values.tolist(),
            "max_values": max_values.tolist(),
            "granularity": "tokens",
            "total_tokens": int(total_tokens),
            "fit_sample": int(fit_n),
        }
        if name is not None:
            meta["name"] = name
        if description is not None:
            meta["description"] = description
        json.dump(meta, f, indent=2)

    if save:
        with open(os.path.join(umap_dir, f'{umap_id}.pkl'), 'wb') as f:
            pickle.dump(reducer, f)

    print("done with", umap_id)
    return umap_id


def sparse_umapper(dataset_id, embedding_id, sae_id, neighbors=25, min_dist=0.1, save=False,
                   init=None, seed=None, name=None, description=None, dimensions=2):
    DATA_DIR = get_data_dir()
    # read in the embeddings

    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_id = _next_umap_id(umap_dir)
    print("RUNNING:", umap_id)

    import pickle

    import h5py
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import umap

    print("loading sparse embeddings")
    matrix = load_embeddings(dataset_id, sae_id)
    # sae_path = os.path.join(DATA_DIR, dataset_id, "saes", f"{sae_id}.h5")
    # with h5py.File(sae_path, 'r') as f:
    #     all_acts = f.get("top_acts")[:]
    #     all_indices = f.get("top_indices")[:]

    # # read the meta json for sae
    # with open(os.path.join(DATA_DIR, dataset_id, "saes", f"{sae_id}.json"), 'r') as f:
    #     meta = json.load(f)
    # print("SAE META", meta["id"], meta["num_features"], "features", meta["model_id"], meta["k_expansion"])

    # import scipy
    # print("ALL ACTS SHAPE", all_acts.shape)
    # print("ALL INDS SHAPE", all_indices.shape)
    # matrix = scipy.sparse.lil_matrix((all_acts.shape[0], meta["num_features"]), dtype=np.float32)
    # # matrix.rows = all_indices.tolist()
    # # matrix.data = all_acts.tolist()
    # for i in range(all_acts.shape[0]):
    #     matrix.rows[i] = all_indices[i].tolist()
    #     matrix.data[i] = all_acts[i].tolist()

    def process_umap_embeddings(umap_id, umap_embeddings, emb_id, sae_id, align_id=None):
        min_values = np.min(umap_embeddings, axis=0)
        max_values = np.max(umap_embeddings, axis=0)

        # Scale the embeddings to the range [0, 1]
        umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)

        # Scale the embeddings to the range [-1, 1]
        umap_embeddings = 2 * umap_embeddings - 1

        print("writing normalized umap", umap_id)
        # save umap embeddings to a parquet file with columns x,y[,z]
        df = pd.DataFrame(umap_embeddings, columns=_umap_columns(dimensions))
        output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
        df.to_parquet(output_file)
        print("wrote", output_file)

        # generate a scatterplot of the umap embeddings and save it to a file.
        # 3D umaps get a depth-cued 3D projection thumbnail (see helper).
        _save_umap_preview(umap_embeddings, os.path.join(umap_dir, f"{umap_id}.png"),
                           dimensions=dimensions)

        # save a json file with the umap parameters
        with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
            meta = {
                "id": umap_id,
                "embedding_id": emb_id,
                "sae_id": sae_id,
                "neighbors": neighbors,
                "min_dist": min_dist,
                "dimensions": dimensions,
            }
            if init is not None and init != "":
                meta["init"] = init,
            if name is not None:
                meta["name"] = name
            if description is not None:
                meta["description"] = description
            json.dump(meta, f, indent=2)
        f.close()


    from latentscope.util.device import resolve_device
    res = resolve_device()

    init_array = None
    if init is not None and init != "":
        print("loading umap", init)
        initial_df = pd.read_parquet(os.path.join(umap_dir, f"{init}.parquet"))
        init_array = initial_df.to_numpy()
        print("initial shape", init_array.shape)

    use_cuml = res.use_cuml and not save
    if res.use_cuml and save:
        print("umapper: --save pickles a CPU reducer; running CPU umap-learn")
    print("reducing", matrix.shape[0], "sparse features to", dimensions, "dimensions")

    import time
    time.sleep(1)  # Wait for a second before starting
    umap_embeddings, reducer = _reduce_umap(
        matrix, neighbors, min_dist, seed, use_cuml, init_array=init_array,
        n_components=dimensions
    )
    process_umap_embeddings(umap_id, umap_embeddings, embedding_id, sae_id)

    if save:
        # save a pickle of the umap
        with open(os.path.join(umap_dir, f'{umap_id}.pkl'), 'wb') as f:
            pickle.dump(reducer, f)
    print("done with", umap_id)



if __name__ == "__main__":
    main()
