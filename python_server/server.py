import os
import sys
import json
import torch
import numpy as np
import pandas as pd
from transformers import AutoTokenizer, AutoModel

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)

CORS(app)

datasets = {}
dataframes = {}

"""
Returns nearest neighbors for a given query string
Hard coded to 150 results currently
"""
@app.route('/nn', methods=['GET'])
def nn():
    dataset = request.args.get('dataset')
    num = 150
    if dataset not in datasets:
        # load the dataset embeddings
        meta = json.load(open(os.path.join("../data", dataset, "embeddings.json")))
        print("meta", meta)
        embeddings = np.load(os.path.join("../data", dataset, "embeddings.npy"))
        print("embeddings", embeddings.shape)
        print("loading model")
        # Load model from HuggingFace Hub
        tokenizer = AutoTokenizer.from_pretrained(meta["model"])
        model = AutoModel.from_pretrained(meta["model"])
        model.eval()
        # find nearest neighbors
        print("fitting embeddings")
        from sklearn.neighbors import NearestNeighbors
        nne = NearestNeighbors(n_neighbors=num, metric="cosine")
        nne.fit(embeddings)
        datasets[dataset] = { "embeddings": embeddings, "model": model, "tokenizer": tokenizer, "nne": nne }
    else:
        embeddings = datasets[dataset]["embeddings"]
        model = datasets[dataset]["model"]
        tokenizer = datasets[dataset]["tokenizer"]
        nne = datasets[dataset]["nne"]
    
    # embed the query string and find the nearest neighbor
    query = request.args.get('query')
    print("query", query)
    encoded_input = tokenizer([query], padding=True, truncation=True, return_tensors='pt')
    # Compute token embeddings
    with torch.no_grad():
        model_output = model(**encoded_input)
        # Perform pooling. In this case, cls pooling.
        sentence_embeddings = model_output[0][:, 0]
        # Normalize embeddings
        sentence_embeddings = torch.nn.functional.normalize(sentence_embeddings, p=2, dim=1)

    embedding = sentence_embeddings.numpy()[0]
    print("embedding", embedding.shape)

    distances, indices = nne.kneighbors([embedding])
    print("distances", distances)
        
    return jsonify(indices=indices[0].tolist(), distances=distances[0].tolist())

"""
Given a list of indices (passed as a json array), return the rows from the dataset
"""
@app.route('/indexed', methods=['GET'])
def indexed():
    dataset = request.args.get('dataset')
    indices = json.loads(request.args.get('indices'))
    if dataset not in dataframes:
        df = pd.read_parquet(os.path.join("../data", dataset, "input.parquet"))
        dataframes[dataset] = df
    else:
        df = dataframes[dataset]
    
    # get the indexed rows
    rows = df.iloc[indices]
    # send back the rows as json
    return rows.to_json(orient="records")

tagsets = {}

"""
Return the tagsets for a given dataset
This is a JSON object with the tag name as the key and an array of indices as the value
"""
@app.route("/tags", methods=['GET'])
def tags():
    dataset = request.args.get('dataset')
    if dataset not in tagsets:
        tagsets[dataset] = {}
    # search the dataset directory for all files ending in .indices
    tags = []
    for f in os.listdir(os.path.join("../data", dataset)):
        if f.endswith(".indices"):
            tag = f.split(".")[0]
            indices = np.loadtxt(os.path.join("../data", dataset, tag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][tag] = indices

    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Create a new tag for a given dataset
"""
@app.route("/tags/new", methods=['GET'])
def new_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    if dataset not in tagsets:
        tagsets[dataset] = {}
    # search the dataset directory for all files ending in .indices
    tags = []
    for f in os.listdir(os.path.join("../data", dataset)):
        if f.endswith(".indices"):
            dtag = f.split(".")[0]
            indices = np.loadtxt(os.path.join("../data", dataset, dtag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][dtag] = indices

    if tag not in tagsets[dataset]:
        tagsets[dataset][tag] = []
        # create an empty file
        filename = os.path.join("../data", dataset, tag + ".indices")
        with open(filename, 'w') as f:
            f.write("")
            f.close()


    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Add a data index to a tag
"""
@app.route("/tags/add", methods=['GET'])
def add_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    index = request.args.get('index')
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        # read a tag file, which is just a csv with a single column into an array of integers
        indices = np.loadtxt(os.path.join("../data", dataset, tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]

    if not indices:
        indices = []
    if index not in indices:
        indices.append(int(index))
        ts[tag] = indices
        # save the indices to a file
        np.savetxt(os.path.join("../data", dataset, tag + ".indices"), indices, fmt='%d')
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Remove a data index from a tag
"""
@app.route("/tags/remove", methods=['GET'])
def remove_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    index = request.args.get('index')
    if dataset not in tagsets:
        tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        # read a tag file, which is just a csv with a single column into an array of integers
        indices = np.loadtxt(os.path.join("../data", dataset, tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]
    if index in indices:
        indices = indices.remove(int(index))
        ts[tag] = indices
        # save the indices to a file
        np.savetxt(os.path.join("../data", dataset, tag + ".indices"), indices, fmt='%d')
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Return the data rows for a given tag
"""
@app.route("/tags/rows", methods=['GET'])
def tag_rows():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')

    if dataset not in tagsets:
        tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        # read a tag file, which is just a csv with a single column into an array of integers
        indices = np.loadtxt(os.path.join("../data", dataset, tag + ".indices"), dtype=int).tolist()
        ts[tag] = indices
    else:
        indices = ts[tag]
    if dataset not in dataframes:
        df = pd.read_parquet(os.path.join("../data", dataset, "input.parquet"))
        dataframes[dataset] = df
    else:
        df = dataframes[dataset]
    
    # get the indexed rows
    rows = df.iloc[indices]
    # send back the rows as json
    return rows.to_json(orient="records")


# set port
port = int(os.environ.get('PORT', 5001))
print("running app", port)
app.run(host="0.0.0.0", port=port)