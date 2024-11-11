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



# @datasets_bp.route('/<dataset>/meta', methods=['GET'])
# def get_dataset_meta(dataset):
#     file_path = os.path.join(DATA_DIR, dataset, "meta.json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# @datasets_write_bp.route('/<dataset>/meta/update', methods=['GET'])
# def update_dataset_meta(dataset):
#     key = request.args.get('key')
#     value = request.args.get('value')
#     try:
#         value = json.loads(value)
#     except json.JSONDecodeError as err:
#         print("Invalid JSON format for value", value, err)

#     file_path = os.path.join(DATA_DIR, dataset, "meta.json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     json_contents[key] = value
#     # write the file back out
#     with open(file_path, 'w', encoding='utf-8') as json_file:
#         json.dump(json_contents, json_file)
#     return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/embeddings', methods=['GET'])
# def get_dataset_embeddings(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset, "embeddings")
#     # directory_path = os.path.join(DATA_DIR, dataset, "umaps")
#     return scan_for_json_files(directory_path)

# @datasets_bp.route('/<dataset>/embeddings/<embedding>', methods=['GET'])
# def get_dataset_embedding(dataset, embedding):
#     file_path = os.path.join(DATA_DIR, dataset, "embeddings", embedding + ".json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/saes', methods=['GET'])
# def get_dataset_saes(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset, "saes")
#     # directory_path = os.path.join(DATA_DIR, dataset, "umaps")
#     return scan_for_json_files(directory_path)

# @datasets_bp.route('/<dataset>/saes/<sae>', methods=['GET'])
# def get_dataset_sae(dataset, sae):
#     file_path = os.path.join(DATA_DIR, dataset, "saes", sae + ".json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/umaps', methods=['GET'])
# def get_dataset_umaps(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset, "umaps")
#     return scan_for_json_files(directory_path)

# @datasets_bp.route('/<dataset>/umaps/<umap>', methods=['GET'])
# def get_dataset_umap(dataset, umap):
#     file_path = os.path.join(DATA_DIR, dataset, "umaps", umap + ".json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/umaps/<umap>/points', methods=['GET'])
# def get_dataset_umap_points(dataset, umap):
#     file_path = os.path.join(DATA_DIR, dataset, "umaps", umap + ".parquet")
#     df = pd.read_parquet(file_path)
#     return df.to_json(orient="records")

# @datasets_bp.route('/<dataset>/clusters', methods=['GET'])
# def get_dataset_clusters(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset, "clusters")
#     return scan_for_json_files(directory_path, match_pattern=r"cluster-\d+\.json")

# @datasets_bp.route('/<dataset>/clusters/<cluster>', methods=['GET'])
# def get_dataset_cluster(dataset, cluster):
#     file_path = os.path.join(DATA_DIR, dataset, "clusters", cluster + ".json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# # @datasets_bp.route('/<dataset>/clusters/<cluster>/labels', methods=['GET'])
# # def get_dataset_cluster_labels_default(dataset, cluster):
# #     file_name = cluster + "-labels.parquet"
# #     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
# #     df = pd.read_parquet(file_path)
# #     return df.to_json(orient="records")

# @datasets_bp.route('/<dataset>/clusters/<cluster>/indices', methods=['GET'])
# def get_dataset_cluster_indices(dataset, cluster):
#     file_name = cluster + ".parquet"
#     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
#     df = pd.read_parquet(file_path)
#     return df.to_json(orient="records")

# @datasets_bp.route('/<dataset>/clusters/<cluster>/labels/<id>', methods=['GET'])
# def get_dataset_cluster_labels(dataset, cluster, id):
#     # if model == "default":
#     #     return get_dataset_cluster_labels_default(dataset, cluster)
#     file_name = cluster + "-labels-" + id + ".parquet"
#     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
#     df = pd.read_parquet(file_path)
#     df.reset_index(inplace=True)
#     return df.to_json(orient="records")

# # This was rewritten in bulk.py to only affect a scope
# # @datasets_write_bp.route('/<dataset>/clusters/<cluster>/labels/<id>/label/<index>', methods=['GET'])
# # def overwrite_dataset_cluster_label(dataset, cluster, id, index):
# #     index = int(index)
# #     new_label = request.args.get('label')
# #     print("write label", index, new_label)
# #     if new_label is None:
# #         return jsonify({"error": "Missing 'label' in request data"}), 400

# #     file_name = cluster + "-labels-" + id + ".parquet"
# #     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
# #     try:
# #         df = pd.read_parquet(file_path)
# #     except FileNotFoundError:
# #         return jsonify({"error": "File not found"}), 404

# #     if index >= len(df):
# #         return jsonify({"error": "Index out of range"}), 400

# #     df.at[index, 'label'] = new_label
# #     df.to_parquet(file_path)

# #     return jsonify({"success": True, "message": "Label updated successfully"})


# @datasets_bp.route('/<dataset>/clusters/<cluster>/labels_available', methods=['GET'])
# def get_dataset_cluster_labels_available(dataset, cluster):
#     directory_path = os.path.join(DATA_DIR, dataset, "clusters")
#     return scan_for_json_files(directory_path, match_pattern=rf"{cluster}-labels-.*\.json")
#     # try:
#     #     files = sorted(os.listdir(directory_path), key=lambda x: os.path.getmtime(os.path.join(directory_path, x)), reverse=True)
#     # except OSError as err:
#     #     print('Unable to scan directory:', err)
#     #     return jsonify({"error": "Unable to scan directory"}), 500

#     # pattern = re.compile(r'^' + cluster + '-labels-(.*).parquet$')
#     # model_names = [pattern.match(file).group(1) for file in files if pattern.match(file)]
#     # return jsonify(model_names)


# def get_next_scopes_number(dataset):
#     # figure out the latest scope number
#     scopes_files = [f for f in os.listdir(os.path.join(DATA_DIR,dataset,"scopes")) if re.match(r"scopes-\d+\.json", f)]
#     if len(scopes_files) > 0:
#         last_scopes = sorted(scopes_files)[-1]
#         last_scopes_number = int(last_scopes.split("-")[1].split(".")[0])
#         next_scopes_number = last_scopes_number + 1
#     else:
#         next_scopes_number = 1
#     return next_scopes_number

# @datasets_bp.route('/<dataset>/scopes', methods=['GET'])
# def get_dataset_scopes(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset, "scopes")
#     print("dataset", dataset, directory_path)
#     return scan_for_json_files(directory_path, match_pattern=r".*[0-9]+\.json$")

# @datasets_bp.route('/<dataset>/scopes/<scope>', methods=['GET'])
# def get_dataset_scope(dataset, scope):
#     directory_path = os.path.join(DATA_DIR, dataset, "scopes")
#     file_path = os.path.join(directory_path, scope + ".json")
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)
#     return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/scopes/<scope>/parquet', methods=['GET'])
# def get_dataset_scope_parquet(dataset, scope):
#     directory_path = os.path.join(DATA_DIR, dataset, "scopes")
#     file_path = os.path.join(directory_path, scope + ".parquet")
#     df = pd.read_parquet(file_path)
#     return df.to_json(orient="records")

# @datasets_write_bp.route('/<dataset>/scopes/<scope>/description', methods=['GET'])
# def overwrite_scope_description(dataset, scope):
#     new_label = request.args.get('label')
#     new_description = request.args.get('description')

#     file_name = scope + ".json"
#     file_path = os.path.join(DATA_DIR, dataset, "scopes", file_name)
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)

#     json_contents['label'] = new_label
#     json_contents['description'] = new_description

#     with open(file_path, 'w', encoding='utf-8') as json_file:
#         json.dump(json_contents, json_file)
    
#     return jsonify({"success": True, "message": "Description updated successfully"})

# @datasets_write_bp.route('/<dataset>/scopes/<scope>/new-cluster', methods=['GET'])
# def new_scope_cluster(dataset, scope):
#     new_label = request.args.get('label')

#     file_name = scope + ".json"
#     file_path = os.path.join(DATA_DIR, dataset, "scopes", file_name)
#     with open(file_path, 'r', encoding='utf-8') as json_file:
#         json_contents = json.load(json_file)

#     clusters = json_contents.get('cluster_labels_lookup', [])
#     clusterIndex = len(clusters)
#     clusters.append({
#         "cluster": clusterIndex, 
#         "label": new_label,
#         "hull": [],
#         "description": ""
#     })
#     json_contents['cluster_labels_lookup'] = clusters

#     with open(file_path, 'w', encoding='utf-8') as json_file:
#         json.dump(json_contents, json_file)
    
#     return jsonify({"success": True, "message": "Description updated successfully"})


# @datasets_bp.route('/<dataset>/export/list', methods=['GET'])
# def get_dataset_export_list(dataset):
#     directory_path = os.path.join(DATA_DIR, dataset)
#     print("dataset", dataset, directory_path)
#     # scan the directory for files and directories
#     # then walk the directories to find all the files
#     # then return the list of files
#     file_list = []
#     for root, dirs, files in os.walk(directory_path):
#         if "jobs" in root:
#             continue
#         for file in files:
#             if file == ".DS_Store":
#                 continue
#             full_path = os.path.join(root, file)
#             file_name = os.path.basename(full_path)
#             relative_path = os.path.relpath(full_path, directory_path)
#             directory = os.path.relpath(root, directory_path)
#             size = os.path.getsize(full_path)
#             file_list.append((file_name, directory, relative_path, full_path, size))

#     return jsonify(file_list)

# @datasets_bp.route('/<dataset>/plot/<scope>/list', methods=['GET'])
# def get_dataset_plot_list(dataset, scope):
#     directory_path = os.path.join(DATA_DIR, dataset, "plots")
#     print("dataset", dataset, directory_path)
#     # scan the directory for files and directories
#     # then walk the directories to find all the files
#     # then return the list of files
#     file_list = []
#     files = [f for f in os.listdir(directory_path) if os.path.isfile(os.path.join(directory_path, f))]
#     for file in files:
#         if not (file.endswith(".png") and scope in file):
#             continue
#         full_path = os.path.join(directory_path, file)
#         file_name = os.path.basename(full_path)
#         size = os.path.getsize(full_path)
#         file_list.append((file_name, full_path, size))

#     return jsonify(file_list)