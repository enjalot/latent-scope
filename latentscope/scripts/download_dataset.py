"""
Usage:
python latentscope/scripts/download_dataset.py "enjalot/ls-datavis-misunderstood" ~/latent-scope-data/datavis-misunderstood
"""

from datasets import load_dataset
from huggingface_hub import hf_hub_download, snapshot_download
from pathlib import Path
import argparse
import os
from latentscope.util import get_key

def download_from_huggingface(dataset_repo, dataset_name,output_dir,token=None):
    """
    Download a latentscope dataset from Hugging Face.
    
    Args:
        dataset_path (str): Path to the dataset on Hugging Face (e.g., 'username/dataset-name')
        output_dir (str): Local directory to save the downloaded files
        token (str, optional): Hugging Face API token
    """
    # Get token from .env if not provided
    if not token:
        token = get_key("HUGGINGFACE_TOKEN")
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    try:
        # Download the latentscope directory into output_dir/dataset_name
        latentscope_path = Path(output_dir) / dataset_name
        # if the directory already exists, raise an error
        if latentscope_path.exists():
            # raise Exception(f"Directory {latentscope_path} already exists")
            print(f"Warning: directory {latentscope_path} already exists")
        latentscope_path.mkdir(parents=True, exist_ok=True)

        # Download all files from the latentscope directory
        snapshot_download(
            repo_id=dataset_repo,
            repo_type="dataset",
            local_dir=str(latentscope_path),
            token=token,
            local_dir_use_symlinks=False
        )

        # Delete data and readme directories if they exist
        data_path = latentscope_path / "data"
        readme_path = latentscope_path / "README.md"
        if data_path.exists():
            import shutil
            shutil.rmtree(data_path)
        if readme_path.exists():
            os.remove(readme_path)
        # Move contents of latentscope directory up one level
        latentscope_dir = latentscope_path / "latentscope"
        if latentscope_dir.exists():
            import shutil
            # Move all contents up one level
            for item in latentscope_dir.iterdir():
                dest = latentscope_path / item.name
                if dest.exists():
                    if dest.is_dir():
                        shutil.rmtree(dest)
                    else:
                        os.remove(dest)
                shutil.move(str(item), str(dest))
            # Remove the now empty latentscope directory
            latentscope_dir.rmdir()

        # Update meta.json with new dataset_name
        meta_path = latentscope_path / "meta.json"
        if meta_path.exists():
            import json
            with open(meta_path, 'r') as f:
                meta = json.load(f)
            meta['id'] = dataset_name
            with open(meta_path, 'w') as f:
                json.dump(meta, f, indent=2)

        print(f"Successfully downloaded latentscope files to: {latentscope_path}")
            
    except Exception as e:
        print(f"Error downloading scope: {e}")
        raise

def main():
    parser = argparse.ArgumentParser(description='Download a latentscope dataset from Hugging Face')
    parser.add_argument('dataset_repo', help='Path to the dataset on Hugging Face (e.g., username/dataset-name)')
    parser.add_argument('dataset_name', help='Name of the dataset')
    parser.add_argument('output_dir', help='Local directory to save the downloaded files')
    parser.add_argument('--token', help='Hugging Face API token', default=None)
    
    args = parser.parse_args()
    
    download_from_huggingface(args.dataset_repo, args.dataset_name, args.output_dir, args.token)

if __name__ == "__main__":
    main()
