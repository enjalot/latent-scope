import json
import logging
import math
import os
import sys
from importlib.resources import files

from dotenv import dotenv_values, set_key
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from latentscope.__version__ import __version__
from latentscope.util import get_data_dir, get_supported_api_keys


def _parse_bool_env(value):
    """Return True when value is a truthy string (1/true/yes/y/t)."""
    if value is None:
        return False
    return value.lower() in ('true', '1', 't', 'y', 'yes')


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

    # In-memory cache of DataFrames, keyed by dataset id
    app.config['DATAFRAMES'] = {}

    # ------------------------------------------------------------------
    # Blueprint registration
    # ------------------------------------------------------------------
    from .jobs import jobs_bp, jobs_write_bp
    app.register_blueprint(jobs_bp, url_prefix='/api/jobs')
    if not read_only:
        app.register_blueprint(jobs_write_bp, url_prefix='/api/jobs')

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
        import pandas as pd

        req = request.get_json()
        dataset = req['dataset']
        indices = req['indices']
        columns = req.get('columns')
        embedding_id = req.get('embedding_id')
        sae_id = req.get('sae_id')

        dataframes = app.config['DATAFRAMES']
        if dataset not in dataframes:
            df = pd.read_parquet(os.path.join(data_dir, dataset, "input.parquet"))
            dataframes[dataset] = df
        else:
            df = dataframes[dataset]

        if columns:
            df = df[columns]

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

        return rows.to_json(orient="records")

    @app.route('/api/column-filter', methods=['POST'])
    def column_filter():
        import pandas as pd

        req = request.get_json()
        dataset = req['dataset']
        filters = req['filters']

        dataframes = app.config['DATAFRAMES']
        if dataset not in dataframes:
            df = pd.read_parquet(os.path.join(data_dir, dataset, "input.parquet"))
            dataframes[dataset] = df
        else:
            df = dataframes[dataset]

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
        import pandas as pd

        per_page = 100
        req = request.get_json()
        dataset = req['dataset']
        page = req.get('page', 0)
        indices = req.get('indices', [])
        embedding_id = req.get('embedding_id')
        sae_id = req.get('sae_id')
        sort = req.get('sort')

        dataframes = app.config['DATAFRAMES']
        if dataset not in dataframes:
            df = pd.read_parquet(os.path.join(data_dir, dataset, "input.parquet"))
            dataframes[dataset] = df
        else:
            df = dataframes[dataset]

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

        rows_json = json.loads(rows[page * per_page:page * per_page + per_page].to_json(orient="records"))
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
        return send_from_directory(pth.parent, pth.name)

    return app


def serve(host="0.0.0.0", port=5001, debug=True, data_dir=None, read_only=None):
    """Create the app and start the development server."""
    application = create_app(data_dir=data_dir, read_only=read_only)
    application.run(host=host, port=port, debug=debug)
