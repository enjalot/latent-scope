# Usage: python ingest.py <dataset_name>
import os
import sys
import json
import pandas as pd

from latentscope.util import get_data_dir

def main():
    DATA_DIR = get_data_dir()
    dataset_name = sys.argv[1]
    directory = os.path.join(DATA_DIR, dataset_name)
    csv_file = os.path.join(directory, "input.csv")
    print("reading", csv_file)
    df = pd.read_csv(csv_file)
    print(df.head())
    print(df.columns)
    output_file = f"{directory}/input.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)
    # write out a json file with the model name and shape of the embeddings
    text_column = "text" in df.columns and "text" or df.columns[0]
    with open(os.path.join(directory,'meta.json'), 'w') as f:
        json.dump({
            "id": dataset_name,
            "length": df.shape[0],
            "columns": df.columns.tolist(),
            "text_column": text_column,
            }, f, indent=2)

    # create all the directories we will use
    os.makedirs(os.path.join(DATA_DIR, dataset_name, "tabs"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_name, "embeddings"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_name, "umaps"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_name, "clusters"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_name, "scopes"), exist_ok=True)


if __name__ == "__main__":
    main()
