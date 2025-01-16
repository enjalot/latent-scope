# convert a scope to a lancedb database
# Example usage:
# python export_lance.py --directory ~/latent-scope-demo --dataset datavis-misunderstood --scope_id scopes-001 --metric cosine 

# creates a table with the same name as the scope id in the lancedb folder of the dataset


import argparse
import os
import json
import h5py
import lancedb
import numpy as np
import pandas as pd

def export_lance(directory, dataset, scope_id, metric="cosine", partitions=256, sub_vectors=96):
    dataset_path = os.path.join(directory, dataset)
    print(f"Exporting scope {scope_id} to LanceDB database in {dataset_path}")
    
    # Validate directory
    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a valid directory")
        return
    
    # Load the scope
    scope_path = os.path.join(dataset_path, "scopes")

    print(f"Loading scope from {scope_path}")
    scope_df = pd.read_parquet(os.path.join(scope_path, f"{scope_id}-input.parquet"))
    scope_meta = json.load(open(os.path.join(scope_path, f"{scope_id}.json")))

    print(f"Loading embeddings from {dataset_path}/embeddings/{scope_meta['embedding_id']}.h5")
    embeddings = h5py.File(os.path.join(dataset_path, "embeddings", f"{scope_meta['embedding_id']}.h5"), "r")

    db_uri = os.path.join(dataset_path, "lancedb")
    db = lancedb.connect(db_uri)

    print(f"Converting embeddings to numpy arrays", embeddings['embeddings'].shape)
    scope_df["vector"] = [np.array(row) for row in embeddings['embeddings']]

    if scope_meta["sae_id"]:
        print(f"SAE scope detected, adding metadata")
        # read in the sae indices
        sae_path = os.path.join(dataset_path, "saes", f"{scope_meta['sae_id']}.h5")
        with h5py.File(sae_path, 'r') as f:
            all_top_indices = np.array(f["top_indices"])
            all_top_acts = np.array(f["top_acts"])

        # scope_df["sae_indices"] = all_top_indices
        # scope_df["sae_acts"] = all_top_acts
        scope_df["sae_indices"] = [row.tolist() for row in all_top_indices]
        scope_df["sae_acts"] = [row.tolist() for row in all_top_acts]

    table_name = scope_id

    # Check if the table already exists
    if scope_id in db.table_names():
        # Remove the existing table and its index
        db.drop_table(table_name)
        print(f"Existing table '{table_name}' has been removed.")

    print(f"Creating table '{table_name}'")
    tbl = db.create_table(table_name, scope_df)

    print(f"Creating ANN index for embeddings on table '{table_name}'")
    print(f"Partitioning into {partitions} partitions, {sub_vectors} sub-vectors")
    tbl.create_index(num_partitions=partitions, num_sub_vectors=sub_vectors, metric=metric)

    print(f"Creating index for cluster on table '{table_name}'")
    tbl.create_scalar_index("cluster", index_type="BTREE")

    if scope_meta["sae_id"]:
        print(f"Creating index for sae_indices on table '{table_name}'")
        tbl.create_scalar_index("sae_indices", index_type="LABEL_LIST")


    print(f"Table '{table_name}' created successfully")

    # model_name = scopes_meta['embedding']['model_id'][2:].replace("___", "/")
    # # Prepare metadata
    # metadata = {
    #     "directory": directory,
    #     "scope_id": scope_id,
    #     "dataset": dataset,
    #     "metric": metric,
    #     "db_uri": db_uri,
    #     "table_name": table_name,
    #     "embedding_id": scopes_meta['embedding_id'],
    #     "model_name": model_name,
    # }

    # # Save metadata as JSON
    # if not os.path.exists("scopes"):
    #     os.makedirs("scopes")

    # metadata_path = os.path.join("scopes", f"{table_name}.json")
    # with open(metadata_path, 'w') as f:
    #     json.dump(metadata, f, indent=4)

    # print(f"Metadata saved to {metadata_path}")

def main():
    parser = argparse.ArgumentParser(description="Convert a scope to a LanceDB database")
    parser.add_argument("--directory", help="Directory containing the scope", type=str, default="~/latent-scope-data")
    parser.add_argument("--dataset", help="Name of the dataset", type=str)
    parser.add_argument("--scope_id", help="ID of the scope to convert", type=str)
    parser.add_argument("--metric", help="Metric to use for the index", type=str, default="cosine")
    parser.add_argument("--partitions", help="Number of partitions to use for the index", type=int, default=256)
    parser.add_argument("--sub_vectors", help="Number of sub-vectors to use for the index", type=int, default=128)
    args = parser.parse_args()
    print(f"ARGS: {args}")
    export_lance(args.directory, args.dataset, args.scope_id, args.metric, args.partitions, args.sub_vectors)


if __name__ == "__main__":
    main()
