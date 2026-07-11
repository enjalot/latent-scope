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
    parser.add_argument('--seed', type=int, help='Random seed', default=None)
    parser.add_argument('--sae_id', type=str, help='SAE to project instead of embedding', default=None)
    parser.add_argument('--name', type=str, help='Human-friendly name for this umap', default=None)
    parser.add_argument('--description', type=str, help='Free-text description for this umap',
                        default=None)

    # Parse arguments
    args = parser.parse_args()

    seed = args.seed
    if seed == -1:
        seed = None

    if args.sae_id:
        sparse_umapper(args.dataset_id, args.embedding_id, args.sae_id, args.neighbors, args.min_dist,
                       save=args.save, init=args.init, seed=seed, name=args.name,
                       description=args.description, dimensions=args.dimensions)
    else:
        umapper(args.dataset_id, args.embedding_id, args.neighbors, args.min_dist, save=args.save,
                init=args.init, align=args.align, seed=seed, name=args.name,
                description=args.description, dimensions=args.dimensions)


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


def umapper(dataset_id, embedding_id, neighbors=25, min_dist=0.1, save=False, init=None, align=None,
            seed=None, name=None, description=None, dimensions=2):
    DATA_DIR = get_data_dir()
    # read in the embeddings

    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_files = [f for f in os.listdir(umap_dir) if re.match(r"umap-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1

    # make the umap name from the number, zero padded to 3 digits
    umap_id = f"umap-{next_umap_number:03d}"
    print("RUNNING:", umap_id)

    import pickle

    import h5py
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import umap

    print("loading embeddings")
    # embedding_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{embedding_id}.h5")
    # with h5py.File(embedding_path, 'r') as f:
    #     dataset = f["embeddings"]
    #     embeddings = np.array(dataset)
    embeddings = load_embeddings(dataset_id, embedding_id)

    def process_umap_embeddings(umap_id, umap_embeddings, emb_id, align_id=None):
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
        print("a_embeddings", len(a_embeddings), a_embeddings[0].shape[0])
        relations = [{j: j for j in range(a_embeddings[i].shape[0])} for i in range(len(a_embeddings)-1)]
        print("relations", len(relations))
        aligned = reducer.fit_transform(a_embeddings, relations=relations)
        print("ALIGNED", aligned)
        for i,emb in enumerate(a_embedding_ids):
            print("processing", emb, "umap", next_umap_number+i)
            process_umap_embeddings(f"umap-{next_umap_number+i:03d}", aligned[i], emb, umap_id)

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

def sparse_umapper(dataset_id, embedding_id, sae_id, neighbors=25, min_dist=0.1, save=False,
                   init=None, seed=None, name=None, description=None, dimensions=2):
    DATA_DIR = get_data_dir()
    # read in the embeddings

    umap_dir = os.path.join(DATA_DIR, dataset_id, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_files = [f for f in os.listdir(umap_dir) if re.match(r"umap-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1

    # make the umap name from the number, zero padded to 3 digits
    umap_id = f"umap-{next_umap_number:03d}"
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
