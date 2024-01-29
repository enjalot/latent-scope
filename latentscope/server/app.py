import re
import os
import json
import argparse
import pandas as pd
import pkg_resources
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from latentscope.util import update_data_dir

app = Flask(__name__)

CORS(app)

def serve():
    parser = argparse.ArgumentParser(description='Serve the Latent Scope API')
    parser.add_argument('data_dir', type=str, nargs='?', default=None, help='Path to the directory where data is stored')
    parser.add_argument('--host', type=str, default="0.0.0.0", help='Host to serve the server on')
    parser.add_argument('--port', type=int, default=5001, help='Port to run the server on')
    parser.add_argument('--debug', action='store_true', help='Run server in debug mode')
    args = parser.parse_args()

    DATA_DIR = update_data_dir(args.data_dir)
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    host = args.host
    port = args.port
    debug = args.debug

    # in memory cache of dataframes loaded for each dataset
    # used in returning rows for a given index (indexed, get_tags)
    DATAFRAMES = {}

    from .jobs import jobs_bp
    app.register_blueprint(jobs_bp, url_prefix='/api/jobs') 

    from .search import search_bp
    app.register_blueprint(search_bp, url_prefix='/api/search') 

    from .tags import tags_bp
    app.register_blueprint(tags_bp, url_prefix='/api/tags') 

    from .datasets import datasets_bp
    app.register_blueprint(datasets_bp, url_prefix='/api/datasets')


    # ===========================================================
    # File based routes for reading data and metadata from disk
    # ===========================================================
    @app.route('/api/embedding_models', methods=['GET'])
    def get_embedding_models():
        embedding_path = pkg_resources.resource_filename('latentscope.models', 'embedding_models.json')
        with open(embedding_path, 'r', encoding='utf-8') as file:
            models = json.load(file)
        return jsonify(models)

    @app.route('/api/chat_models', methods=['GET'])
    def get_chat_models():
        chat_path = pkg_resources.resource_filename('latentscope.models', 'chat_models.json')
        with open(chat_path, 'r', encoding='utf-8') as file:
            models = json.load(file)
        return jsonify(models)


    """
    Allow fetching of dataset files directly from disk
    """
    @app.route('/api/files/<path:datasetPath>', methods=['GET'])
    def send_file(datasetPath):
        print("req url", request.url)
        return send_from_directory(DATA_DIR, datasetPath)

    """
    Given a list of indices (passed as a json array), return the rows from the dataset
    """
    @app.route('/api/indexed', methods=['GET'])
    def indexed():
        dataset = request.args.get('dataset')
        indices = json.loads(request.args.get('indices'))
        if dataset not in DATAFRAMES:
            df = pd.read_parquet(os.path.join(DATA_DIR, dataset, "input.parquet"))
            DATAFRAMES[dataset] = df
        else:
            df = DATAFRAMES[dataset]
        
        # get the indexed rows
        rows = df.iloc[indices]
        # send back the rows as json
        return rows.to_json(orient="records")


    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        if path != "":
            pth = pkg_resources.resource_filename('latentscope', f"web/dist/{path}")
            directory = os.path.dirname(pth)
            return send_from_directory(directory, os.path.basename(pth))
        else:
            pth = pkg_resources.resource_filename('latentscope', "web/dist/index.html")
            directory = os.path.dirname(pth)
            return send_from_directory(directory, os.path.basename(pth))


    app.run(host=host, port=port, debug=debug)

if __name__ == "__main__":
    serve()