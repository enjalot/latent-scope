import json
import os
import re

from flask import Blueprint, current_app, jsonify, request

from latentscope.server.job_utils import _safe_dataset

# Create a Blueprint
datasets_bp = Blueprint('datasets_bp', __name__)
datasets_write_bp = Blueprint('datasets_write_bp', __name__)


@datasets_bp.url_value_preprocessor
@datasets_write_bp.url_value_preprocessor
def _validate_dataset_path_param(endpoint, values):
    if values and 'dataset' in values:
        _safe_dataset(values['dataset'])


def _data_dir():
    return current_app.config['DATA_DIR']


@datasets_bp.route('/', methods=['GET'])
def get_datasets():
    DATA_DIR = _data_dir()
    datasets = []
    for dir in os.listdir(DATA_DIR):
        file_path = os.path.join(DATA_DIR, dir, 'meta.json')
        if os.path.isfile(file_path):
            with open(file_path, encoding='utf-8') as file:
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
    except OSError:
        return jsonify({"error": "Unable to scan directory"}), 500

    json_files = [file for file in files if re.match(match_pattern, file)]
    json_contents = []
    for file in json_files:
        try:
            with open(os.path.join(directory_path, file), encoding='utf-8') as json_file:
                json_contents.append(json.load(json_file))
        except json.JSONDecodeError:
            pass
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/meta', methods=['GET'])
def get_dataset_meta(dataset):
    file_path = os.path.join(_data_dir(), dataset, "meta.json")
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(file_path, encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    json_contents[key] = value
    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/image', methods=['GET'])
def get_dataset_image(dataset):
    """Serve a single image cell from input.parquet.

    Query params:
        column: name of an image-typed column (per meta.json column_metadata).
        index:  row index into the dataset.
        size:   optional max dimension; when given the image is thumbnailed
                and re-encoded as WebP. Capped at 1024.

    Only the row group containing the requested row is read (restricted to
    the one column), so multi-GB image datasets are never fully loaded.
    """
    import io

    import pyarrow.parquet as pq
    from flask import Response
    from PIL import Image

    column = request.args.get('column')
    meta_path = os.path.join(_data_dir(), dataset, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except OSError:
        return jsonify({"error": f"dataset {dataset} not found"}), 404
    column_meta = (meta.get("column_metadata") or {}).get(column)
    if not isinstance(column_meta, dict) or column_meta.get("type") != "image":
        return jsonify({"error": f"column {column!r} is not an image column"}), 400

    size = request.args.get('size')
    if size is not None:
        try:
            size = int(size)
        except ValueError:
            return jsonify({"error": "size must be an integer"}), 400
        if size < 1 or size > 1024:
            return jsonify({"error": "size must be between 1 and 1024"}), 400

    file_path = os.path.join(_data_dir(), dataset, "input.parquet")
    parquet_file = pq.ParquetFile(file_path)
    try:
        index = int(request.args.get('index'))
    except (TypeError, ValueError):
        return jsonify({"error": "index must be an integer"}), 404
    if index < 0 or index >= parquet_file.metadata.num_rows:
        return jsonify({"error": "index out of range"}), 404

    # Locate the row group containing the row via cumulative row counts.
    offset = 0
    for row_group in range(parquet_file.metadata.num_row_groups):
        n_rows = parquet_file.metadata.row_group(row_group).num_rows
        if index < offset + n_rows:
            break
        offset += n_rows
    table = parquet_file.read_row_group(row_group, columns=[column])
    value = table.column(0)[index - offset].as_py()

    # Cell values are HF-style {"bytes": ..., "path": ...} dicts or raw bytes.
    if isinstance(value, dict):
        value = value.get("bytes")
    if isinstance(value, bytearray):
        value = bytes(value)
    if not isinstance(value, bytes) or len(value) == 0:
        return jsonify({"error": "no image bytes at this index"}), 404

    headers = {"Cache-Control": "public, max-age=86400"}

    if size is not None:
        try:
            img = Image.open(io.BytesIO(value))
            if img.mode not in ("RGB", "RGBA", "L"):
                img = img.convert("RGB")
            img.thumbnail((size, size))
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
        except Exception:
            return jsonify({"error": "could not decode image"}), 404
        return Response(buf.getvalue(), mimetype="image/webp", headers=headers)

    try:
        fmt = Image.open(io.BytesIO(value)).format
    except Exception:
        fmt = None
    Image.init()  # make sure Image.MIME is populated
    mimetype = Image.MIME.get(fmt, "application/octet-stream")
    return Response(value, mimetype=mimetype, headers=headers)


def _sprite_size_param():
    """Parse the optional ?size= param, default 64. Returns (size, error).

    error is a (response, status) tuple when invalid, else None.
    """
    size = request.args.get('size', '64')
    try:
        size = int(size)
    except (TypeError, ValueError):
        return None, (jsonify({"error": "size must be an integer"}), 400)
    if size < 1 or size > 1024:
        return None, (jsonify({"error": "size must be between 1 and 1024"}), 400)
    return size, None


@datasets_bp.route('/<dataset>/sprites/status', methods=['GET'])
def get_dataset_sprites_status(dataset):
    """Report whether sprites have been generated for a column.

    Query params: column (image column name), size (default 64).
    Reads the sprite manifest if present. Never 500s.
    """
    column = request.args.get('column')
    size, err = _sprite_size_param()
    if err:
        return err

    from latentscope.scripts.sprites import sprite_manifest_name

    manifest_path = os.path.join(
        _data_dir(), dataset, "sprites", sprite_manifest_name(column, size)
    )
    try:
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError):
        return jsonify({"generated": False})

    return jsonify({
        "generated": bool(manifest.get("complete")),
        "count": manifest.get("count"),
        "total": manifest.get("total"),
        "size": manifest.get("size"),
        "missing_count": len(manifest.get("missing") or []),
    })


@datasets_bp.route('/<dataset>/sprite', methods=['GET'])
def get_dataset_sprite(dataset):
    """Serve a single pre-generated WebP sprite thumbnail.

    Query params: column (image column), index (row index), size (default 64).
    Resolves the sharded path and 404s when the file is absent (e.g. a missing
    or undecodable source image).
    """
    from flask import send_file

    column = request.args.get('column')
    meta_path = os.path.join(_data_dir(), dataset, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except OSError:
        return jsonify({"error": f"dataset {dataset} not found"}), 404
    column_meta = (meta.get("column_metadata") or {}).get(column)
    if not isinstance(column_meta, dict) or column_meta.get("type") != "image":
        return jsonify({"error": f"column {column!r} is not an image column"}), 400

    size, err = _sprite_size_param()
    if err:
        return err

    try:
        index = int(request.args.get('index'))
    except (TypeError, ValueError):
        return jsonify({"error": "index must be an integer"}), 404
    if index < 0 or index >= meta.get("length", 0):
        return jsonify({"error": "index out of range"}), 404

    from latentscope.scripts.sprites import sprite_dir_name

    shard = f"{index // 1000:03d}"
    sprite_path = os.path.join(
        _data_dir(), dataset, "sprites", sprite_dir_name(column, size), shard, f"{index}.webp"
    )
    if not os.path.exists(sprite_path):
        return jsonify({"error": "no sprite at this index"}), 404

    response = send_file(sprite_path, mimetype="image/webp")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


def _atlas_manifest(dataset, scope, column):
    """Load an atlas manifest, or None if it is absent/unreadable."""
    from latentscope.scripts.sprite_atlas import atlas_manifest_name, atlas_root

    manifest_path = os.path.join(
        atlas_root(_data_dir(), dataset, scope, column), atlas_manifest_name()
    )
    try:
        with open(manifest_path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


@datasets_bp.route('/<dataset>/scopes/<scope>/atlas/status', methods=['GET'])
def get_dataset_atlas_status(dataset, scope):
    """Report whether sprite-sheet atlases exist for a scope/column.

    Query params: column (image column name). Returns the manifest (resolutions,
    cell_size, sheet paths) so the frontend can pick which sheet to render.
    Never 500s.
    """
    _safe_dataset(scope, param="scope")
    column = request.args.get('column')
    manifest = _atlas_manifest(dataset, scope, column)
    if not manifest or not manifest.get("complete"):
        return jsonify({"generated": False})
    return jsonify({
        "generated": True,
        "column": manifest.get("column"),
        "cell_size": manifest.get("cell_size"),
        "samples": manifest.get("samples"),
        "domain": manifest.get("domain"),
        "resolutions": manifest.get("resolutions"),
    })


@datasets_bp.route('/<dataset>/scopes/<scope>/atlas/sheet', methods=['GET'])
def get_dataset_atlas_sheet(dataset, scope):
    """Serve a single atlas sheet (a WebP covering the whole heatmap grid).

    Query params: column (image column), res (grid resolution, e.g. 64),
    sheet (sample index, default 0). Resolves the sheet via the manifest and
    404s when absent.
    """
    from flask import send_file

    from latentscope.scripts.sprite_atlas import atlas_root

    _safe_dataset(scope, param="scope")
    column = request.args.get('column')

    meta_path = os.path.join(_data_dir(), dataset, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except OSError:
        return jsonify({"error": f"dataset {dataset} not found"}), 404
    column_meta = (meta.get("column_metadata") or {}).get(column)
    if not isinstance(column_meta, dict) or column_meta.get("type") != "image":
        return jsonify({"error": f"column {column!r} is not an image column"}), 400

    try:
        res = int(request.args.get('res'))
    except (TypeError, ValueError):
        return jsonify({"error": "res must be an integer"}), 404
    try:
        sheet = int(request.args.get('sheet', 0))
    except (TypeError, ValueError):
        return jsonify({"error": "sheet must be an integer"}), 404

    manifest = _atlas_manifest(dataset, scope, column)
    if not manifest:
        return jsonify({"error": "no atlas for this scope/column"}), 404

    entry = next(
        (r for r in manifest.get("resolutions", []) if r.get("num_tiles") == res),
        None,
    )
    if entry is None or sheet < 0 or sheet >= len(entry.get("sheets", [])):
        return jsonify({"error": "no atlas sheet at this resolution/index"}), 404

    # sheet paths in the manifest are relative to atlas_root and written by us;
    # join under the root and confirm containment before serving.
    root = atlas_root(_data_dir(), dataset, scope, column)
    sheet_path = os.path.normpath(os.path.join(root, entry["sheets"][sheet]))
    if os.path.commonpath([root, sheet_path]) != root or not os.path.exists(sheet_path):
        return jsonify({"error": "atlas sheet not found"}), 404

    response = send_file(sheet_path, mimetype="image/webp")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@datasets_bp.route('/<dataset>/embeddings', methods=['GET'])
def get_dataset_embeddings(dataset):
    return scan_for_json_files(os.path.join(_data_dir(), dataset, "embeddings"))


@datasets_bp.route('/<dataset>/embeddings/<embedding>', methods=['GET'])
def get_dataset_embedding(dataset, embedding):
    file_path = os.path.join(_data_dir(), dataset, "embeddings", embedding + ".json")
    with open(file_path, encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    return jsonify(json_contents)


@datasets_bp.route('/<dataset>/embeddings/<embedding>/format', methods=['GET'])
def get_embedding_format(dataset, embedding):
    from latentscope.util.embedding_store import get_storage_format
    fmt = get_storage_format(_data_dir(), dataset, embedding)
    return jsonify({"format": fmt, "embedding_id": embedding})


@datasets_bp.route('/<dataset>/embeddings/<embedding>/migrate', methods=['POST'])
def migrate_embedding(dataset, embedding):
    from latentscope.util.embedding_store import get_storage_format, migrate_hdf5_to_lancedb
    fmt = get_storage_format(_data_dir(), dataset, embedding)
    if fmt == "lancedb":
        return jsonify({"status": "already_migrated", "format": "lancedb"})
    if fmt == "none":
        return jsonify({"error": "No embedding data found"}), 404
    result = migrate_hdf5_to_lancedb(_data_dir(), dataset, embedding)
    return jsonify(result)


@datasets_bp.route('/<dataset>/saes', methods=['GET'])
def get_dataset_saes(dataset):
    return scan_for_json_files(os.path.join(_data_dir(), dataset, "saes"))


@datasets_bp.route('/<dataset>/saes/<sae>', methods=['GET'])
def get_dataset_sae(dataset, sae):
    file_path = os.path.join(_data_dir(), dataset, "saes", sae + ".json")
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(meta_path, encoding='utf-8') as f:
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

    from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score

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
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(file_path, encoding='utf-8') as json_file:
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
    with open(file_path, encoding='utf-8') as json_file:
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
