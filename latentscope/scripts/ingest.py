# Usage: ls-ingest <dataset_id>
import os
import json
import argparse
import pandas as pd

from latentscope.util import get_data_dir

# TODO make a parquet version of these
def main():
    parser = argparse.ArgumentParser(description='Ingest a dataset')
    parser.add_argument('id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('--path', type=str, help='Path to csv or parquet file, otherwise assumes input.csv in dataset directory')
    args = parser.parse_args()
    ingest_file(args.id, args.path)

def ingest_file(dataset_id, file_path):
    DATA_DIR = get_data_dir()
    directory = os.path.join(DATA_DIR, dataset_id)
    if not file_path:
        file_path = os.path.join(directory, "input.csv")
    file_type = file_path.split('.')[-1]
    print(f"File type detected: {file_type}")
    file = os.path.join(file_path)
    print("reading", file)
    if file_type == "csv":
        df = pd.read_csv(file)
    elif file_type == "parquet":
        df = pd.read_parquet(file)
    elif file_type == "jsonl":
        with open(file, 'r') as f:
            lines = f.readlines()
            df = pd.DataFrame([json.loads(line) for line in lines])
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
    ingest(dataset_id, df)


def ingest(dataset_id, df, text_column = None):
    DATA_DIR = get_data_dir()
    print("DATA DIR", DATA_DIR)
    directory = os.path.join(DATA_DIR, dataset_id)
    print("DIRECTORY", directory)
    if not os.path.exists(directory):
        os.makedirs(directory)
    df = df.reset_index(drop=True)
    print(df.head())
    print(df.tail())
    print(df.columns)
    output_file = f"{directory}/input.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)
    # write out a json file with the model name and shape of the embeddings
    if text_column is None:
        text_column = "text" in df.columns and "text" or df.columns[0]
    with open(os.path.join(directory,'meta.json'), 'w') as f:
        json.dump({
            "id": dataset_id,
            "length": df.shape[0],
            "columns": df.columns.tolist(),
            "text_column": text_column,
            }, f, indent=2)

    # create all the directories we will use
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "tags"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "embeddings"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "umaps"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "clusters"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "scopes"), exist_ok=True)


if __name__ == "__main__":
    main()
