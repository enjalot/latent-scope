# Usage: ls-ingest <dataset_id>
import os
import json
import argparse
import pandas as pd

from latentscope.util import get_data_dir

# TODO make a parquet version of these
def csv():
    parser = argparse.ArgumentParser(description='Ingest a dataset')
    parser.add_argument('id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('--path', type=str, help='Path to csv file, otherwise assumes input.csv in dataset directory')
    args = parser.parse_args()
    ingest(args.id, args.path)

def ingest_csv(dataset_id, csv_path):
    DATA_DIR = get_data_dir()
    directory = os.path.join(DATA_DIR, dataset_id)
    if not csv_path:
        csv_path = os.path.join(directory, "input.csv")
    csv_file = os.path.join(csv_path)
    print("reading", csv_file)
    df = pd.read_csv(csv_file)
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
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "tabs"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "embeddings"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "umaps"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "clusters"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "scopes"), exist_ok=True)


if __name__ == "__main__":
    main()
