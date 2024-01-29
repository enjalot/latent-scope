import os
import sys
import numpy as np
from flask import Blueprint, jsonify, request

# TODO is this hacky way to import from the models directory?
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from latentscope.models import get_embedding_model

# Create a Blueprint
search_bp = Blueprint('search_bp', __name__)

# in memory cache of dataset metadata, embeddings, models and tokenizers
DATASETS = {}
MODELS = {}

"""
Returns nearest neighbors for a given query string
Hard coded to 150 results currently
"""
@search_bp.route('/nn', methods=['GET'])
def nn():
    dataset = request.args.get('dataset')
    model_id = request.args.get('model')

    num = 150
    if model_id not in MODELS:
        print("loading model", model_id)
        model = get_embedding_model(model_id)
        model.load_model()
        MODELS[model_id] = model
    else:
        model = MODELS[model_id]

    if dataset not in DATASETS or model_id not in DATASETS[dataset]:
        # load the dataset embeddings
        embeddings = np.load(os.path.join("../data", dataset, "embeddings", model_id + ".npy"))
        print("fitting embeddings")
        from sklearn.neighbors import NearestNeighbors
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        if dataset not in DATASETS:
          DATASETS[dataset] = {}
        DATASETS[dataset][model_id] = nne
    else:
        nne = DATASETS[dataset][model_id]
    
    # embed the query string and find the nearest neighbor
    query = request.args.get('query')
    print("query", query)
    embedding = model.embed([query])
    distances, indices = nne.kneighbors(embedding)
    print("distances", distances)
    # Filter distances and indices to only elements where distance is less than .4
    # filtered_indices = indices[0][distances[0] < 0.4]
    # filtered_distances = distances[0][distances[0] < 0.4]
    filtered_indices = indices[0]
    filtered_distances = distances[0]
    indices = filtered_indices
    distances = filtered_distances
        
    return jsonify(indices=indices.tolist(), distances=distances.tolist())