import os
import json
from flask import Blueprint, current_app, jsonify, request

# Create a Blueprint
admin_bp = Blueprint('admin_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


@admin_bp.route('/', methods=['GET'])
def get_datasets():
    DATA_DIR = _data_dir()
    datasets = []

    for dir in os.listdir(DATA_DIR):
        scopes_dir = os.path.join(DATA_DIR, dir, 'scopes')
        meta_file_path = os.path.join(DATA_DIR, dir, 'meta.json')
        entry = {'id': dir}
        if os.path.exists(meta_file_path):
            with open(meta_file_path, 'r', encoding='utf-8') as meta_file:
                try:
                    meta_contents = json.load(meta_file)
                    entry['length'] = meta_contents.get('length')
                except json.JSONDecodeError:
                    pass

        if os.path.isdir(scopes_dir):
            scope_files = [
                f for f in os.listdir(scopes_dir)
                if f.startswith('scopes-') and f.endswith('.parquet') and 'input' not in f
            ]
            if scope_files:
                entry['scopes'] = [f.replace(".parquet", "") for f in scope_files]
                datasets.append(entry)

    html_list = "<ul>"
    for dataset in datasets:
        html_list += (
            f'<li style="margin-left: 10px; margin-bottom: 10px;">'
            f'{dataset["id"]} ({dataset.get("length", "unknown")} rows)'
        )
        if dataset['scopes']:
            html_list += "<ul>"
            for scope in dataset['scopes']:
                html_list += f'<li><a href="/api/admin/dataset/{dataset["id"]}/scope/{scope}">{scope}</a></li>'
            html_list += "</ul>"
        html_list += "</li>"
    html_list += "</ul>"

    return html_list


@admin_bp.route('/dataset/<dataset>/scope/<scope>', methods=['GET'])
def get_dataset_scope(dataset, scope):
    import pandas as pd

    DATA_DIR = _data_dir()
    input_df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))
    scope_df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "scopes", scope + ".parquet"))

    input_html = input_df.to_html(classes='table table-striped', border=0, index=True, escape=False, max_rows=100)
    scope_html = scope_df.to_html(classes='table table-striped', border=0, index=True, escape=False, max_rows=100)

    return f"<h3>{dataset}</h3>{input_html}<h3>{scope}</h3>{scope_html}"
