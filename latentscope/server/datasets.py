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


# Thumbnail cache size buckets: a requested ?size= is quantized UP to the
# next bucket so the on-disk cache cannot fragment across arbitrary sizes.
# The buckets share the sprite layout (<dataset>/sprites/<col>-<size>/...),
# so anything prebaked by ls-sprites or ingest is served without a decode.
THUMBNAIL_SIZE_BUCKETS = (64, 100, 150, 300, 600, 1024)


def _thumbnail_bucket(size):
    """Quantize a requested thumbnail size up to the next cache bucket."""
    for bucket in THUMBNAIL_SIZE_BUCKETS:
        if size <= bucket:
            return bucket
    return THUMBNAIL_SIZE_BUCKETS[-1]


def _thumbnail_cache_path(dataset, column, index, bucket):
    """On-disk cache path for a thumbnail, matching the ls-sprites layout."""
    from latentscope.scripts.sprites import shard_for, sprite_dir_name

    return os.path.join(
        _data_dir(), dataset, "sprites",
        sprite_dir_name(column, bucket), shard_for(index), f"{index}.webp",
    )


@datasets_bp.route('/<dataset>/image', methods=['GET'])
def get_dataset_image(dataset):
    """Serve a single image cell from input.parquet.

    Query params:
        column: name of an image-typed column (per meta.json column_metadata).
        index:  row index into the dataset.
        size:   optional max dimension; when given the image is thumbnailed
                and re-encoded as WebP. Capped at 1024. The response never
                exceeds the requested size.

    Thumbnails are served from a write-through cache in the sprites layout
    (``<dataset>/sprites/<column>-<bucket>/<shard>/<index>.webp``), stored at
    THUMBNAIL_SIZE_BUCKETS granularity (the requested size quantized up).
    Bucket-sized requests are sent straight from disk with no decode;
    non-bucket sizes are downscaled from the cached bucket rendition. A miss
    falls back to the parquet read + PIL decode and persists the bucket
    rendition for next time. Only the row group containing the requested row
    is read (restricted to the one column), so multi-GB image datasets are
    never fully loaded.
    """
    import io

    import pyarrow.parquet as pq
    from flask import Response, send_file
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

    try:
        index = int(request.args.get('index'))
    except (TypeError, ValueError):
        return jsonify({"error": "index must be an integer"}), 404
    if index < 0:
        return jsonify({"error": "index out of range"}), 404

    headers = {"Cache-Control": "public, max-age=86400"}

    bucket = cache_path = None
    if size is not None:
        bucket = _thumbnail_bucket(size)
        cache_path = _thumbnail_cache_path(dataset, column, index, bucket)
        if os.path.exists(cache_path):
            if size == bucket:
                # hot path: bucket-sized requests (what the UI makes) are a
                # plain file send, no decode
                response = send_file(cache_path, mimetype="image/webp")
                response.headers["Cache-Control"] = headers["Cache-Control"]
                return response
            # size is a documented *maximum*: honor it by downscaling the
            # cached bucket thumbnail (cheap — it's already small) instead of
            # serving a larger image than the caller asked for.
            try:
                img = Image.open(cache_path)
                img.thumbnail((size, size))
                buf = io.BytesIO()
                img.save(buf, format="WEBP", quality=80)
                return Response(buf.getvalue(), mimetype="image/webp", headers=headers)
            except Exception:
                # corrupted cache entry — fall through and regenerate it
                pass

    file_path = os.path.join(_data_dir(), dataset, "input.parquet")
    parquet_file = pq.ParquetFile(file_path)
    if index >= parquet_file.metadata.num_rows:
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

    if size is not None:
        try:
            img = Image.open(io.BytesIO(value))
            if img.mode not in ("RGB", "RGBA", "L"):
                img = img.convert("RGB")
            img.thumbnail((bucket, bucket))
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
        except Exception:
            return jsonify({"error": "could not decode image"}), 404
        # Write-through: persist the thumbnail so the next request skips the
        # parquet read + decode entirely. Best-effort — a failed write (e.g.
        # read-only filesystem) must never fail the request.
        if not current_app.config.get('READ_ONLY'):
            tmp_path = f"{cache_path}.tmp-{os.getpid()}"
            try:
                os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                with open(tmp_path, "wb") as f:
                    f.write(buf.getvalue())
                os.replace(tmp_path, cache_path)
            except OSError as e:
                current_app.logger.warning(
                    "could not cache thumbnail %s: %s", cache_path, e
                )
        if size < bucket:
            # the cache keeps the bucket rendition; the response honors the
            # requested maximum
            img.thumbnail((size, size))
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
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

    sprite_path = _thumbnail_cache_path(dataset, column, index, size)
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

    # Revalidate the cached atlas against the current scope input. If the scope
    # was overwritten with a different UMAP or deleted-row set, the sampled
    # cell images no longer match the points, so report it as stale (not
    # generated) and let Explore fall back to the heatmap until regenerated.
    # Atlases written before fingerprinting (no stored fp) are trusted as-is.
    stored_fp = manifest.get("input_fingerprint")
    if stored_fp:
        from latentscope.scripts.sprite_atlas import (
            scope_fingerprint,
            scope_input_parquet_path,
        )
        current_fp = scope_fingerprint(
            scope_input_parquet_path(_data_dir(), dataset, scope)
        )
        if current_fp is not None and current_fp != stored_fp:
            return jsonify({"generated": False, "stale": True})

    return jsonify({
        "generated": True,
        "column": manifest.get("column"),
        "cell_size": manifest.get("cell_size"),
        "samples": manifest.get("samples"),
        "domain": manifest.get("domain"),
        "resolutions": manifest.get("resolutions"),
    })


def _atlas_column_is_image(dataset, column):
    meta_path = os.path.join(_data_dir(), dataset, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except OSError:
        return None, (jsonify({"error": f"dataset {dataset} not found"}), 404)
    column_meta = (meta.get("column_metadata") or {}).get(column)
    if not isinstance(column_meta, dict) or column_meta.get("type") != "image":
        return None, (jsonify({"error": f"column {column!r} is not an image column"}), 400)
    return meta, None


@datasets_bp.route('/<dataset>/scopes/<scope>/atlas/sheet', methods=['GET'])
def get_dataset_atlas_sheet(dataset, scope):
    """Serve one atlas tile (a WebP for tile (tx, ty) of a resolution's pyramid).

    Query params: column (image column), res (grid resolution), tx, ty (tile
    coords), sheet (sample index, default 0). 404s when the tile is absent.
    """
    from flask import send_file

    from latentscope.scripts.sprite_atlas import atlas_root, atlas_sheet_name, atlas_tile_dir

    _safe_dataset(scope, param="scope")
    column = request.args.get('column')
    _, err = _atlas_column_is_image(dataset, column)
    if err:
        return err

    try:
        res = int(request.args.get('res'))
        tx = int(request.args.get('tx'))
        ty = int(request.args.get('ty'))
        sheet = int(request.args.get('sheet', 0))
    except (TypeError, ValueError):
        return jsonify({"error": "res, tx, ty, sheet must be integers"}), 404
    if min(res, tx, ty, sheet) < 0:
        return jsonify({"error": "invalid tile coordinates"}), 404

    root = atlas_root(_data_dir(), dataset, scope, column)
    sheet_path = os.path.normpath(
        os.path.join(root, atlas_tile_dir(res, tx, ty), atlas_sheet_name(sheet))
    )
    if os.path.commonpath([root, sheet_path]) != root or not os.path.exists(sheet_path):
        return jsonify({"error": "atlas tile not found"}), 404

    response = send_file(sheet_path, mimetype="image/webp")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@datasets_bp.route('/<dataset>/scopes/<scope>/atlas/plan', methods=['GET'])
def get_dataset_atlas_plan(dataset, scope):
    """Plan an atlas without generating it: per-resolution populated cell/tile
    counts, populated tile coords, and a density grid for the heatmap.

    Query params: column (image column), resolutions (csv, default 64,128,256),
    cell_size (default 32), tile_px (default 2048).
    """
    import pandas as pd

    from latentscope.scripts.sprite_atlas import plan_atlas, sample_bytes_per_cell

    _safe_dataset(scope, param="scope")
    column = request.args.get('column')
    _, err = _atlas_column_is_image(dataset, column)
    if err:
        return err

    try:
        resolutions = [int(v) for v in request.args.get('resolutions', '64,128,256').split(',') if v.strip()]
        cell_size = int(request.args.get('cell_size', 32))
        tile_px = int(request.args.get('tile_px', 2048))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid plan parameters"}), 400
    resolutions = [r for r in resolutions if 1 <= r <= 2048][:12]
    if (not resolutions or not (4 <= cell_size <= 256)
            or not (cell_size <= tile_px <= 16384)):
        return jsonify({"error": "invalid plan parameters"}), 400

    scope_path = os.path.join(_data_dir(), dataset, "scopes", scope + ".parquet")
    if not os.path.exists(scope_path):
        return jsonify({"error": f"scope {scope} not found"}), 404
    df = pd.read_parquet(scope_path, columns=["x", "y", "deleted"])
    if "deleted" in df:
        df = df[~df["deleted"].astype(bool)]
    plan = plan_atlas(df["x"].to_numpy(), df["y"].to_numpy(), resolutions,
                      cell_size=cell_size, tile_px=tile_px)

    # Estimate encoded bytes per populated cell by sampling real images, so the
    # UI can show per-resolution + total size before generating.
    scope_input = os.path.join(_data_dir(), dataset, "scopes", scope + "-input.parquet")
    bytes_per_cell = None
    if os.path.exists(scope_input):
        try:
            bytes_per_cell = sample_bytes_per_cell(scope_input, column, cell_size)
        except Exception:
            bytes_per_cell = None
    plan["bytes_per_cell"] = bytes_per_cell
    return jsonify(plan)


@datasets_bp.route('/<dataset>/column/<column>', methods=['GET'])
def get_dataset_column(dataset, column):
    """Return per-point values for a column, aligned to ls_index order (#131).

    Query params:
        scope: optional scope id. When given and its ``<scope>-input.parquet``
            exists, values are read from (and subset to) that scope's rows,
            in ls_index order. Otherwise the full dataset ``input.parquet`` is
            used, also in ls_index order.

    Response (numeric column):
        {"column", "values": number[], "extent": [min, max], "type": "numeric"}
    Response (categorical column):
        {"column", "values": number[] (category indices), "type": "categorical",
         "categorical": {"categories": [...], "counts": [...]}}

    ``len(values)`` always equals the returned row count.
    """
    import numpy as np
    import pandas as pd

    DATA_DIR = _data_dir()
    dataset_dir = os.path.join(DATA_DIR, dataset)
    meta_path = os.path.join(dataset_dir, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except OSError:
        return jsonify({"error": f"dataset {dataset} not found"}), 404

    column_metadata = meta.get("column_metadata") or {}
    col_meta = column_metadata.get(column) or {}

    # Choose the source parquet. A scope's `<scope>-input.parquet` is the full
    # input joined with the scope columns, subset to the scope's rows and stored
    # in ls_index order (see scope.py). Fall back to the full dataset input.
    scope = request.args.get('scope')
    parquet_path = None
    if scope:
        _safe_dataset(scope, param="scope")
        candidate = os.path.join(dataset_dir, "scopes", scope + "-input.parquet")
        if os.path.exists(candidate):
            parquet_path = candidate
    if parquet_path is None:
        parquet_path = os.path.join(dataset_dir, "input.parquet")
    if not os.path.exists(parquet_path):
        return jsonify({"error": "input data not found"}), 404

    try:
        df = pd.read_parquet(parquet_path, columns=[column])
    except Exception:
        return jsonify({"error": f"column {column!r} not found"}), 404
    series = df[column]

    ctype = col_meta.get("type")
    if ctype in ("array", "image"):
        return jsonify({"error": f"column {column!r} is not colorable"}), 400

    categories = col_meta.get("categories")
    # Categorical: known categories from ingest metadata, or computed on the fly
    # for a string column whose cardinality exceeded ingest's category cap.
    if categories is not None or ctype in ("string", "date", "unknown", None):
        if categories is not None:
            counts_dict = col_meta.get("counts") or {}
            counts = [int(counts_dict.get(c, 0)) for c in categories]
        else:
            vc = series.astype(str).value_counts()
            categories = vc.index.tolist()
            counts = [int(c) for c in vc.tolist()]
        cat_index = {str(c): i for i, c in enumerate(categories)}
        values = [int(cat_index.get(v, -1)) for v in series.astype(str).tolist()]
        return jsonify({
            "column": column,
            "values": values,
            "type": "categorical",
            "categorical": {"categories": categories, "counts": counts},
        })

    # Numeric (and anything else with a stored extent).
    numeric = pd.to_numeric(series, errors="coerce")
    extent = col_meta.get("extent")
    if not extent or extent[0] is None or extent[1] is None:
        arr = numeric.to_numpy(dtype=float)
        finite = arr[np.isfinite(arr)]
        extent = [float(finite.min()), float(finite.max())] if finite.size else [None, None]
    values = [None if pd.isna(x) else float(x) for x in numeric.tolist()]
    return jsonify({
        "column": column,
        "values": values,
        "extent": extent,
        "type": "numeric",
    })


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
    # Use all projection axes (x, y and z for 3D umaps) so quality metrics match
    # the space the clustering was actually computed in.
    axes = [umap_df['x'], umap_df['y']]
    if 'z' in umap_df.columns:
        axes.append(umap_df['z'])
    umap_points = np.column_stack(axes)

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


def _merge_name_description(dataset, subdir, name_id, param):
    """Merge JSON {name, description} into <subdir>/<name_id>.json.

    Only the provided keys are created/overwritten; other fields are left
    intact. Mirrors overwrite_scope_description's file-write style but uses a
    POST JSON body (free-text values avoid query-string encoding pitfalls).
    """
    _safe_dataset(name_id, param=param)
    payload = request.get_json(silent=True) or {}
    file_path = os.path.join(_data_dir(), dataset, subdir, name_id + ".json")
    if not os.path.exists(file_path):
        return jsonify({"error": f"{param} {name_id} not found"}), 404
    with open(file_path, encoding='utf-8') as json_file:
        json_contents = json.load(json_file)
    for key in ("name", "description"):
        if key in payload:
            json_contents[key] = payload[key]
    with open(file_path, 'w', encoding='utf-8') as json_file:
        json.dump(json_contents, json_file, indent=2)
    return jsonify({"success": True})


@datasets_write_bp.route('/<dataset>/umaps/<umap>/meta', methods=['POST'])
def update_umap_meta(dataset, umap):
    return _merge_name_description(dataset, "umaps", umap, "umap")


@datasets_write_bp.route('/<dataset>/clusters/<cluster>/meta', methods=['POST'])
def update_cluster_meta(dataset, cluster):
    return _merge_name_description(dataset, "clusters", cluster, "cluster")


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


@datasets_write_bp.route('/<dataset>/export/combine/<scope>', methods=['POST'])
def combine_scope_export(dataset, scope):
    """Write an on-demand combined export parquet for a scope.

    Reads the scope's ``<scope>-input.parquet`` (input joined with scope
    columns) and adds a boolean ``tag_<name>`` column for every tag in the
    dataset, True at the tagged row indices. The result is written to
    ``scopes/<scope>-export.parquet`` (issue #38).
    """
    import pandas as pd

    from latentscope.server.tags import load_tag_indices

    _safe_dataset(scope, param='scope')
    DATA_DIR = _data_dir()
    scope_input_path = os.path.join(DATA_DIR, dataset, "scopes", scope + "-input.parquet")
    if not os.path.exists(scope_input_path):
        return jsonify({"error": f"No input parquet found for scope {scope}"}), 404

    df = pd.read_parquet(scope_input_path)
    for tag, indices in load_tag_indices(DATA_DIR, dataset).items():
        df[f"tag_{tag}"] = df["index"].isin(indices)

    export_name = scope + "-export.parquet"
    export_path = os.path.join(DATA_DIR, dataset, "scopes", export_name)
    df.to_parquet(export_path)
    return jsonify({
        "name": export_name,
        "relative_path": os.path.join("scopes", export_name),
        "size": os.path.getsize(export_path),
    })


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
