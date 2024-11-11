import pandas as pd
from latentscope.util import get_data_dir
from latentscope.server.bulk import update_combined
import os
import json
from latentscope import __version__

# add a deleted column to the scope parquet
def add_scope_deleted_column(dataset_id, scope_id, write=True):
    DATA_DIR = get_data_dir()
    scope_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".parquet")

    # read the scope meta file to get the umap and cluster file names
    if not os.path.exists(scope_file):
        print(f"Scope file {scope_file} does not exist")
        return

    input_file = os.path.join(DATA_DIR, dataset_id, "input.parquet")
    if not os.path.exists(input_file):
        print(f"Input file {input_file} does not exist")
        return

    scope_df = pd.read_parquet(scope_file)
    input_df = pd.read_parquet(input_file)

    # 1. any exisiting rows in the scope file that don't already have the deleted column should be set to deleted
    scope_df.loc[~scope_df["ls_index"].isin(input_df.index), "deleted"] = False


    # 2. all the indexes in the input file that do not have corresponding ls_index
    # need new rows in the scope file.
    deleted_indices = set(input_df.index) - set(scope_df["ls_index"])

    # update scope ls_version

    # we also need to get the umap, cluster, and cluster labels files to create the deleted rows
    with open(os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".json")) as f:
        scope_meta = json.load(f)
    
    scope_meta["ls_version"] = __version__

    umap_file = scope_meta["umap_id"]
    umap_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "umaps", umap_file + ".parquet"))

    cluster_file = scope_meta["cluster_id"]
    cluster_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "clusters", cluster_file + ".parquet"))

    cluster_label_lookup = scope_meta["cluster_labels_lookup"]
    # for each cluster in the lookup, extract the "cluster" field and the "label" field and add them to a dictionary
    cluster_label_map = {c["cluster"]: c["label"] for c in cluster_label_lookup}

    # join the cluster df with the umap df on the index
    umap_cluster_df = cluster_df.join(umap_df, how="inner")

    deleted_rows = []
    for i in deleted_indices:
        # get the umap, cluster, and cluster labels for this index
        row = umap_cluster_df.loc[i]

        cluster = row["cluster"].astype(int)

        deleted_rows.append({
            "x": row["x"],
            "y": row["y"],
            "cluster": cluster,
            "label": cluster_label_map[cluster],
            "raw_cluster": row["raw_cluster"].astype(int),
            "deleted": True,
            "ls_index": i
        })
    print(f"Adding {len(deleted_rows)} deleted rows to the scope file")

    scope_df = pd.concat([scope_df, pd.DataFrame(deleted_rows)], ignore_index=True)

    # re-order the scope df by ls_index
    scope_df = scope_df.sort_values(by='ls_index').set_index('ls_index', drop=False).reset_index(drop=True)

    if write:
        # add the deleted rows to the scope df
        scope_df.to_parquet(scope_file)
        # update the combined file
        update_combined(scope_df, dataset_id, scope_id)
    
    return

# if __name__ == "__main__":
    # add_scope_deleted_column("all_posts", "scopes-001")