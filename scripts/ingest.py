# Usage: python csv2parquet.py <csv_file> <dataset_name>
import os
import sys
import json
import pandas as pd

def csv_to_parquet(dataset_name):
    directory = f"../data/{dataset_name}"
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
    with open(f'../data/{dataset_name}/meta.json', 'w') as f:
        json.dump({
            "id": dataset_name,
            "length": df.shape[0],
            "columns": df.columns.tolist(),
            "text_column": text_column,
            }, f, indent=2)

    # create all the directories we will use
    os.makedirs(f"../data/{dataset_name}/tabs", exist_ok=True)
    os.makedirs(f"../data/{dataset_name}/embeddings", exist_ok=True)
    os.makedirs(f"../data/{dataset_name}/umaps", exist_ok=True)
    os.makedirs(f"../data/{dataset_name}/clusters", exist_ok=True)
    os.makedirs(f"../data/{dataset_name}/slides", exist_ok=True)


if __name__ == "__main__":
    dataset_name = sys.argv[1]
    csv_to_parquet(dataset_name)
