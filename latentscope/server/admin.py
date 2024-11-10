import os
import re
import json
import fnmatch
import pandas as pd
from flask import Blueprint, jsonify, request

# Create a Blueprint
admin_bp = Blueprint('admin_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

@admin_bp.route('/', methods=['GET'])
def get_datasets():
    datasets = []

    for dir in os.listdir(DATA_DIR):
        scopes_dir = os.path.join(DATA_DIR, dir, 'scopes')

        meta_file_path = os.path.join(DATA_DIR, dir, 'meta.json')
        entry = {'id': dir}
        if os.path.exists(meta_file_path):
            with open(meta_file_path, 'r', encoding='utf-8') as meta_file:
                try:
                    meta_contents = json.load(meta_file)
                    length = meta_contents.get('length', None)
                    entry['length'] = length
                except json.JSONDecodeError as e:
                    print(f"Error reading meta.json for {dir}: {e}")

        if os.path.isdir(scopes_dir):
            scope_files = [f for f in os.listdir(scopes_dir) if f.startswith('scopes-') and f.endswith('.parquet') and 'input' not in f]
            if scope_files:
                dataset_scopes = []
                for scope_file in scope_files:
                    dataset_scopes.append(scope_file.replace(".parquet", ""))
                entry['scopes'] = dataset_scopes
                datasets.append(entry)

    # Convert the datasets list into a nested HTML list
    html_list = "<ul>"
    for dataset in datasets:
        html_list += f'<li style="margin-left: 10px; margin-bottom: 10px;">{dataset["id"]} ({dataset.get("length", "unknown")} rows)'
        if dataset['scopes']:
            html_list += "<ul>"
            for scope in dataset['scopes']:
                html_list += f'<li><a href="/api/admin/dataset/{dataset["id"]}/scope/{scope}">{scope}</a></li>'
            html_list += "</ul>"
        html_list += "</li>"
    html_list += "</ul>"
    datasets = html_list

    return html_list



@admin_bp.route('/dataset/<dataset>/scope/<scope>', methods=['GET'])
def get_dataset_scope(dataset, scope):

    # Read the input parquet file for the dataset
    input_df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))

    # Read the scope parquet file for the dataset
    scope_df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "scopes", scope + ".parquet"))

    # Convert both dataframes to HTML tables with styling
    input_html = input_df.to_html(
        classes='table table-striped',
        border=0,
        index=True,
        escape=False,
        max_rows=100
    )
    
    scope_html = scope_df.to_html(
        classes='table table-striped', 
        border=0,
        index=True,
        escape=False,
        max_rows=100
    )

    # Combine the tables with headers
    html = f"""
    <h3>{dataset}</h3>
    {input_html}
    <h3>{scope}</h3>
    {scope_html}
    """

    return html
