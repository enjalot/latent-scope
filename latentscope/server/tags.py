import os

import numpy as np
from flask import Blueprint, current_app, jsonify, request

from latentscope.server.job_utils import _safe_dataset

# Create a Blueprint
tags_bp = Blueprint('tags_bp', __name__)
tags_write_bp = Blueprint('tags_write_bp', __name__)


def _data_dir():
    return current_app.config['DATA_DIR']


def _load_indices_file(path):
    """Load a .indices file (newline-separated ints) as a list of ints."""
    indices = np.loadtxt(path, dtype=int).tolist()
    if isinstance(indices, int):
        indices = [indices]
    return indices


def load_tag_indices(data_dir, dataset):
    """Load all tags for a dataset as a dict of tag name -> list of indices.

    Returns an empty dict when the dataset has no tags directory.
    """
    tagdir = os.path.join(data_dir, dataset, "tags")
    tags = {}
    if not os.path.isdir(tagdir):
        return tags
    for f in sorted(os.listdir(tagdir)):
        if f.endswith(".indices"):
            tag = f.split(".")[0]
            tags[tag] = _load_indices_file(os.path.join(tagdir, f))
    return tags


# ===========================================================
# Tags
# ===========================================================

# cache of list of indices per tag per dataset
tagsets = {}


@tags_bp.route("/", methods=['GET'])
def tags():
    dataset = _safe_dataset(request.args.get('dataset'))
    DATA_DIR = _data_dir()
    tagdir = os.path.join(DATA_DIR, dataset, "tags")
    if not os.path.exists(tagdir):
        os.makedirs(tagdir)
    if dataset not in tagsets:
        tagsets[dataset] = {}
    tagsets[dataset].update(load_tag_indices(DATA_DIR, dataset))
    return jsonify(tagsets[dataset])


@tags_write_bp.route("/new", methods=['GET', 'POST'])
def new_tag():
    dataset = _safe_dataset(request.values.get('dataset'))
    tag = _safe_dataset(request.values.get('tag'), param='tag')
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        tagsets[dataset] = {}
    tagsets[dataset].update(load_tag_indices(DATA_DIR, dataset))

    if tag not in tagsets[dataset]:
        tagsets[dataset][tag] = []
        filename = os.path.join(DATA_DIR, dataset, "tags", tag + ".indices")
        with open(filename, 'w') as f:
            f.write("")

    return jsonify(tagsets[dataset])


@tags_write_bp.route("/add", methods=['GET'])
def add_tag():
    dataset = _safe_dataset(request.args.get('dataset'))
    tag = _safe_dataset(request.args.get('tag'), param='tag')
    index = request.args.get('index')
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = _load_indices_file(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"))
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
    dataset = _safe_dataset(data.get('dataset'))
    tag = _safe_dataset(data.get('tag'), param='tag')
    new_indices = data.get('indices')
    DATA_DIR = _data_dir()

    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = _load_indices_file(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"))
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
    dataset = _safe_dataset(request.args.get('dataset'))
    tag = _safe_dataset(request.args.get('tag'), param='tag')
    index = int(request.args.get('index'))
    DATA_DIR = _data_dir()
    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = _load_indices_file(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"))
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
    dataset = _safe_dataset(data.get('dataset'))
    tag = _safe_dataset(data.get('tag'), param='tag')
    remove_indices = data.get('indices')
    DATA_DIR = _data_dir()

    if dataset not in tagsets:
        ts = tagsets[dataset] = {}
    else:
        ts = tagsets[dataset]
    if tag not in ts:
        indices = _load_indices_file(os.path.join(DATA_DIR, dataset, "tags", tag + ".indices"))
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


@tags_write_bp.route("/delete", methods=['GET', 'POST'])
def delete_tag():
    dataset = _safe_dataset(request.values.get('dataset'))
    tag = _safe_dataset(request.values.get('tag'), param='tag')
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
