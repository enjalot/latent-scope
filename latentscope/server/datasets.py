import os
import re
import json
from flask import Blueprint, current_app, jsonify, request

# Create a Blueprint
datasets_bp = Blueprint('datasets_bp', __name__)
datasets_write_bp = Blueprint('datasets_write_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


@datasets_bp.route('/', methods=['GET'])
def get_datasets():
    DATA_DIR = _data_dir()
    datasets = []
    for dir in os.listdir(DATA_DIR):
        file_path = os.path.join(DATA_DIR, dir, 'meta.json')
        if os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as file:
                try:
                    jsonData = json.load(file)
                    jsonData['id'] = dir
                    datasets.append(jsonData)
                except Exception:
                    pass
    datasets.sort(key=lambda x: x.get('id'))
    return jsonify(datasets)


def scan_for_json_files(directory_path, match_pattern=r".*\.json$"):
    try:
        files = sorted(
            os.listdir(directory_path),
            key=lambda x: os.path.getmtime(os.path.join(directory_path, x)),
            reverse=True,
        )
    except OSError as err:
        return jsonify({"error": "Unable to scan directory"}), 500

    json_files = [file for file in files if re.match(match_pattern, file)]
    json_contents = []
    for file in json_files:
        try:
            with open(os.path.join(directory_path, file), 'r', encoding='utf-8') as json_file:
                json_contents.append(json.load(json_file))
        except json.JSONDecodeError:
            pass
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/meta', methods=['GET'])
def get_dataset_meta(dataset):
    file_path = os.path.join(_data_dir(), dataset, "meta.json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_write_bp.route('/<dataset>/meta/update', methods=['GET'])
def update_dataset_meta(dataset):
    key = request.args.get('key')
    value = request.args.get('value')
    try:
        value = json.loads(value)
    except json.JSONDecodeError:
        pass

    file_path = os.path.join(_data_dir(), dataset, "meta.json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    json_contents[key] = value
    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/embeddings', methods=['GET'])
def get_dataset_embeddings(dataset):
    return scan_for_json_files(os.path.join(_data_dir(), dataset, "embeddings"))


@datasets_bp.route('/<dataset>/embeddings/<embedding>', methods=['GET'])
def get_dataset_embedding(dataset, embedding):
    file_path = os.path.join(_data_dir(), dataset, "embeddings", embedding + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/saes', methods=['GET'])
def get_dataset_saes(dataset):
    return scan_for_json_files(os.path.join(_data_dir(), dataset, "saes"))


@datasets_bp.route('/<dataset>/saes/<sae>', methods=['GET'])
def get_dataset_sae(dataset, sae):
    file_path = os.path.join(_data_dir(), dataset, "saes", sae + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/features/<sae>', methods=['GET'])
def get_dataset_features(dataset, sae):
    import pandas as pd
    file_path = os.path.join(_data_dir(), dataset, "saes", sae + "_features.parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")


@datasets_bp.route('/<dataset>/umaps', methods=['GET'])
def get_dataset_umaps(dataset):
    return scan_for_json_files(os.path.join(_data_dir(), dataset, "umaps"))


@datasets_bp.route('/<dataset>/umaps/<umap>', methods=['GET'])
def get_dataset_umap(dataset, umap):
    file_path = os.path.join(_data_dir(), dataset, "umaps", umap + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/umaps/<umap>/points', methods=['GET'])
def get_dataset_umap_points(dataset, umap):
    import pandas as pd
    file_path = os.path.join(_data_dir(), dataset, "umaps", umap + ".parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")


@datasets_bp.route('/<dataset>/clusters', methods=['GET'])
def get_dataset_clusters(dataset):
    return scan_for_json_files(
        os.path.join(_data_dir(), dataset, "clusters"),
        match_pattern=r"cluster-\d+\.json",
    )


@datasets_bp.route('/<dataset>/clusters/<cluster>', methods=['GET'])
def get_dataset_cluster(dataset, cluster):
    file_path = os.path.join(_data_dir(), dataset, "clusters", cluster + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/clusters/<cluster>/indices', methods=['GET'])
def get_dataset_cluster_indices(dataset, cluster):
    import pandas as pd
    file_path = os.path.join(_data_dir(), dataset, "clusters", cluster + ".parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")


@datasets_bp.route('/<dataset>/clusters/<cluster>/labels/<id>', methods=['GET'])
def get_dataset_cluster_labels(dataset, cluster, id):
    import pandas as pd
    file_name = cluster + "-labels-" + id + ".parquet"
    file_path = os.path.join(_data_dir(), dataset, "clusters", file_name)
    df = pd.read_parquet(file_path)
    df.reset_index(inplace=True)
    return df.to_json(orient="records")


@datasets_bp.route('/<dataset>/clusters/<cluster>/quality', methods=['GET'])
def get_dataset_cluster_quality(dataset, cluster):
    import numpy as np
    import pandas as pd

    DATA_DIR = _data_dir()
    cluster_dir = os.path.join(DATA_DIR, dataset, "clusters")

    # Load cluster metadata
    meta_path = os.path.join(cluster_dir, f"{cluster}.json")
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    # Return cached metrics if available
    if "quality_metrics" in meta:
        return jsonify(meta["quality_metrics"])

    n_clusters = meta.get("n_clusters", 0)
    if n_clusters < 2:
        result = {
            "silhouette": None,
            "calinski_harabasz": None,
            "davies_bouldin": None,
            "message": "Need at least 2 clusters for quality metrics",
        }
        return jsonify(result)

    # Load UMAP points
    umap_id = meta["umap_id"]
    umap_path = os.path.join(DATA_DIR, dataset, "umaps", f"{umap_id}.parquet")
    umap_df = pd.read_parquet(umap_path)
    umap_points = np.column_stack((umap_df['x'], umap_df['y']))

    # Load cluster assignments
    cluster_df = pd.read_parquet(os.path.join(cluster_dir, f"{cluster}.parquet"))
    labels = cluster_df['cluster'].to_numpy()

    # Check we have at least 2 unique labels
    unique_labels = np.unique(labels)
    if len(unique_labels) < 2:
        result = {
            "silhouette": None,
            "calinski_harabasz": None,
            "davies_bouldin": None,
            "message": "All points assigned to same cluster",
        }
        return jsonify(result)

    from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score

    # For large datasets, sample for silhouette (O(n^2))
    n_points = len(labels)
    sample_size = min(n_points, 10000) if n_points > 50000 else None

    result = {
        "silhouette": round(float(silhouette_score(
            umap_points, labels, sample_size=sample_size
        )), 4),
        "calinski_harabasz": round(float(calinski_harabasz_score(umap_points, labels)), 2),
        "davies_bouldin": round(float(davies_bouldin_score(umap_points, labels)), 4),
    }

    # Cache in metadata
    meta["quality_metrics"] = result
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)

    return jsonify(result)


@datasets_bp.route('/<dataset>/clusters/<cluster>/labels_available', methods=['GET'])
def get_dataset_cluster_labels_available(dataset, cluster):
    return scan_for_json_files(
        os.path.join(_data_dir(), dataset, "clusters"),
        match_pattern=rf"{cluster}-labels-.*\.json",
    )


def get_next_scopes_number(dataset):
    DATA_DIR = _data_dir()
    scopes_files = [
        f for f in os.listdir(os.path.join(DATA_DIR, dataset, "scopes"))
        if re.match(r"scopes-\d+\.json", f)
    ]
    if scopes_files:
        last_scopes = sorted(scopes_files)[-1]
        last_scopes_number = int(last_scopes.split("-")[1].split(".")[0])
        return last_scopes_number + 1
    return 1


@datasets_bp.route('/<dataset>/scopes', methods=['GET'])
def get_dataset_scopes(dataset):
    return scan_for_json_files(
        os.path.join(_data_dir(), dataset, "scopes"),
        match_pattern=r".*[0-9]+\.json$",
    )


@datasets_bp.route('/<dataset>/scopes/<scope>', methods=['GET'])
def get_dataset_scope(dataset, scope):
    file_path = os.path.join(_data_dir(), dataset, "scopes", scope + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/scopes/<scope>/parquet', methods=['GET'])
def get_dataset_scope_parquet(dataset, scope):
    import pandas as pd
    file_path = os.path.join(_data_dir(), dataset, "scopes", scope + ".parquet")
    df = pd.read_parquet(file_path)
    return df.to_json(orient="records")


@datasets_write_bp.route('/<dataset>/scopes/<scope>/description', methods=['GET'])
def overwrite_scope_description(dataset, scope):
    new_label = request.args.get('label')
    new_description = request.args.get('description')

    file_path = os.path.join(_data_dir(), dataset, "scopes", scope + ".json")
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

    file_path = os.path.join(_data_dir(), dataset, "scopes", scope + ".json")
    with open(file_path, 'r', encoding='utf-8') as json_file:
        json_contents = json.load(json_file)

    clusters = json_contents.get('cluster_labels_lookup', [])
    clusterIndex = len(clusters)
    clusters.append({
        "cluster": clusterIndex,
        "label": new_label,
        "hull": [],
        "description": "",
    })
    json_contents['cluster_labels_lookup'] = clusters

    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)

    return jsonify({"success": True, "message": "Cluster created successfully"})


@datasets_bp.route('/<dataset>/export/list', methods=['GET'])
def get_dataset_export_list(dataset):
    DATA_DIR = _data_dir()
    directory_path = os.path.join(DATA_DIR, dataset)
    file_list = []
    for root, dirs, files in os.walk(directory_path):
        if "jobs" in root:
            continue
        for file in files:
            if file == ".DS_Store":
                continue
            if file.endswith('.lock') or file.endswith('.metadata'):
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
    directory_path = os.path.join(_data_dir(), dataset, "plots")
    if not os.path.exists(directory_path):
        return jsonify([])
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
