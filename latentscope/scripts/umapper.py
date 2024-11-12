# Usage: python umapper.py <dataset_id> <model> <neighbors> <min_dist>
# Example: python umapper.py dadabase-curated BAAI_bge-small-en-v1.5 50 0.075
import os
import re
import sys
import json
import argparse

from latentscope.util import get_data_dir

def main():
    parser = argparse.ArgumentParser(description='UMAP embeddings for a dataset')
    parser.add_argument('dataset_id', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('embedding_id', type=str, help='Name of embedding model to use')
    parser.add_argument('neighbors', type=int, nargs="?", help='Output file', default=25)
    parser.add_argument('min_dist', type=float, nargs="?", help='Output file', default=0.075)
    parser.add_argument('--init', type=str, help='Initialize with UMAP', default=None)
    parser.add_argument('--align', type=str, help='Align UMAP with multiple embeddings', default=None)
    parser.add_argument('--save', action='store_true', help='Save the UMAP model')
    parser.add_argument('--seed', type=int, help='Random seed', default=None)
    parser.add_argument('--sae_id', type=str, help='SAE to project instead of embedding', default=None)

    # Parse arguments
    args = parser.parse_args()

    seed = args.seed
    if seed == -1:
        seed = None

    if args.sae_id:
        sparse_umapper(args.dataset_id, args.embedding_id, args.sae_id, args.neighbors, args.min_dist, save=args.save, init=args.init, seed=seed)
    else:
        umapper(args.dataset_id, args.embedding_id, args.neighbors, args.min_dist, save=args.save, init=args.init, align=args.align, seed=seed)


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

def load_embeddings(dataset_id, embedding_id):
    import h5py
    import numpy as np
    DATA_DIR = get_data_dir()

    if embedding_id[0:3] == "sae":
        sae_path = os.path.join(DATA_DIR, dataset_id, "saes", f"{embedding_id}.h5")
        with h5py.File(sae_path, 'r') as f:
            all_acts = f.get("top_acts")[:]
            all_indices = f.get("top_indices")[:]

        # read the meta json for sae
        with open(os.path.join(DATA_DIR, dataset_id, "saes", f"{embedding_id}.json"), 'r') as f:
            meta = json.load(f)
        # print("SAE META", meta["id"], meta["num_features"], "features", meta["model_id"], meta["k_expansion"])
        
        import scipy
        # print("ALL ACTS SHAPE", all_acts.shape)
        # print("ALL INDS SHAPE", all_indices.shape)
        matrix = scipy.sparse.lil_matrix((all_acts.shape[0], meta["num_features"]), dtype=np.float32)
        for i in range(all_acts.shape[0]):
            matrix.rows[i] = all_indices[i].tolist()
            matrix.data[i] = all_acts[i].tolist()
        return matrix
    else:
        emb_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{embedding_id}.h5")
        with h5py.File(emb_path, 'r') as f:
            dataset = f["embeddings"]
            embeddings = np.array(dataset)
            return embeddings

def umapper(dataset_id, embedding_id, neighbors=25, min_dist=0.1, save=False, init=None, align=None, seed=None):
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

    import umap
    import h5py
    import pickle
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt

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
        # save umap embeddings to a parquet file with columns x,y
        df = pd.DataFrame(umap_embeddings, columns=['x', 'y'])

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

        # generate a scatterplot of the umap embeddings and save it to a file
        fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px by 1024px at 72 dpi
        point_size = calculate_point_size(umap_embeddings.shape[0])
        print("POINT SIZE", point_size, "for", umap_embeddings.shape[0], "points")
        plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5)
        plt.axis('off')  # remove axis
        plt.gca().set_position([0, 0, 1, 1])  # remove margins
        plt.savefig(os.path.join(umap_dir, f"{umap_id}.png"))

        # save a json file with the umap parameters
        with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
            meta = {
                "id": umap_id, 
                "embedding_id": emb_id,
                "neighbors": neighbors, 
                "min_dist": min_dist,
                "min_values": min_values.tolist(),
                "max_values": max_values.tolist(),
            }
            if init is not None and init != "":
                meta["init"] = init,
            if align is not None and align != "":
                meta["align"] = f"{embedding_id},{align}"
                meta["align_id"] = align_id
            json.dump(meta, f, indent=2)
        f.close()

    ### END OF process_umap_embeddings


    if align is not None and align != "":
        print("aligned umap", align)
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
            n_components=2,
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

    if init is not None and init != "":
        print("loading umap", init)
        initial_df = pd.read_parquet(os.path.join(umap_dir, f"{init}.parquet"))
        initial = initial_df.to_numpy()
        print("initial shape", initial.shape)
        reducer = umap.UMAP(
            init=initial,
            n_neighbors=neighbors,
            min_dist=min_dist,
            metric='cosine',
            random_state=seed,
            n_components=2,
            verbose=True,
        )
    else:
        reducer = umap.UMAP(
            n_neighbors=neighbors,
            min_dist=min_dist,
            metric='cosine',
            random_state=seed,
            n_components=2,
            verbose=True,
        )
    print("reducing", embeddings.shape[1], "embeddings to 2 dimensions")

    import sys
    sys.stdout.flush()

    umap_embeddings = reducer.fit_transform(embeddings)
    process_umap_embeddings(umap_id, umap_embeddings, embedding_id)

    if save:
        # save a pickle of the umap
        with open(os.path.join(umap_dir, f'{umap_id}.pkl'), 'wb') as f:
            pickle.dump(reducer, f)

    print("done with", umap_id)

def sparse_umapper(dataset_id, embedding_id, sae_id, neighbors=25, min_dist=0.1, save=False, init=None, seed=None):
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

    import umap
    import h5py
    import pickle
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt

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
        # save umap embeddings to a parquet file with columns x,y
        df = pd.DataFrame(umap_embeddings, columns=['x', 'y'])
        output_file = os.path.join(umap_dir, f"{umap_id}.parquet")
        df.to_parquet(output_file)
        print("wrote", output_file)

        # generate a scatterplot of the umap embeddings and save it to a file
        fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px by 1024px at 72 dpi
        point_size = calculate_point_size(umap_embeddings.shape[0])
        print("POINT SIZE", point_size, "for", umap_embeddings.shape[0], "points")
        plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5)
        plt.axis('off')  # remove axis
        plt.gca().set_position([0, 0, 1, 1])  # remove margins
        plt.savefig(os.path.join(umap_dir, f"{umap_id}.png"))

        # save a json file with the umap parameters
        with open(os.path.join(umap_dir, f'{umap_id}.json'), 'w') as f:
            meta = {
                "id": umap_id, 
                "embedding_id": emb_id,
                "sae_id": sae_id,
                "neighbors": neighbors, 
                "min_dist": min_dist,
            }
            if init is not None and init != "":
                meta["init"] = init,
            json.dump(meta, f, indent=2)
        f.close()


    if init is not None and init != "":
        print("loading umap", init)
        initial_df = pd.read_parquet(os.path.join(umap_dir, f"{init}.parquet"))
        initial = initial_df.to_numpy()
        print("initial shape", initial.shape)
        reducer = umap.UMAP(
            init=initial,
            n_neighbors=neighbors,
            min_dist=min_dist,
            metric='cosine',
            random_state=seed,
            n_components=2,
            verbose=True,
        )
    else:
        reducer = umap.UMAP(
            n_neighbors=neighbors,
            min_dist=min_dist,
            metric='cosine',
            random_state=seed,
            n_components=2,
            verbose=True,
        )
    print("reducing", matrix.shape[0], "sparse features to 2 dimensions")
    import sys
    sys.stdout.flush()

    import time
    time.sleep(1)  # Wait for a second before starting
    umap_embeddings = reducer.fit_transform(matrix)
    process_umap_embeddings(umap_id, umap_embeddings, embedding_id, sae_id)

    if save:
        # save a pickle of the umap
        with open(os.path.join(umap_dir, f'{umap_id}.pkl'), 'wb') as f:
            pickle.dump(reducer, f)
    print("done with", umap_id)



if __name__ == "__main__":
    main()
