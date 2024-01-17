import os
import json
import uuid
import subprocess
import threading
from datetime import datetime
from flask import Blueprint, jsonify, request

# Create a Blueprint
scripts_bp = Blueprint('scripts_bp', __name__)


def run_job(dataset, job_id, command):
    if not os.path.exists(f"../data/{dataset}/jobs"):
      os.makedirs(f"../data/{dataset}/jobs")

    progress_file = f"../data/{dataset}/jobs/{job_id}.json"
    job = {
        "command": command, 
        "status": "running", 
        "last_update": str(datetime.now()), 
        "progress": [], 
        "times": []
    }

    with open(progress_file, 'w') as f:
        json.dump(job, f)

    # TODO: need to watch for exploits in command if using shell=True for security reasons
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, shell=True)

    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
            job["progress"].append(output.strip())
            job["times"].append(str(datetime.now()))
            job["last_update"] = str(datetime.now())
            with open(progress_file, 'w') as f:
                json.dump(job, f)

    # Mark job as complete
    job["status"] = "completed"
    with open(progress_file, 'w') as f:
        json.dump(job, f)

@scripts_bp.route('/job')
def get_job():
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    progress_file = f"../data/{dataset}/jobs/{job_id}.json"
    if os.path.exists(progress_file):
        with open(progress_file, 'r') as f:
            job = json.load(f)
        return jsonify(job)
    else:
        return jsonify({'status': 'not found'}), 404


@scripts_bp.route('/embed')
def run_embed():
    dataset = request.args.get('dataset')
    text_column = request.args.get('text_column')
    mode = request.args.get('mode')
    model = request.args.get('model')

    job_id = str(uuid.uuid4())
    if mode == "local":
        command = f'python ../scripts/embed-local.py {dataset} {text_column} {model}'
    elif mode == "openai":
        command = "echo 'openai not implemented yet'"
    elif mode == "togetherai":
        command = "echo 'togetherai not implemented yet'"
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@scripts_bp.route('/umap')
def run_umap():
    dataset = request.args.get('dataset')
    embeddings = request.args.get('embeddings')
    neighbors = request.args.get('neighbors')
    min_dist = request.args.get('min_dist')
    print("run umap", dataset, embeddings, neighbors, min_dist)

    job_id = str(uuid.uuid4())
    command = f'python ../scripts/umapper.py {dataset} {embeddings} {neighbors} {min_dist}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@scripts_bp.route('/delete/umap')
def delete_umap():
    dataset = request.args.get('dataset')
    umap_name = request.args.get('umap_name')

    # Get a list of all the clusters that have umap_name in their .json so we can delete them too
    cluster_dir = f'../data/{dataset}/clusters'
    clusters_to_delete = []
    for file in os.listdir(cluster_dir):
        if file.endswith(".json"):
            with open(os.path.join(cluster_dir, file), 'r') as f:
                cluster_data = json.load(f)
            if cluster_data.get('umap_name') == umap_name:
                clusters_to_delete.append(file.replace('.json', ''))
    

    job_id = str(uuid.uuid4())
    command = f'rm ../data/{dataset}/umaps/{umap_name}.parquet; rm ../data/{dataset}/umaps/{umap_name}.json; rm ../data/{dataset}/umaps/{umap_name}.png'
    # Create the rm commands from the clusters_to_delete list
    for cluster in clusters_to_delete:
        command += f'; rm ../data/{dataset}/clusters/{cluster}.parquet; rm ../data/{dataset}/clusters/{cluster}.json; rm ../data/{dataset}/clusters/{cluster}.png'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@scripts_bp.route('/cluster')
def run_cluster():
    dataset = request.args.get('dataset')
    umap_name = request.args.get('umap_name')
    samples = request.args.get('samples')
    min_samples = request.args.get('min_samples')
    print("run cluster", dataset, umap_name, samples, min_samples)

    job_id = str(uuid.uuid4())
    command = f'python ../scripts/cluster.py {dataset} {umap_name} {samples} {min_samples}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@scripts_bp.route('/delete/cluster')
def delete_cluster():
    dataset = request.args.get('dataset')
    cluster_name = request.args.get('cluster_name')
    job_id = str(uuid.uuid4())
    command = f'rm ../data/{dataset}/clusters/{cluster_name}.parquet; rm ../data/{dataset}/clusters/{cluster_name}.json; rm ../data/{dataset}/clusters/{cluster_name}.png'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@scripts_bp.route('/slides')
def run_slides():
    dataset = request.args.get('dataset')
    cluster_name = request.args.get('cluster_name')
    job_id = str(uuid.uuid4())
    command = f'python ../scripts/slides.py {dataset} {cluster_name}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})
