import json
import logging
import math
import os
import sys
from importlib.resources import files

from dotenv import dotenv_values, set_key
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from latentscope.__version__ import __version__
from latentscope.util import get_data_dir, get_supported_api_keys


def _parse_bool_env(value):
    """Return True when value is a truthy string (1/true/yes/y/t)."""
    if value is None:
        return False
    return value.lower() in ('true', '1', 't', 'y', 'yes')


def _image_columns(data_dir, dataset):
    """Column names flagged ``type: "image"`` in the dataset's meta.json."""
    meta_path = os.path.join(data_dir, dataset, "meta.json")
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []
    column_metadata = meta.get("column_metadata") or {}
    return [
        col for col, col_meta in column_metadata.items()
        if isinstance(col_meta, dict) and col_meta.get("type") == "image"
    ]


def _load_dataset_dataframe(data_dir, dataset, dataframes):
    """Load (and cache) a dataset's input.parquet, excluding image columns.

    Binary image columns are dropped at parquet-read time: their bytes can't
    be JSON serialized and would otherwise bloat the in-memory DATAFRAMES
    cache by GBs. The frontend reconstructs image display from column
    metadata + row index via /api/datasets/<dataset>/image. Datasets with no
    image columns are read exactly as before.
    """
    if dataset in dataframes:
        return dataframes[dataset]

    import pandas as pd

    file_path = os.path.join(data_dir, dataset, "input.parquet")
    image_cols = _image_columns(data_dir, dataset)
    if image_cols:
        import pyarrow.parquet as pq
        schema_names = pq.ParquetFile(file_path).schema_arrow.names
        keep = [col for col in schema_names if col not in image_cols]
        df = pd.read_parquet(file_path, columns=keep)
    else:
        df = pd.read_parquet(file_path)
    dataframes[dataset] = df
    return df


def _sanitize_bytes_for_json(df):
    """Defensively null out values that would break ``DataFrame.to_json``.

    Raw bytes (or HF-style dicts containing bytes) can't be serialized as
    JSON; any such value that still reaches the serialization path is
    replaced with None rather than 500ing. Mutates and returns ``df`` (pass
    a copy)."""
    def _contains_bytes(value):
        if isinstance(value, (bytes, bytearray)):
            return True
        if isinstance(value, dict):
            return any(isinstance(v, (bytes, bytearray)) for v in value.values())
        return False

    for col in df.columns:
        if df[col].dtype == object:
            mask = df[col].map(_contains_bytes)
            if mask.any():
                df[col] = df[col].where(~mask, None)
    return df


def create_app(data_dir=None, read_only=None):
    """Application factory.

    Args:
        data_dir: Path to the data directory.  When *None* the value is read
            from the ``LATENT_SCOPE_DATA`` environment variable (via
            :func:`latentscope.util.get_data_dir`).
        read_only: When *True* all write endpoints are disabled.  When *None*
            the value is read from the ``LATENT_SCOPE_READ_ONLY`` environment
            variable.

    Returns:
        A configured :class:`flask.Flask` application instance.
    """
    if data_dir is None:
        data_dir = get_data_dir()
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    if read_only is None:
        read_only = _parse_bool_env(os.getenv("LATENT_SCOPE_READ_ONLY"))

    app = Flask(__name__)
    app.logger.addHandler(logging.StreamHandler(sys.stderr))
    app.logger.setLevel(logging.INFO)

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Store configuration so blueprints can access it via current_app.config
    app.config['DATA_DIR'] = data_dir
    app.config['READ_ONLY'] = read_only

    app.logger.info("Data directory: %s", data_dir)
    app.logger.info("Read-only mode: %s", read_only)

    # In-memory cache of DataFrames, keyed by dataset id. Bounded so the
    # server doesn't accumulate a full copy of every dataset ever touched.
    from latentscope.util.lru import LRUCache
    app.config['DATAFRAMES'] = LRUCache(maxsize=4)

    # ------------------------------------------------------------------
    # JSON error handlers
    # ------------------------------------------------------------------

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        return jsonify({"error": e.description, "code": e.code}), e.code

    @app.errorhandler(Exception)
    def handle_unexpected_exception(e):
        # Preserve normal exception propagation while testing/debugging so
        # failures surface directly in test output and the debugger.
        if app.testing or app.debug:
            raise e
        app.logger.exception("Unhandled exception")
        return jsonify({"error": str(e), "code": 500}), 500

    # ------------------------------------------------------------------
    # Blueprint registration
    # ------------------------------------------------------------------
    from .jobs import jobs_bp, jobs_write_bp, reconcile_stale_jobs
    app.register_blueprint(jobs_bp, url_prefix='/api/jobs')
    if not read_only:
        app.register_blueprint(jobs_write_bp, url_prefix='/api/jobs')

    # Mark jobs left "running" by a previous server process as dead.  A bad
    # job file must never prevent the server from starting.  Read-only
    # deployments must not mutate the data directory at all.
    if not read_only:
        try:
            reconcile_stale_jobs(data_dir)
        except Exception:
            app.logger.exception("Failed to reconcile stale jobs on startup")

    from .search import search_bp
    app.register_blueprint(search_bp, url_prefix='/api/search')

    from .tags import tags_bp, tags_write_bp
    app.register_blueprint(tags_bp, url_prefix='/api/tags')
    if not read_only:
        app.register_blueprint(tags_write_bp, url_prefix='/api/tags')

    from .datasets import datasets_bp, datasets_write_bp
    app.register_blueprint(datasets_bp, url_prefix='/api/datasets')
    if not read_only:
        app.register_blueprint(datasets_write_bp, url_prefix='/api/datasets')

    from .bulk import bulk_bp, bulk_write_bp
    app.register_blueprint(bulk_bp, url_prefix='/api/bulk')
    if not read_only:
        app.register_blueprint(bulk_write_bp, url_prefix='/api/bulk')

    from .admin import admin_bp
    if not read_only:
        app.register_blueprint(admin_bp, url_prefix='/api/admin')

    from .models import models_bp, models_write_bp
    app.register_blueprint(models_bp, url_prefix='/api/models')
    if not read_only:
        app.register_blueprint(models_write_bp, url_prefix='/api/models')

    from .estimate import estimate_bp
    app.register_blueprint(estimate_bp, url_prefix='/api/estimate')

    # ------------------------------------------------------------------
    # File / data routes defined directly on the app
    # ------------------------------------------------------------------

    @app.route('/api/files/<path:datasetPath>', methods=['GET'])
    def send_file(datasetPath):
        return send_from_directory(data_dir, datasetPath)

    @app.route('/api/indexed', methods=['POST'])
    def indexed():
        import h5py
        import numpy as np

        req = request.get_json()
        dataset = req['dataset']
        indices = req['indices']
        columns = req.get('columns')
        embedding_id = req.get('embedding_id')
        sae_id = req.get('sae_id')

        df = _load_dataset_dataframe(data_dir, dataset, app.config['DATAFRAMES'])

        if columns:
            # image columns are excluded at read time, so drop them from any
            # requested column list rather than KeyError-ing
            df = df[[col for col in columns if col in df.columns]]

        valid_indices = [i for i in indices if i < len(df)]
        rows = df.iloc[valid_indices].copy()
        rows['index'] = valid_indices

        if embedding_id:
            from latentscope.util.embedding_store import load_embeddings as lance_load
            all_embeddings = lance_load(data_dir, dataset, embedding_id)
            npvi = np.array(valid_indices)
            sorted_indices = np.argsort(npvi)
            sorted_embeddings = all_embeddings[npvi[sorted_indices]]
            filtered_embeddings = sorted_embeddings[np.argsort(sorted_indices)]
            rows['ls_embedding'] = filtered_embeddings

        if sae_id:
            sae_path = os.path.join(data_dir, dataset, "saes", f"{sae_id}.h5")
            with h5py.File(sae_path, 'r') as f:
                npvi = np.array(valid_indices)
                sorted_indices = np.argsort(npvi)
                sorted_acts = np.array(f["top_acts"][npvi[sorted_indices]])
                filtered_acts = sorted_acts[np.argsort(sorted_indices)]
                sorted_top_inds = np.array(f["top_indices"][npvi[sorted_indices]])
                filtered_top_inds = sorted_top_inds[np.argsort(sorted_indices)]
            rows['sae_acts'] = filtered_acts.tolist()
            rows['sae_indices'] = filtered_top_inds.tolist()

        return _sanitize_bytes_for_json(rows).to_json(orient="records")

    @app.route('/api/tokens/indexed', methods=['POST'])
    def tokens_indexed():
        """Token-scope table fetch: given global token indices, return one row
        per token — the parent document's columns plus the token's string,
        position, and char span (for snippet highlighting). The returned
        'index' is the token index; 'parent_index' links back to the dataset
        row.
        """
        import h5py
        import numpy as np

        req = request.get_json()
        dataset = req['dataset']
        embedding_id = req['embedding_id']
        token_indices = req['indices']
        columns = req.get('columns')
        sae_id = req.get('sae_id')

        from latentscope.util.embedding_store import load_token_metadata
        if not token_indices:
            return jsonify([])
        tok_df = load_token_metadata(
            data_dir, dataset, embedding_id, token_indices=token_indices)
        # preserve request order (load_token_metadata sorts by token_index)
        order = {t: i for i, t in enumerate(token_indices)}
        tok_df = tok_df.sort_values(
            by="token_index", key=lambda s: s.map(order)).reset_index(drop=True)

        df = _load_dataset_dataframe(data_dir, dataset, app.config['DATAFRAMES'])
        if columns:
            df = df[[col for col in columns if col in df.columns]]

        parent_indices = tok_df["ls_index"].tolist()
        rows = df.iloc[parent_indices].copy().reset_index(drop=True)
        rows['index'] = tok_df["token_index"].tolist()
        rows['parent_index'] = parent_indices
        rows['token_str'] = tok_df["token_str"].tolist()
        rows['token_pos'] = tok_df["token_pos"].tolist()
        rows['char_start'] = tok_df["char_start"].tolist()
        rows['char_end'] = tok_df["char_end"].tolist()

        if sae_id:
            # token-granularity SAE: h5 rows are tokens, in token_index order
            sae_path = os.path.join(data_dir, dataset, "saes", f"{sae_id}.h5")
            npvi = np.array(tok_df["token_index"].tolist())
            sorted_indices = np.argsort(npvi)
            with h5py.File(sae_path, 'r') as f:
                sorted_acts = np.array(f["top_acts"][npvi[sorted_indices]])
                sorted_top_inds = np.array(f["top_indices"][npvi[sorted_indices]])
            rows['sae_acts'] = sorted_acts[np.argsort(sorted_indices)].tolist()
            rows['sae_indices'] = sorted_top_inds[np.argsort(sorted_indices)].tolist()

        return _sanitize_bytes_for_json(rows).to_json(orient="records")

    @app.route('/api/column-filter', methods=['POST'])
    def column_filter():
        req = request.get_json()
        dataset = req['dataset']
        filters = req['filters']

        df = _load_dataset_dataframe(data_dir, dataset, app.config['DATAFRAMES'])

        rows = df.copy()
        if filters:
            for f in filters:
                col, val = f['column'], f['value']
                if f["type"] == "eq":
                    rows = rows[rows[col] == val]
                elif f["type"] == "gt":
                    rows = rows[rows[col] > val]
                elif f["type"] == "lt":
                    rows = rows[rows[col] < val]
                elif f["type"] == "gte":
                    rows = rows[rows[col] >= val]
                elif f["type"] == "lte":
                    rows = rows[rows[col] <= val]
                elif f["type"] == "in":
                    rows = rows[rows[col].isin(val)]
                elif f["type"] == "contains":
                    rows = rows[rows[col].str.contains(val)]

        return jsonify(indices=rows.index.to_list())

    @app.route('/api/query', methods=['POST'])
    def query():
        import h5py
        import numpy as np

        per_page = 100
        req = request.get_json()
        dataset = req['dataset']
        page = req.get('page', 0)
        indices = req.get('indices', [])
        embedding_id = req.get('embedding_id')
        sae_id = req.get('sae_id')
        sort = req.get('sort')

        df = _load_dataset_dataframe(data_dir, dataset, app.config['DATAFRAMES'])

        rows = df.copy()
        rows['ls_index'] = rows.index

        if len(indices):
            rows = rows.loc[indices]

        if embedding_id:
            from latentscope.util.embedding_store import load_embeddings as lance_load
            all_embeddings = lance_load(data_dir, dataset, embedding_id)
            npvi = np.array(rows.index)
            sorted_indices = np.argsort(npvi)
            sorted_embeddings = all_embeddings[npvi[sorted_indices]]
            filtered_embeddings = sorted_embeddings[np.argsort(sorted_indices)]
            rows['ls_embedding'] = filtered_embeddings.tolist()

        if sae_id:
            sae_path = os.path.join(data_dir, dataset, "saes", f"{sae_id}.h5")
            with h5py.File(sae_path, 'r') as f:
                npvi = np.array(rows.index)
                sorted_indices = np.argsort(npvi)
                sorted_acts = np.array(f["top_acts"][npvi[sorted_indices]])
                filtered_acts = sorted_acts[np.argsort(sorted_indices)]
                sorted_top_inds = np.array(f["top_indices"][npvi[sorted_indices]])
                filtered_top_inds = sorted_top_inds[np.argsort(sorted_indices)]
            rows['ls_features'] = [
                {'top_acts': act, 'top_indices': idx}
                for act, idx in zip(filtered_acts, filtered_top_inds)
            ]

        if sort:
            rows = rows.sort_values(by=sort['column'], ascending=sort['ascending'])

        page_rows = rows[page * per_page:page * per_page + per_page].copy()
        rows_json = json.loads(_sanitize_bytes_for_json(page_rows).to_json(orient="records"))
        return jsonify({
            "rows": rows_json,
            "page": page,
            "per_page": per_page,
            "total": len(rows),
            "totalPages": math.ceil(len(rows) / per_page),
        })

    if not read_only:
        @app.route('/api/settings', methods=['POST'])
        def update_settings():
            req = request.get_json()
            env_file = app.config.get('ENV_FILE', '.env')
            for key in req:
                set_key(env_file, key, req[key])
            return jsonify({})

        @app.route('/api/settings', methods=['GET'])
        def get_settings():
            env_file = app.config.get('ENV_FILE', '.env')
            config = dotenv_values(env_file)
            supported_api_keys = get_supported_api_keys()
            settings = {
                "data_dir": config.get("LATENT_SCOPE_DATA", data_dir),
                "api_keys": [key for key in config if key in supported_api_keys],
                "supported_api_keys": supported_api_keys,
                "env_file": os.path.abspath(env_file),
            }
            return jsonify(settings)

    @app.route('/api/version', methods=['GET'])
    def get_version():
        return __version__

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        if path.endswith('.js') or path.endswith('.css'):
            pth = files('latentscope').joinpath(f"web/dist/{path}")
            return send_from_directory(pth.parent, pth.name)
        pth = files('latentscope').joinpath("web/dist/index.html")
        if not pth.is_file():
            return _MISSING_DIST_HTML, 503, {"Content-Type": "text/html"}
        return send_from_directory(pth.parent, pth.name)

    return app


# Served (with a 503) on UI routes when the frontend bundle is missing — i.e. a
# source checkout that has never been built. The API blueprints still work; only
# the catch-all has nothing to send. Checked per-request, so once the bundle is
# built no restart is needed.
_MISSING_DIST_HTML = """<!doctype html>
<title>Latent Scope — frontend not built</title>
<style>body{font-family:system-ui;max-width:42rem;margin:4rem auto;line-height:1.5}
pre{background:#f4f4f4;padding:1rem;overflow-x:auto}</style>
<h1>Frontend not built</h1>
<p>The API server is running, but <code>latentscope/web/dist/index.html</code>
does not exist — this is a source checkout without a built web bundle
(a pip-installed <code>latentscope</code> ships it pre-built).</p>
<p>Build it once from the repo root (requires Node):</p>
<pre>cd web &amp;&amp; npm install &amp;&amp; npm run production &amp;&amp; cd ..
mkdir -p latentscope/web/dist
cp -r web/dist/production/* latentscope/web/dist/</pre>
<p>Then reload this page — no server restart needed.</p>
"""


def missing_dist_warning():
    """Return a warning string if the web bundle is missing, else None."""
    if files('latentscope').joinpath("web/dist/index.html").is_file():
        return None
    return (
        "WARNING: latentscope/web/dist/index.html not found — the web UI is not "
        "built, so all non-/api routes will return 503. Build it with: "
        "cd web && npm install && npm run production && "
        "cp -r web/dist/production/* ../latentscope/web/dist/ "
        "(no restart needed afterwards)."
    )


def serve(host="0.0.0.0", port=5001, debug=False, data_dir=None, read_only=None):
    """Create the app and start a server.

    Uses waitress (production WSGI server) when it is installed and debug mode
    is off; otherwise falls back to the Flask development server.  Set
    ``LATENT_SCOPE_DEBUG=1`` to force the development server.
    """
    application = create_app(data_dir=data_dir, read_only=read_only)
    warning = missing_dist_warning()
    if warning:
        print(warning, flush=True)
    if _parse_bool_env(os.getenv("LATENT_SCOPE_DEBUG")):
        debug = True
    if not debug:
        try:
            from waitress import serve as waitress_serve
        except ImportError:
            waitress_serve = None
        if waitress_serve is not None:
            application.logger.info("Serving with waitress on %s:%s", host, port)
            waitress_serve(application, listen=f"{host}:{port}", threads=8)
            return
        application.logger.warning(
            "waitress not installed (pip install waitress); "
            "falling back to the Flask development server"
        )
    application.run(host=host, port=port, debug=debug)
