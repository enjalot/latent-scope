import os
import re
import csv
import json
import uuid
from importlib.resources import files
from flask import Blueprint, jsonify, request

# Create a Blueprint
models_bp = Blueprint('models_bp', __name__)
models_write_bp = Blueprint('models_write_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

@models_bp.route('/embedding_models', methods=['GET'])
def get_embedding_models():
    embedding_path = files('latentscope.models').joinpath('embedding_models.json')
    with embedding_path.open('r', encoding='utf-8') as file:
        models = json.load(file)
    return jsonify(models)

@models_bp.route('/chat_models', methods=['GET'])
def get_chat_models():
    chat_path = files('latentscope.models').joinpath('chat_models.json')
    with chat_path.open('r', encoding='utf-8') as file:
        models = json.load(file)
    return jsonify(models)

@models_bp.route('/embedding_models/recent', methods=['GET'])
def get_recent_embedding_models():
    return get_recent_models("embedding")

@models_bp.route('/chat_models/recent', methods=['GET'])
def get_recent_chat_models():
    return get_recent_models("chat")

def get_recent_models(model_type="embedding"):
    recent_models_path = os.path.join(DATA_DIR, f"{model_type}_model_history.csv")
    if not os.path.exists(recent_models_path):
        return jsonify([])

    with open(recent_models_path, 'r', encoding='utf-8') as file:
        reader = csv.reader(file)
        recent_models = []
        for row in reader:
            recent_models.append({
                "timestamp": row[0],
                "id": row[1],
                "group": "recent",
                "provider": row[1].split("-")[0],
                "name": "-".join(row[1].split("-")[1:]).replace("___", "/")
            })
    recent_models.sort(key=lambda x: x["timestamp"], reverse=True)
    # Deduplicate models with the same id
    seen_ids = set()
    unique_recent_models = []
    for model in recent_models:
        if model["id"] not in seen_ids:
            unique_recent_models.append(model)
            seen_ids.add(model["id"])
    recent_models = unique_recent_models[:5]
    return jsonify(recent_models)

@models_bp.route('/custom-models', methods=['GET'])
def get_custom_models():
    custom_models_path = os.path.join(DATA_DIR, "custom_models.json")
    if not os.path.exists(custom_models_path):
        return jsonify([])
    with open(custom_models_path, 'r', encoding='utf-8') as file:
        custom_models = json.load(file)
    return jsonify(custom_models)

@models_write_bp.route('/custom-models', methods=['POST'])
def add_custom_model():
    data = request.json
    custom_models_path = os.path.join(DATA_DIR, "custom_models.json")
    
    # Read existing models
    existing_models = []
    if os.path.exists(custom_models_path):
        with open(custom_models_path, 'r', encoding='utf-8') as file:
            existing_models = json.load(file)
    
    # Add new model
    data["id"] = "custom-" + data["name"]
    existing_models.append(data)
    
    # Write updated models
    with open(custom_models_path, 'w', encoding='utf-8') as file:
        json.dump(existing_models, file)
        
    return jsonify(existing_models)

@models_write_bp.route('/custom-models/<model_id>', methods=['DELETE'])
def delete_custom_model(model_id):
    custom_models_path = os.path.join(DATA_DIR, "custom_models.json")
    if not os.path.exists(custom_models_path):
        return jsonify([])
    with open(custom_models_path, 'r', encoding='utf-8') as file:
        custom_models = json.load(file)
    custom_models = [model for model in custom_models if model["id"] != model_id]
    with open(custom_models_path, 'w', encoding='utf-8') as file:
        json.dump(custom_models, file)
    return jsonify(custom_models)