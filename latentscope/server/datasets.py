import os
import re
import json
import pandas as pd
from flask import Blueprint, jsonify, request

# Create a Blueprint
datasets_bp = Blueprint('datasets_bp', __name__)
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

    return jsonify(datasets)

"""
Get all metadata files from the given a directory.
"""
def scan_for_json_files(directory_path):
    try:
        files = os.listdir(directory_path)
    except OSError as err:
        print('Unable to scan directory:', err)
        return jsonify({"error": "Unable to scan directory"}), 500

    json_files = [file for file in files if file.endswith('.json')]
    json_files.sort()
    print("files", files)
    print("json", json_files)

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

@datasets_bp.route('/<dataset>/meta/update', methods=['GET'])
def update_dataset_meta(dataset):
    key = request.args.get('key')
    value = request.args.get('value')
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
    print("dataset", dataset, directory_path)
    try:
        files = sorted(os.listdir(directory_path), key=lambda x: os.path.getmtime(os.path.join(directory_path, x)), reverse=True)
    except OSError as err:
        print('Unable to scan directory:', err)
        return jsonify({"error": "Unable to scan directory"}), 500

    npy_files = [file.replace(".npy", "") for file in files if file.endswith('.npy')]
    return jsonify(npy_files)


@datasets_bp.route('/<dataset>/umaps', methods=['GET'])
def get_dataset_umaps(dataset):
    directory_path = os.path.join(DATA_DIR, dataset, "umaps")
    print("dataset", dataset, directory_path)
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
    print("dataset", dataset, directory_path)
    return scan_for_json_files(directory_path)

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

@datasets_bp.route('/<dataset>/clusters/<cluster>/labels/<model>', methods=['GET'])
def get_dataset_cluster_labels(dataset, cluster, model):
    # if model == "default":
    #     return get_dataset_cluster_labels_default(dataset, cluster)
    file_name = cluster + "-labels-" + model + ".parquet"
    file_path = os.path.join(DATA_DIR, dataset, "clusters", file_name)
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")

@datasets_bp.route('/<dataset>/clusters/<cluster>/labels_available', methods=['GET'])
def get_dataset_cluster_labels_available(dataset, cluster):
    directory_path = os.path.join(DATA_DIR, dataset, "clusters")
    try:
        files = sorted(os.listdir(directory_path), key=lambda x: os.path.getmtime(os.path.join(directory_path, x)), reverse=True)
    except OSError as err:
        print('Unable to scan directory:', err)
        return jsonify({"error": "Unable to scan directory"}), 500

    pattern = re.compile(r'^' + cluster + '-labels-(.*).parquet$')
    model_names = [pattern.match(file).group(1) for file in files if pattern.match(file)]
    return jsonify(model_names)


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
    return scan_for_json_files(directory_path)

@datasets_bp.route('/<dataset>/scopes/<scope>', methods=['GET'])
def get_dataset_scope(dataset, scope):
    directory_path = os.path.join(DATA_DIR, dataset, "scopes")
    file_path = os.path.join(directory_path, scope + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)

@datasets_bp.route('/<dataset>/scopes/save', methods=['POST'])
def save_dataset_scope(dataset):
    if not request.json:
        return jsonify({"error": "Invalid data format, JSON expected"}), 400
    id = request.json.get('id')
    embedding_id = request.json.get('embedding_id')
    umap_id = request.json.get('umap_id')
    cluster_id = request.json.get('cluster_id')
    cluster_labels_id = request.json.get('cluster_labels_id')
    label = request.json.get('label')
    description = request.json.get('description')
    scope = {
        "embedding_id": embedding_id,
        "umap_id": umap_id,
        "cluster_id": cluster_id,
        "cluster_labels_id": cluster_labels_id,
        "label": label,
        "description": description
    }
    if not id:
        next_scopes_number = get_next_scopes_number(dataset)
        # make the umap name from the number, zero padded to 3 digits
        id = f"scopes-{next_scopes_number:03d}"
    scope["id"] = id
    file_path = os.path.join(DATA_DIR, dataset, "scopes", id + ".json")
    with open(file_path, 'w') as f:
        json.dump(scope, f, indent=2)
    return jsonify(scope)
