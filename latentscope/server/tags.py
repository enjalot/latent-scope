import os
import sys
import numpy as np
from flask import Blueprint, jsonify, request

# Create a Blueprint
tags_bp = Blueprint('tags_bp', __name__)
tags_write_bp = Blueprint('tags_write_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

# ===========================================================
# Tags
# ===========================================================

# cache of list of indices per tag per dataset
tagsets = {}

"""
Return the tagsets for a given dataset
This is a JSON object with the tag name as the key and an array of indices as the value
"""
@tags_bp.route("/", methods=['GET'])
def tags():
    dataset = request.args.get('dataset')
    tagdir = os.path.join(DATA_DIR, dataset, "tags")
    if not os.path.exists(tagdir):
        os.makedirs(tagdir)
    if dataset not in tagsets:
        tagsets[dataset] = {}
    # search the dataset directory for all files ending in .indices
    for f in os.listdir(tagdir):
        if f.endswith(".indices"):
            tag = f.split(".")[0]
            indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][tag] = indices

    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Create a new tag for a given dataset
"""
@tags_write_bp.route("/new", methods=['GET'])
def new_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    if dataset not in tagsets:
        tagsets[dataset] = {}
    # search the dataset directory for all files ending in .indices
    tags = []
    for f in os.listdir(os.path.join(DATA_DIR, dataset)):
        if f.endswith(".indices"):
            dtag = f.split(".")[0]
            indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", dtag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][dtag] = indices

    if tag not in tagsets[dataset]:
        tagsets[dataset][tag] = []
        # create an empty file
        filename = os.path.join(DATA_DIR, dataset, "tags", tag + ".indices")
        with open(filename, 'w') as f:
            f.write("")
            f.close()


    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Add a data index to a tag
"""
@tags_write_bp.route("/add", methods=['GET'])
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
        indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
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
        np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])

"""
Remove a data index from a tag
"""
@tags_write_bp.route("/remove", methods=['GET'])
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
        indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]
    if index in indices:
        indices = indices.remove(int(index))
        ts[tag] = indices
        # save the indices to a file
        np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])
