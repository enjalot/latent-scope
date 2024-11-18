"""
python latentscope/scripts/upload_scope.py ~/latent-scope-demo/datavis-misunderstood "ls-datavis-misunderstood" --main-parquet="scopes/scopes-001-input.parquet" --private=False
"""

from datasets import Dataset
from pathlib import Path
from huggingface_hub import login, HfApi
import os
import argparse
import shutil
import tempfile
from latentscope.util import get_key

def get_human_readable_size(size_in_bytes):
    """Convert bytes to human readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_in_bytes < 1024.0:
            return f"{size_in_bytes:.1f} {unit}"
        size_in_bytes /= 1024.0
    return f"{size_in_bytes:.1f} PB"

def upload_to_huggingface(directory_path, dataset_name, main_parquet_path=None, token=None, private=True):
    """
    Upload a directory with all its files to Hugging Face datasets.
    
    Args:
        directory_path (str): Path to the directory to upload
        dataset_name (str): Name for the dataset on Hugging Face
        main_parquet_path (str): Path to the main parquet file relative to directory_path
        token (str, optional): Hugging Face API token
        private (bool, optional): Whether to make the dataset private (default: True)
    """
    # Get token from .env if not provided
    if not token:
        token = get_key("HUGGINGFACE_TOKEN")
        if token is None:
            raise ValueError("No token provided. Set HUGGINGFACE_TOKEN in .env or pass token argument")
    
    # Login to Hugging Face
    login(token)
    
    api = HfApi()
    # Get current user information
    user_info = api.whoami()
    username = user_info["name"]
    print("USERNAME", username)
    
    directory = Path(directory_path)

    # Create the repository if it doesn't exist
    try:
        print(f"Creating repository: {dataset_name}")
        repo_info = api.create_repo(
            repo_id=dataset_name,
            repo_type="dataset",
            private=private,
            exist_ok=True
        )
        print(f"Repository created/verified: {repo_info}")
    except Exception as e:
        print(f"Error creating repository: {e}")
        print(f"Token status: {'Token provided' if token else 'No token provided'}")
        print(f"Attempting to verify repository existence...")
        try:
            # Try to get the repository info to verify it exists and we have access
            repo_info = api.repo_info(repo_id=dataset_name, repo_type="dataset")
            print(f"Repository exists: {repo_info}")
        except Exception as verify_error:
            print(f"Could not verify repository: {verify_error}")
            raise

    print("DIRECTORY", directory)
    
    # Create a temporary directory for organizing files
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Create data directory for actual files
        data_dir = temp_path / "data"
        data_dir.mkdir(exist_ok=True)
        
        # Calculate total size before copying files
        total_size = 0
        for root, _, filenames in os.walk(directory):
            for filename in filenames:
                file_path = Path(root) / filename
                total_size += file_path.stat().st_size
        
        human_readable_size = get_human_readable_size(total_size)
        
        # Copy all files to the data directory while preserving structure
        for root, _, filenames in os.walk(directory):
            for filename in filenames:
                src_path = Path(root) / filename
                relative_path = src_path.relative_to(directory)
                dst_path = data_dir / relative_path
                
                # Create parent directories if they don't exist
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)
        
        # If a main parquet file is specified, create a dataset from it
        if main_parquet_path:
            main_parquet = directory / main_parquet_path
            if not main_parquet.exists():
                raise FileNotFoundError(f"Main parquet file not found: {main_parquet}")
            
            print("MAIN PARQUET", main_parquet)
            # Load and push the dataset
            dataset = Dataset.from_parquet(str(main_parquet))
            dataset.push_to_hub(dataset_name, private=True)
        
        # Upload all files in the data directory
        api.upload_folder(
            repo_id=f"{username}/{dataset_name}",
            folder_path=str(data_dir),
            path_in_repo="latentscope",
            repo_type="dataset",
        )
        
        # Create a README if it doesn't exist
        readme_content = f"""
---
tags:
  - latent-scope
---
# {dataset_name}

This dataset contains the files necessary to view in [latentscope](https://github.com/enjalot/latent-scope).
The files in the `latentscope` are used by the app to view. You can also preview the scope TODO

Total size of dataset files: {human_readable_size}

TODO: download script inside latentscope
"""
        readme_path = temp_path / "README.md"
        with open(readme_path, "w") as f:
            f.write(readme_content)
        
        # Upload README
        api.upload_file(
            repo_id=f"{username}/{dataset_name}",
            path_or_fileobj=str(readme_path),
            path_in_repo="README.md",
            repo_type="dataset",
        )
        print(f"uploaded to: {username}/{dataset_name}")

def main():
    parser = argparse.ArgumentParser(description='Upload a directory with files to Hugging Face datasets')
    parser.add_argument('directory', help='Directory path to upload')
    parser.add_argument('dataset_name', help='Name for the dataset on Hugging Face (e.g., username/dataset-name)')
    parser.add_argument('--main-parquet', help='Path to main parquet file relative to directory', default=None)
    parser.add_argument('--private', help='Make the dataset private', default=True)
    parser.add_argument('--token', help='Hugging Face API token', default=None)
    
    args = parser.parse_args()
    print("ARGS", args)
    
    upload_to_huggingface(args.directory, args.dataset_name, args.main_parquet, args.token, args.private)

if __name__ == "__main__":
    main()