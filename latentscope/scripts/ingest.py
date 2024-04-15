# Usage: ls-ingest <dataset_id>
import os
import json
import argparse

from latentscope.util import get_data_dir

# TODO make a parquet version of these
def main():
    parser = argparse.ArgumentParser(description='Ingest a dataset')
    parser.add_argument('id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('--path', type=str, help='Path to csv or parquet file, otherwise assumes input.csv in dataset directory')
    args = parser.parse_args()
    ingest_file(args.id, args.path)

def ingest_file(dataset_id, file_path):
    import pandas as pd
    DATA_DIR = get_data_dir()
    directory = os.path.join(DATA_DIR, dataset_id)
    # check if dataset exists, if it does we want to increment a postfix on the dataset_id
    # if os.path.exists(directory):
    #     postfix = 1
    #     while os.path.exists(f"{directory}-{postfix:03d}"):
    #         postfix += 1
    #     dataset_id = f"{dataset_id}-{postfix:03d}"
    #     directory = os.path.join(DATA_DIR, dataset_id)
    # os.makedirs(directory)
    print("RUNNING:", dataset_id)

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

    import pandas as pd
    import numpy as np
    # determine the types of the values in columns, especially string, number or array of numbers
    # we will store these in the metadata
    # we will also store the number of unique values in each column
    column_metadata = {}
    for column in df.columns:
        non_null_series = df[column].dropna()
        # TODO: handle dates even if they are strings
        if pd.api.types.is_datetime64_any_dtype(non_null_series):
            column_type = "date"
        elif pd.api.types.is_string_dtype(non_null_series):
            column_type = "string"
        elif pd.api.types.is_numeric_dtype(non_null_series):
            column_type = "number"
        elif all(non_null_series.apply(lambda x: isinstance(x, list) and all(isinstance(i, (int, float)) for i in x))):
            print("list array of numbers", column)
            column_type = "array"
        elif isinstance(non_null_series.iloc[0], np.ndarray):
            print("np array", column)
            column_type = "array"
        else:
            column_type = "unknown"

        # Count unique values, excluding NaN
        try:
            if isinstance(df[column].iloc[0], np.ndarray):
                unique_values_count = len(set([tuple(x) for x in df[column].dropna()]))
            elif isinstance(df[column].iloc[0], bytes):
                unique_values_count = len(set(df[column].dropna().apply(lambda x: x.decode('utf-8'))))
            elif isinstance(df[column].iloc[0], dict):
                unique_values_count = len(set(df[column].dropna().apply(json.dumps)))
            else:
                unique_values_count = df[column].nunique(dropna=True)
        except:
            unique_values_count = -1

        # Store the metadata
        column_metadata[column] = {
            "type": column_type,
            "unique_values_count": unique_values_count
        }
        if column_type == "string" and unique_values_count <= 20:
            categories = df[column].value_counts().index.tolist()
            column_metadata[column]["categories"] = categories
        if column_type == "string":
            if df[column].str.startswith("http").all():
                column_metadata[column]["url"] = True
                # check if endings of string are common image formats like png, jpg, jpeg, webp
                if df[column].str.lower().str.endswith(("png", "jpg", "jpeg", "webp", "svg", "gif")).all():
                    column_metadata[column]["image"] = True
        if column_type == "number":
            extent = df[column].agg(['min', 'max'])
            column_metadata[column]["extent"] = extent.tolist()
        if column_type == "date":
            extent = df[column].agg(['min', 'max'])
            column_metadata[column]["extent"] = extent.tolist()


    # write out a json file with the model name and shape of the embeddings
    if text_column is None:
        text_column = "text" if "text" in df.columns else None
    if text_column is None:
        text_column = next((col for col, meta in column_metadata.items() if meta['type'] == 'string'), None)

    potential_embeddings = [col for col, meta in column_metadata.items() if meta['type'] == 'array']
    with open(os.path.join(directory,'meta.json'), 'w') as f:
        json.dump({
            "id": dataset_id,
            "length": df.shape[0],
            "columns": df.columns.tolist(),
            "text_column": text_column,
            "column_metadata": column_metadata,
            "potential_embeddings": potential_embeddings
            }, f, indent=2)

    # create all the directories we will use
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "tags"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "embeddings"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "umaps"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "clusters"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, dataset_id, "scopes"), exist_ok=True)


if __name__ == "__main__":
    main()
