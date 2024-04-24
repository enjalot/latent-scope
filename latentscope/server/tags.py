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
Add data indices to a tag
"""
@tags_write_bp.route("/add", methods=['POST'])
def add_tags():
    data = request.get_json()
    dataset = data.get('dataset')
    tag = data.get('tag')
    new_indices = data.get('indices')
    # print("DATASET", dataset)
    # print("tag", tag)
    # print("indices", new_indices)

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

    # new_indices_list = [int(idx) for idx in new_indices.split(',')]
    new_indices_list = [int(idx) for idx in new_indices]
    for idx in new_indices_list:
        if idx not in indices:
            indices.append(idx)
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
    index = int(request.args.get('index'))
    # print("dataset", dataset)
    # print("tag", tag)
    # print("index", index)
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
    print("indices", indices)
    if index in indices:
        print("Removing", index)
        indices.remove(index)
        print("removed", indices)
        ts[tag] = indices
        # save the indices to a file
        np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    print("returning", tagsets[dataset])
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])


"""
Add data indices to a tag
"""
@tags_write_bp.route("/remove", methods=['POST'])
def remove_tags():
    data = request.get_json()
    dataset = data.get('dataset')
    tag = data.get('tag')
    remove_indices = data.get('indices')
    print("dataset", dataset)
    print("tag", tag)
    print("indices", remove_indices)

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

    # new_indices_list = [int(idx) for idx in new_indices.split(',')]
    new_indices_list = [int(idx) for idx in remove_indices]
    for idx in new_indices_list:
        if idx in indices:
            indices.remove(idx)
    ts[tag] = indices
    # save the indices to a file
    np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    # return an object with the tags for a given dataset
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/delete", methods=['GET'])
def delete_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag in ts:
        del ts[tag]
    try:
        os.remove(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"))
    except FileNotFoundError:
        pass
    return jsonify(tagsets[dataset])

