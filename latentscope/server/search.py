import os
import json
import h5py
import pandas as pd
import numpy as np
from flask import Blueprint, jsonify, request
from sklearn.neighbors import NearestNeighbors

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
    dimensions = request.args.get('dimensions')
    dimensions = int(dimensions) if dimensions else None
    print("dimensions", dimensions)

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
        # embeddings = np.load(os.path.join(DATA_DIR, dataset, "embeddings", embedding_id + ".npy"))
        embedding_path = os.path.join(DATA_DIR, dataset, "embeddings", f"{embedding_id}.h5")
        with h5py.File(embedding_path, 'r') as f:
            embeddings = np.array(f["embeddings"])
        print("fitting embeddings")
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
    embedding = model.embed([query], dimensions=dimensions)
    distances, indices = nne.kneighbors(embedding)
    # print("distances", distances)
    # Filter distances and indices to only elements where distance is less than .4
    # filtered_indices = indices[0][distances[0] < 0.4]
    # filtered_distances = distances[0][distances[0] < 0.4]
    filtered_indices = indices[0]
    filtered_distances = distances[0]
    indices = filtered_indices
    distances = filtered_distances
        
    return jsonify(indices=indices.tolist(), distances=distances.tolist())


@search_bp.route('/compare', methods=['GET'])
def compare():
    dataset = request.args.get('dataset')
    umap_left = request.args.get('umap_left')
    umap_right = request.args.get('umap_right')
    k = request.args.get('k')
    k = int(k) if k else 5

    umap_dir = os.path.join(DATA_DIR, dataset, "umaps")
    left_df = pd.read_parquet(os.path.join(umap_dir, f"{umap_left}.parquet"))
    left = left_df.to_numpy()
    right_df = pd.read_parquet(os.path.join(umap_dir, f"{umap_right}.parquet"))
    right = right_df.to_numpy()

    # Calculate the absolute displacement
    absolute_displacement = np.linalg.norm(right - left, axis=1)
    min_abs_displacement = np.min(absolute_displacement)
    max_abs_displacement = np.max(absolute_displacement)
    if max_abs_displacement - min_abs_displacement > 0:
        absolute_displacement = (absolute_displacement - min_abs_displacement) / (max_abs_displacement - min_abs_displacement)
    else:
        absolute_displacement = np.zeros_like(absolute_displacement)


    # Compute nearest neighbors in both projections
    # knn = NearestNeighbors(n_neighbors=k+1, metric="euclidean")  # +1 because the point itself is included
    # knn.fit(left)
    # distances1, indices1 = knn.kneighbors(left)

    # knn.fit(right)
    # distances2, indices2 = knn.kneighbors(right)

    # relative_displacement = np.abs(distances1 - distances2).mean(axis=1)
    # # Normalize relative_displacement
    # min_relative_displacement = np.min(relative_displacement)
    # max_relative_displacement = np.max(relative_displacement)
    # if max_relative_displacement - min_relative_displacement > 0:
    #     relative_displacement = (relative_displacement - min_relative_displacement) / (max_relative_displacement - min_relative_displacement)
    # else:
    #     relative_displacement = np.zeros_like(relative_displacement)

    
    # size = left.shape[0]
    # # Calculate displacement scores
    # displacement_scores = np.zeros(size)
    # for i in range(size):
    #     # Find the actual positions (0 to k-1) of common neighbors in each list
    #     neighbor_positions_1 = {index: pos for pos, index in enumerate(indices1[i]) if index in indices2[i]}
    #     neighbor_positions_2 = {index: pos for pos, index in enumerate(indices2[i]) if index in indices1[i]}
        
    #     # Calculate displacement for common neighbors
    #     displacements = []
    #     for index, pos1 in neighbor_positions_1.items():
    #         pos2 = neighbor_positions_2[index]
    #         displacement = abs(distances1[i, pos1] - distances2[i, pos2])
    #         displacements.append(displacement)
        
    #     # Compute the mean displacement for the point, if there are common neighbors
    #     if displacements:
    #         displacement_scores[i] = np.mean(displacements)

    # # normalize displacement_scores from 0 to 1
    # min_score = np.min(displacement_scores)
    # max_score = np.max(displacement_scores)
    # if max_score - min_score > 0:
    #     displacement_scores = (displacement_scores - min_score) / (max_score - min_score)
    # else:
    #     displacement_scores = np.zeros_like(displacement_scores)

    # TODO: why don't these actually add up to 1 even when i normalize each
    # combined_scores = 0.6 * absolute_displacement + 0.6 * relative_displacement + 0.6 * displacement_scores
    # combined_scores = (absolute_displacement + relative_displacement + displacement_scores) / 3
    combined_scores = absolute_displacement #(absolute_displacement + relative_displacement + displacement_scores) / 3
    return jsonify(combined_scores.tolist())
    # return jsonify(displacement_scores.tolist())


