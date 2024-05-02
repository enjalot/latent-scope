import os
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime
from scipy.spatial import ConvexHull
from flask import Blueprint, jsonify, request

# Create a Blueprint
bulk_bp = Blueprint('bulk_bp', __name__)
bulk_write_bp = Blueprint('bulk_write_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

def write_transaction(dataset_id, scope_id, action, payload):
    transactions_file_path = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + "-transactions.json")
    if not os.path.exists(transactions_file_path):
        with open(transactions_file_path, 'w') as f:
            json.dump([], f)
    with open(transactions_file_path, 'r') as f:
        transactions = json.load(f)
    new_transaction = {
        "action": action,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "payload": payload
    }
    transactions.append(new_transaction)
    with open(transactions_file_path, 'w') as f:
        json.dump(transactions, f, indent=2)

# Change the cluster of rows
@bulk_write_bp.route('/change-cluster', methods=['POST'])
def change_cluster():
  data = request.get_json()
  print(data)
  dataset_id = data["dataset_id"]
  scope_id = data["scope_id"]
  row_ids = data["row_ids"]
  new_cluster = int(data["new_cluster"])

  # read in the scope parquet
  scope_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".parquet")
  df = pd.read_parquet(scope_file)

  # read the scope metadata for the cluster_label_map
  scope_meta_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".json")
  with open(scope_meta_file) as f:
    scope_meta = json.load(f)


  clusters = scope_meta["cluster_labels_lookup"]
  new_label = clusters[new_cluster]
  # change the cluster of the rows
  df.loc[df['ls_index'].isin(row_ids), "cluster"] = new_cluster
  df.loc[df['ls_index'].isin(row_ids), "label"] = new_label["label"]

  # write the parquet
  df.to_parquet(scope_file)
  update_combined(df, dataset_id, scope_id)

  # recalculate the hulls
  for c in clusters:
      indices = df[df['cluster'] == c["cluster"]]["ls_index"].tolist()
      label_points = df[df['cluster'] == c["cluster"]][['x', 'y']].values
      if(len(label_points) > 0):
        hull = ConvexHull(label_points)
        hull_list = [indices[s] for s in hull.vertices.tolist()]
        c["hull"] = hull_list
      else:
        c["hull"] = []

  #write the scope meta to file
  with open(scope_meta_file, "w") as f:
    json.dump(scope_meta, f, indent=2)

  write_transaction(dataset_id, scope_id, "change_cluster", {
    "row_ids": row_ids,
    "new_cluster": new_cluster
  })

  return jsonify({"success": True})

# change cluster name
# Change the cluster of rows
@bulk_write_bp.route('/change-cluster-name', methods=['GET'])
def change_cluster_name():
  dataset_id = request.args["dataset_id"]
  scope_id = request.args["scope_id"]
  cluster = int(request.args["cluster"])
  new_label = request.args["new_label"]

  # read in the scope parquet
  scope_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".parquet")
  df = pd.read_parquet(scope_file)

  # read the scope metadata for the cluster_label_map
  scope_meta_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".json")
  with open(scope_meta_file) as f:
    scope_meta = json.load(f)

  clusters = scope_meta["cluster_labels_lookup"]
  updated = clusters[cluster]
  updated["label"] = new_label

  # update the label column in the parquet
  df[df['cluster'] == cluster]['label'] = new_label
  df.to_parquet(scope_file)

  update_combined(df, dataset_id, scope_id)

  #write the scope meta to file
  with open(scope_meta_file, "w") as f:
    json.dump(scope_meta, f, indent=2)

  write_transaction(dataset_id, scope_id, "change_cluster_name", {
    "cluster": cluster,
    "new_label": new_label
  })
  return jsonify({"success": True})


# Delete rows
@bulk_write_bp.route('/delete-rows', methods=['POST'])
def delete_rows():
  data = request.get_json()
  print(data)
  dataset_id = data["dataset_id"]
  scope_id = data["scope_id"]
  row_ids = data["row_ids"]
  # read in the scope parquet
  scope_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".parquet")
  df = pd.read_parquet(scope_file)
  df = df[~df['ls_index'].isin(row_ids)]
  df.reset_index(drop=True, inplace=True)

  df.to_parquet(scope_file)

  update_combined(df, dataset_id, scope_id)

  # recalculate hulls
  scope_meta_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".json")
  with open(scope_meta_file) as f:
    scope_meta = json.load(f)
  clusters = scope_meta["cluster_labels_lookup"]
  for c in clusters:
    indices = df[df['cluster'] == c["cluster"]]["ls_index"].tolist()
    label_points = df[df['cluster'] == c["cluster"]][['x', 'y']].values
    try:
      hull = ConvexHull(label_points)
      hull_list = [indices[s] for s in hull.vertices.tolist()]
      c["hull"] = hull_list
    except:
      c["hull"] = []

  scope_meta["rows"] = len(df)
  # write the scope meta to file
  with open(scope_meta_file, "w") as f:
    json.dump(scope_meta, f, indent=2)

  write_transaction(dataset_id, scope_id, "delete_rows", {
    "row_ids": row_ids
  })
  return jsonify({"success": True})

def update_combined(df, dataset_id, scope_id):
  input_df = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "input.parquet"))
  input_df.reset_index(inplace=True)
  input_df = input_df[input_df['index'].isin(df['ls_index'])]
  combined_df = input_df.join(df.set_index('ls_index'), on='index', rsuffix='_ls')
  combined_df.to_parquet(os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + "-input.parquet"))
