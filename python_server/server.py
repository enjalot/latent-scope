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

@app.route('/nn', methods=['GET'])
def nn():
    dataset = request.args.get('dataset')
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
        nne = NearestNeighbors(n_neighbors=50, metric="cosine")
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

@app.route('/indexed', methods=['GET'])
def indexed():
    dataset = request.args.get('dataset')
    indices = json.loads(request.args.get('indices'))
    print("indices", indices)
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