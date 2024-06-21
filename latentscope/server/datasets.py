import os
import re
import json
import fnmatch
import pandas as pd
from flask import Blueprint, jsonify, request

# Create a Blueprint
datasets_bp = Blueprint('datasets_bp', __name__)
datasets_write_bp = Blueprint('datasets_write_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

"""
Get the essential metadata for all available datasets.
Essential metadata is stored in meta.json
"""
@datasets_bp.route('/', methods=['GET'])
def get_datasets():
    datasets = []

    for dir in os.listdir(DATA_DIR):
        file_path = os.path.join(DATA_DIR, dir, 'meta.json')
        if os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as file:
                jsonData = json.load(file)
                jsonData['id'] = dir
                datasets.append(jsonData)

    datasets.sort(key=lambda x: x.get('length'))
    return jsonify(datasets)

"""
Get all metadata files from the given a directory.
"""
def scan_for_json_files(directory_path, match_pattern=r".*\.json$"):
    try:
        # files = os.listdir(directory_path)
        files = sorted(os.listdir(directory_path), key=lambda x: os.path.getmtime(os.path.join(directory_path, x)), reverse=True)
    except OSError as err:
        print('Unable to scan directory:', err)
        return jsonify({"error": "Unable to scan directory"}), 500

    json_files = [file for file in files if re.match(match_pattern, file)]
    # print("files", files)
    # print("json", json_files)

    json_contents = []
    for file in json_files:
        try:
            with open(os.path.join(directory_path, file), 'r', encoding='utf-8') as json_file:
                json_contents.append(json.load(json_file))
        except json.JSONDecodeError as err:
            print('Error parsing JSON string:', err)
    return jsonify(json_contents)

@datasets_bp.route('/<dataset>/meta', methods=['GET'])
def get_dataset_meta(dataset):
    file_path = os.path.join(DATA_DIR, dataset, "meta.json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)

@datasets_write_bp.route('/<dataset>/meta/update', methods=['GET'])
def update_dataset_meta(dataset):
    key = request.args.get('key')
    value = request.args.get('value')
    try:
        value = json.loads(value)
    except json.JSONDecodeError as err:
        print("Invalid JSON format for value", value, err)

    file_path = os.path.join(DATA_DIR, dataset, "meta.json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    json_contents[key] = value
    # write the file back out
    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)
    return jsonify(json_contents)

@datasets_bp.route('/<dataset>/embeddings', methods=['GET'])
def get_dataset_embeddings(dataset):
    directory_path = os.path.join(DATA_DIR, dataset, "embeddings")
    # directory_path = os.path.join(DATA_DIR, dataset, "umaps")
    return scan_for_json_files(directory_path)

@datasets_bp.route('/<dataset>/umaps', methods=['GET'])
def get_dataset_umaps(dataset):
    directory_path = os.path.join(DATA_DIR, dataset, "umaps")
    return scan_for_json_files(directory_path)

@datasets_bp.route('/<dataset>/umaps/<umap>', methods=['GET'])
def get_dataset_umap(dataset, umap):
    file_path = os.path.join(DATA_DIR, dataset, "umaps", umap + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)

@datasets_bp.route('/<dataset>/umaps/<umap>/points', methods=['GET'])
def get_dataset_umap_points(dataset, umap):
    file_path = os.path.join(DATA_DIR, dataset, "umaps", umap + ".parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")

@datasets_bp.route('/<dataset>/clusters', methods=['GET'])
def get_dataset_clusters(dataset):
    directory_path = os.path.join(DATA_DIR, dataset, "clusters")
    return scan_for_json_files(directory_path, match_pattern=r"cluster-\d+\.json")

@datasets_bp.route('/<dataset>/clusters/<cluster>', methods=['GET'])
def get_dataset_cluster(dataset, cluster):
    file_path = os.path.join(DATA_DIR, dataset, "clusters", cluster + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)

# @datasets_bp.route('/<dataset>/clusters/<cluster>/labels', methods=['GET'])
# def get_dataset_cluster_labels_default(dataset, cluster):
#     file_name = cluster + "-labels.parquet"
#     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
#     df = pd.read_parquet(file_path)
#     return df.to_json(orient="records")

@datasets_bp.route('/<dataset>/clusters/<cluster>/indices', methods=['GET'])
def get_dataset_cluster_indices(dataset, cluster):
    file_name = cluster + ".parquet"
    file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")

@datasets_bp.route('/<dataset>/clusters/<cluster>/labels/<id>', methods=['GET'])
def get_dataset_cluster_labels(dataset, cluster, id):
    # if model == "default":
    #     return get_dataset_cluster_labels_default(dataset, cluster)
    file_name = cluster + "-labels-" + id + ".parquet"
    file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
    df = pd.read_parquet(file_path)
    df.reset_index(inplace=True)
    return df.to_json(orient="records")

# This was rewritten in bulk.py to only affect a scope
# @datasets_write_bp.route('/<dataset>/clusters/<cluster>/labels/<id>/label/<index>', methods=['GET'])
# def overwrite_dataset_cluster_label(dataset, cluster, id, index):
#     index = int(index)
#     new_label = request.args.get('label')
#     print("write label", index, new_label)
#     if new_label is None:
#         return jsonify({"error": "Missing 'label' in request data"}), 400

#     file_name = cluster + "-labels-" + id + ".parquet"
#     file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
#     try:
#         df = pd.read_parquet(file_path)
#     except FileNotFoundError:
#         return jsonify({"error": "File not found"}), 404

#     if index >= len(df):
#         return jsonify({"error": "Index out of range"}), 400

#     df.at[index, 'label'] = new_label
#     df.to_parquet(file_path)

#     return jsonify({"success": True, "message": "Label updated successfully"})


@datasets_bp.route('/<dataset>/clusters/<cluster>/labels_available', methods=['GET'])
def get_dataset_cluster_labels_available(dataset, cluster):
    directory_path = os.path.join(DATA_DIR, dataset, "clusters")
    return scan_for_json_files(directory_path, match_pattern=rf"{cluster}-labels-.*\.json")
    # try:
    #     files = sorted(os.listdir(directory_path), key=lambda x: os.path.getmtime(os.path.join(directory_path, x)), reverse=True)
    # except OSError as err:
    #     print('Unable to scan directory:', err)
    #     return jsonify({"error": "Unable to scan directory"}), 500

    # pattern = re.compile(r'^' + cluster + '-labels-(.*).parquet$')
    # model_names = [pattern.match(file).group(1) for file in files if pattern.match(file)]
    # return jsonify(model_names)


def get_next_scopes_number(dataset):
    # figure out the latest scope number
    scopes_files = [f for f in os.listdir(os.path.join(DATA_DIR,dataset,"scopes")) if re.match(r"scopes-\d+\.json", f)]
    if len(scopes_files) > 0:
        last_scopes = sorted(scopes_files)[-1]
        last_scopes_number = int(last_scopes.split("-")[1].split(".")[0])
        next_scopes_number = last_scopes_number + 1
    else:
        next_scopes_number = 1
    return next_scopes_number

@datasets_bp.route('/<dataset>/scopes', methods=['GET'])
def get_dataset_scopes(dataset):
    directory_path = os.path.join(DATA_DIR, dataset, "scopes")
    print("dataset", dataset, directory_path)
    return scan_for_json_files(directory_path, match_pattern=r".*[0-9]+\.json$")

@datasets_bp.route('/<dataset>/scopes/<scope>', methods=['GET'])
def get_dataset_scope(dataset, scope):
    directory_path = os.path.join(DATA_DIR, dataset, "scopes")
    file_path = os.path.join(directory_path, scope + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)

@datasets_bp.route('/<dataset>/scopes/<scope>/parquet', methods=['GET'])
def get_dataset_scope_parquet(dataset, scope):
    directory_path = os.path.join(DATA_DIR, dataset, "scopes")
    file_path = os.path.join(directory_path, scope + ".parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")

@datasets_write_bp.route('/<dataset>/scopes/<scope>/description', methods=['GET'])
def overwrite_scope_description(dataset, scope):
    new_label = request.args.get('label')
    new_description = request.args.get('description')

    file_name = scope + ".json"
    file_path = os.path.join(DATA_DIR, dataset, "scopes", file_name)
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)

    json_contents['label'] = new_label
    json_contents['description'] = new_description

    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)
    
    return jsonify({"success": True, "message": "Description updated successfully"})

@datasets_write_bp.route('/<dataset>/scopes/<scope>/new-cluster', methods=['GET'])
def new_scope_cluster(dataset, scope):
    new_label = request.args.get('label')

    file_name = scope + ".json"
    file_path = os.path.join(DATA_DIR, dataset, "scopes", file_name)
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)

    clusters = json_contents.get('cluster_labels_lookup', [])
    clusterIndex = len(clusters)
    clusters.append({
        "cluster": clusterIndex, 
        "label": new_label,
        "hull": [],
        "description": ""
    })
    json_contents['cluster_labels_lookup'] = clusters

    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)
    
    return jsonify({"success": True, "message": "Description updated successfully"})


@datasets_bp.route('/<dataset>/export/list', methods=['GET'])
def get_dataset_export_list(dataset):
    directory_path = os.path.join(DATA_DIR, dataset)
    print("dataset", dataset, directory_path)
    # scan the directory for files and directories
    # then walk the directories to find all the files
    # then return the list of files
    file_list = []
    for root, dirs, files in os.walk(directory_path):
        if "jobs" in root:
            continue
        for file in files:
            if file == ".DS_Store":
                continue
            full_path = os.path.join(root, file)
            file_name = os.path.basename(full_path)
            relative_path = os.path.relpath(full_path, directory_path)
            directory = os.path.relpath(root, directory_path)
            size = os.path.getsize(full_path)
            file_list.append((file_name, directory, relative_path, full_path, size))

    return jsonify(file_list)

@datasets_bp.route('/<dataset>/plot/<scope>/list', methods=['GET'])
def get_dataset_plot_list(dataset, scope):
    directory_path = os.path.join(DATA_DIR, dataset, "plots")
    print("dataset", dataset, directory_path)
    # scan the directory for files and directories
    # then walk the directories to find all the files
    # then return the list of files
    file_list = []
    files = [f for f in os.listdir(directory_path) if os.path.isfile(os.path.join(directory_path, f))]
    for file in files:
        if not (file.endswith(".png") and scope in file):
            continue
        full_path = os.path.join(directory_path, file)
        file_name = os.path.basename(full_path)
        size = os.path.getsize(full_path)
        file_list.append((file_name, full_path, size))

    return jsonify(file_list)