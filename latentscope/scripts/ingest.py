# Usage: ls-ingest <dataset_id>
import os
import json
import argparse
import pandas as pd

from latentscope.util import get_data_dir

# TODO: somehow optionally accept a pandas dataframe as input
def main():
    parser = argparse.ArgumentParser(description='Ingest a dataset')
    parser.add_argument('id', type=str, help='Dataset id (directory name in data folder)')
    args = parser.parse_args()
    ingest(args.id)

def ingest(dataset_id):
    DATA_DIR = get_data_dir()
    directory = os.path.join(DATA_DIR, dataset_id)
    # TODO: inspect the incoming data to see if it is a csv or parquet file
    csv_file = os.path.join(directory, "input.csv")
    print("reading", csv_file)
    df = pd.read_csv(csv_file)
    df = df.reset_index(drop=True)
    print(df.head())
    print(df.tail())
    print(df.columns)
    output_file = f"{directory}/input.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)
    # write out a json file with the model name and shape of the embeddings
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
