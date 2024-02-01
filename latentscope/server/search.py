import os
import json
import numpy as np
from flask import Blueprint, jsonify, request

from latentscope.models import get_embedding_model

# Create a Blueprint
search_bp = Blueprint('search_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

# in memory cache of dataset metadata, embeddings, models and tokenizers
DATASETS = {}
EMBEDDINGS = {}

"""
Returns nearest neighbors for a given query string
Hard coded to 150 results currently
"""
@search_bp.route('/nn', methods=['GET'])
def nn():
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')

    num = 150
    if embedding_id not in EMBEDDINGS:
        print("loading model", embedding_id)
        with open(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".json"), 'r') as f:
            metadata = json.load(f)
        model_id = metadata.get('model_id')
        print("Model ID:", model_id)
        model = get_embedding_model(model_id)
        model.load_model()
        EMBEDDINGS[embedding_id] = model
    else:
        model = EMBEDDINGS[embedding_id]

    if dataset not in DATASETS or embedding_id not in DATASETS[dataset]:
        # load the dataset embeddings
        embeddings = np.load(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".npy"))
        print("fitting embeddings")
        from sklearn.neighbors import NearestNeighbors
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        if dataset not in DATASETS:
          DATASETS[dataset] = {}
        DATASETS[dataset][embedding_id] = nne
    else:
        nne = DATASETS[dataset][embedding_id]
    
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