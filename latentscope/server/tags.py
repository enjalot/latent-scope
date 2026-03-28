import os
from flask import Blueprint, current_app, jsonify, request

# Create a Blueprint
tags_bp = Blueprint('tags_bp', __name__)
tags_write_bp = Blueprint('tags_write_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


# ===========================================================
# Tags
# ===========================================================

# cache of list of indices per tag per dataset
tagsets = {}


@tags_bp.route("/", methods=['GET'])
def tags():
    dataset = request.args.get('dataset')
    DATA_DIR = _data_dir()
    tagdir = os.path.join(DATA_DIR, dataset, "tags")
    if not os.path.exists(tagdir):
        os.makedirs(tagdir)
    if dataset not in tagsets:
        tagsets[dataset] = {}
    for f in os.listdir(tagdir):
        if f.endswith(".indices"):
            tag = f.split(".")[0]
            indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][tag] = indices
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/new", methods=['GET'])
def new_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        tagsets[dataset] = {}
    for f in os.listdir(os.path.join(DATA_DIR, dataset)):
        if f.endswith(".indices"):
            dtag = f.split(".")[0]
            indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", dtag + ".indices"), dtype=int).tolist()
            if type(indices) == int:
                indices = [indices]
            tagsets[dataset][dtag] = indices

    if tag not in tagsets[dataset]:
        tagsets[dataset][tag] = []
        filename = os.path.join(DATA_DIR, dataset, "tags", tag + ".indices")
        with open(filename, 'w') as f:
            f.write("")

    return jsonify(tagsets[dataset])


@tags_write_bp.route("/add", methods=['GET'])
def add_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    index = request.args.get('index')
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
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
        np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/add", methods=['POST'])
def add_tags():
    data = request.get_json()
    dataset = data.get('dataset')
    tag = data.get('tag')
    new_indices = data.get('indices')
    DATA_DIR = _data_dir()

    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]

    if not indices:
        indices = []

    new_indices_list = [int(idx) for idx in new_indices]
    for idx in new_indices_list:
        if idx not in indices:
            indices.append(idx)
    ts[tag] = indices
    np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/remove", methods=['GET'])
def remove_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    index = int(request.args.get('index'))
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]
    if index in indices:
        indices.remove(index)
        ts[tag] = indices
        np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/remove", methods=['POST'])
def remove_tags():
    data = request.get_json()
    dataset = data.get('dataset')
    tag = data.get('tag')
    remove_indices = data.get('indices')
    DATA_DIR = _data_dir()

    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = np.loadtxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), dtype=int).tolist()
        if type(indices) == int:
            indices = [indices]
        ts[tag] = indices
    else:
        indices = ts[tag]

    if not indices:
        indices = []

    new_indices_list = [int(idx) for idx in remove_indices]
    for idx in new_indices_list:
        if idx in indices:
            indices.remove(idx)
    ts[tag] = indices
    np.savetxt(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"), indices, fmt='%d')
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/delete", methods=['GET'])
def delete_tag():
    dataset = request.args.get('dataset')
    tag = request.args.get('tag')
    DATA_DIR = _data_dir()
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
