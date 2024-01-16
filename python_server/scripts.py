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
    job = {"command": " ".join(command), "status": "running", "last_update": str(datetime.now()), "progress": [], "times": []}

    with open(progress_file, 'w') as f:
        f.write(json.dumps(job))

    process = subprocess.Popen(command, stdout=subprocess.PIPE, text=True)
    for line in iter(process.stdout.readline, ''):
        # Update progress in JSON file
        if line.strip() != "":
            print(line.strip())
            job["progress"].append(line.strip())
            job["times"].append(str(datetime.now()))
            job["last_update"] = str(datetime.now())
            with open(progress_file, 'w') as f:
                f.write(json.dumps(job))

    # Mark job as complete
    job["status"] = "completed"
    with open(progress_file, 'w') as f:
        f.write(json.dumps(job))

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

@scripts_bp.route('/umap')
def run_umap():
    dataset = request.args.get('dataset')
    embeddings = request.args.get('embeddings')
    neighbors = request.args.get('neighbors')
    min_dist = request.args.get('min_dist')
    print("run umap", dataset, embeddings, neighbors, min_dist)

    job_id = str(uuid.uuid4())
    command = f'python ../scripts/umapper.py {dataset} {embeddings} {neighbors} {min_dist}'
    threading.Thread(target=run_job, args=(dataset, job_id, command.split())).start()
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
    threading.Thread(target=run_job, args=(dataset, job_id, command.split())).start()
    return jsonify({"job_id": job_id})
