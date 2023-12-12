# Usage: python csv2parquet.py <csv_file> <dataset_name>
import pandas as pd
import sys
import os

def csv_to_parquet(csv_file, dataset_name):
    print("reading", csv_file)
    df = pd.read_csv(csv_file)
    output_dir = f"../data/{dataset_name}"
    os.makedirs(output_dir, exist_ok=True)
    output_file = f"{output_dir}/input.parquet"
    df.to_parquet(output_file)
    print("wrote", output_file)

if __name__ == "__main__":
    csv_file = sys.argv[1]
    dataset_name = sys.argv[2]
    csv_to_parquet(csv_file, dataset_name)
