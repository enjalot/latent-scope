import os
import time
import json
import uuid
import subprocess
import threading
from datetime import datetime
from flask import Blueprint, jsonify, request

# Create a Blueprint
jobs_bp = Blueprint('jobs_bp', __name__)
jobs_write_bp = Blueprint('jobs_write_bp', __name__)
DATA_DIR = os.getenv('LATENT_SCOPE_DATA')

TIMEOUT = 60 * 5 # 5 minute timeout TODO: make this a config option

PROCESSES = {}

def run_job(dataset, job_id, command):
    job_dir = os.path.join(DATA_DIR, dataset, "jobs")
    if not os.path.exists(job_dir):
      os.makedirs(job_dir)

    progress_file = os.path.join(job_dir, f"{job_id}.json")
    print("command", command)
    job_name = command.split(" ")[0]
    if "ls-" in job_name:
        job_name = job_name.replace("ls-", "")
    job = {
        "id": job_id,
        "dataset": dataset,
        "job_name": job_name,
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
    PROCESSES[job_id] = process

    last_output_time = time.time()  # Initialize with the current time

    while True:
        output = process.stdout.readline()
        current_time = time.time()  # Update current time on each iteration
        print(current_time, current_time - last_output_time, TIMEOUT)
        print("output", output)

        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
            if("RUNNING:" in output):
                run_id = output.strip().split("RUNNING: ")[1]
                print("found the id", run_id)
                job["run_id"] = run_id
            job["progress"].append(output.strip())
            job["times"].append(str(datetime.now()))
            job["last_update"] = str(datetime.now())
            with open(progress_file, 'w') as f:
                json.dump(job, f)
            last_output_time = current_time
        elif current_time - last_output_time > TIMEOUT:
            print(f"Timeout: No output for more than {TIMEOUT} seconds.")
            print("OUTPUT", output)
            job["progress"].append(output.strip())
            job["progress"].append(f"Timeout: No output for more than {TIMEOUT} seconds.")
            job["status"] = "error"
            break  # Break the loop

    if process.returncode != 0:
        job["status"] = "error"
    else:
        job["status"] = "completed"
    # job["status"] = "completed"

    with open(progress_file, 'w') as f:
        json.dump(job, f)

@jobs_bp.route('/job')
def get_job():
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    progress_file = os.path.join(DATA_DIR, dataset, "jobs", f"{job_id}.json")
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                job = json.load(f)
        except:
            time.sleep(0.1)
            with open(progress_file, 'r') as f:
                job = json.load(f)
        return jsonify(job)
    else:
        return jsonify({'status': 'not found'}), 404

@jobs_bp.route('/all')
def get_jobs():
    dataset = request.args.get('dataset')
    job_dir = os.path.join(DATA_DIR, dataset, "jobs")
    jobs = []
    if os.path.exists(job_dir):
        for file in os.listdir(job_dir):
            if file.endswith(".json"):
                with open(os.path.join(job_dir, file), 'r') as f:
                    job = json.load(f)
                jobs.append(job)
    return jsonify(jobs)

@jobs_write_bp.route('/ingest', methods=['POST'])
def run_ingest():
    dataset = request.form.get('dataset')
    file = request.files.get('file')
    text_column = request.form.get('text_column')
    dataset_dir = os.path.join(DATA_DIR, dataset)
    if not os.path.exists(dataset_dir):
        os.makedirs(dataset_dir)
    file_path = os.path.join(dataset_dir, file.filename)
    file.save(file_path)

    job_id = str(uuid.uuid4())
    command = f'ls-ingest "{dataset}" --path="{file_path}"'
    if text_column:
        command += f' --text_column="{text_column}"'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/reingest', methods=['GET'])
def run_reingest():
    dataset = request.args.get('dataset')
    text_column = request.args.get('text_column')
    dataset_dir = os.path.join(DATA_DIR, dataset)
    file_path = os.path.join(dataset_dir, "input.parquet")

    job_id = str(uuid.uuid4())
    command = f'ls-ingest "{dataset}" --path="{file_path}"'
    if text_column:
        command += f' --text_column="{text_column}"'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})



@jobs_write_bp.route('/embed')
def run_embed():
    dataset = request.args.get('dataset')
    text_column = request.args.get('text_column')
    model_id = request.args.get('model_id') # model id
    prefix = request.args.get('prefix')
    dimensions = request.args.get('dimensions')
    batch_size = request.args.get('batch_size')

    job_id = str(uuid.uuid4())
    command = f'ls-embed "{dataset}" "{text_column}" "{model_id}" --prefix="{prefix}" --batch_size={batch_size}'
    if dimensions is not None:
        command += f" --dimensions={dimensions}"
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/embed_truncate')
def run_embed_truncate():
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id') # model id
    dimensions = request.args.get('dimensions')

    job_id = str(uuid.uuid4())
    command = f'ls-embed-truncate "{dataset}" "{embedding_id}" {dimensions}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/embed_importer')
def run_embed_importer():
    dataset = request.args.get('dataset')
    model_id = request.args.get('model_id')
    embedding_column = request.args.get('embedding_column')
    text_column = request.args.get('text_column')

    job_id = str(uuid.uuid4())
    command = f'ls-embed-importer "{dataset}" "{embedding_column}" "{model_id}" "{text_column}"'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/rerun')
def rerun_job():
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    # read the job file to get the command
    progress_file = os.path.join(DATA_DIR, dataset, "jobs", f"{job_id}.json")
    with open(progress_file, 'r') as f:
        job = json.load(f)
    command = job.get('command')
    command += f' --rerun {job.get("run_id")}'
    new_job_id = str(uuid.uuid4())
    print("new job id", new_job_id)
    threading.Thread(target=run_job, args=(dataset, new_job_id, command)).start()
    return jsonify({"job_id": new_job_id})

@jobs_write_bp.route('/kill')
def kill_job():
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    # load the job file
    progress_file = os.path.join(DATA_DIR, dataset, "jobs", f"{job_id}.json")
    job = json.load(open(progress_file, 'r'))
    if job_id in PROCESSES:
        PROCESSES[job_id].kill()
        job["status"] = "dead"
        job["cause_of_death"] = "killed"
        with open(progress_file, 'w') as f:
            json.dump(job, f)
        return jsonify(job)
    else:
        job["status"] = "dead"
        job["cause_of_death"] = "process not found, presumed dead"
        with open(progress_file, 'w') as f:
            json.dump(job, f)
        return jsonify(job)

@jobs_write_bp.route('/delete/embedding')
def delete_embedding():
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')

    # Get a list of all the umaps that have embedding_id in their .json so we can delete them too
    umap_dir = os.path.join(DATA_DIR, dataset, 'umaps')
    umaps_to_delete = []
    for file in os.listdir(umap_dir):
        if file.endswith(".json"):
            with open(os.path.join(umap_dir, file), 'r') as f:
                umap_data = json.load(f)
            if umap_data.get('embedding_id') == embedding_id:
                umaps_to_delete.append(file.replace('.json', ''))
    

    job_id = str(uuid.uuid4())
    path = os.path.join(DATA_DIR, dataset, "embeddings", f"{embedding_id}*").replace(" ", "\\ ")
    command = f'rm -rf {path}'
    for umap in umaps_to_delete:
        delete_umap(dataset, umap)
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/umap')
def run_umap():
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    neighbors = request.args.get('neighbors')
    min_dist = request.args.get('min_dist')
    init = request.args.get('init')
    align = request.args.get('align')
    print("run umap", dataset, embedding_id, neighbors, min_dist, init, align)

    job_id = str(uuid.uuid4())
    command = f'ls-umap "{dataset}" "{embedding_id}" {neighbors} {min_dist}'
    if init:
        command += f' --init={init}'
    if align:
        command += f' --align={align}'

    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/delete/umap')
def delete_umap_request():
    dataset = request.args.get('dataset')
    umap_id = request.args.get('umap_id')
    return delete_umap(dataset, umap_id)

def delete_umap(dataset, umap_id):
    # Get a list of all the clusters that have umap_name in their .json so we can delete them too
    cluster_dir = os.path.join(DATA_DIR, dataset, 'clusters')
    clusters_to_delete = []
    for file in os.listdir(cluster_dir):
        if file.endswith(".json"):
            with open(os.path.join(cluster_dir, file), 'r') as f:
                cluster_data = json.load(f)
            if cluster_data.get('umap_id') == umap_id:
                clusters_to_delete.append(file.replace('.json', ''))
    

    job_id = str(uuid.uuid4())
    path = os.path.join(DATA_DIR, dataset, "umaps", f"{umap_id}*").replace(" ", "\\ ")
    command = f'rm -rf {path}'
    # Create the rm -rf commands from the clusters_to_delete list
    for cluster in clusters_to_delete:
        cpath = os.path.join(DATA_DIR, dataset, "clusters", f"{cluster}*").replace(" ", "\\ ")
        command += f'; rm -rf {cpath}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/cluster')
def run_cluster():
    dataset = request.args.get('dataset')
    umap_id = request.args.get('umap_id')
    samples = request.args.get('samples')
    min_samples = request.args.get('min_samples')
    cluster_selection_epsilon = request.args.get('cluster_selection_epsilon')
    print("run cluster", dataset, umap_id, samples, min_samples, cluster_selection_epsilon)

    job_id = str(uuid.uuid4())
    command = f'ls-cluster "{dataset}" "{umap_id}" {samples} {min_samples} {cluster_selection_epsilon}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/delete/cluster')
def delete_cluster():
    dataset = request.args.get('dataset')
    cluster_id = request.args.get('cluster_id')
    job_id = str(uuid.uuid4())
    path = os.path.join(DATA_DIR, dataset, "clusters", f"{cluster_id}*").replace(" ", "\\ ")
    command = f'rm -rf {path}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/cluster_label')
def run_cluster_label():
    dataset = request.args.get('dataset')
    chat_id = request.args.get('chat_id')
    text_column = request.args.get('text_column')
    cluster_id = request.args.get('cluster_id')
    context = request.args.get('context')
    print("run cluster label", dataset, chat_id, text_column, cluster_id)
    print("context", context)

    job_id = str(uuid.uuid4())
    command = f'ls-label "{dataset}" "{text_column}" "{cluster_id}" "{chat_id}" "{context}"'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/scope')
def run_scope():
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    umap_id = request.args.get('umap_id')
    cluster_id = request.args.get('cluster_id')
    cluster_labels_id = request.args.get('cluster_labels_id')
    label = request.args.get('label')
    description = request.args.get('description')
    scope_id = request.args.get('scope_id')
    print("run scope", dataset, embedding_id, umap_id, cluster_id, cluster_labels_id, label, description, scope_id)

    job_id = str(uuid.uuid4())
    command = f'ls-scope "{dataset}" "{embedding_id}" "{umap_id}" "{cluster_id}" "{cluster_labels_id}" "{label}" "{description}"'
    if scope_id:
        command += f' --scope_id={scope_id}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/delete/scope')
def delete_scope():
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')

    job_id = str(uuid.uuid4())
    path = os.path.join(DATA_DIR, dataset, "scopes", f"{scope_id}*").replace(" ", "\\ ")
    command = f'rm -rf {path}'
    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

@jobs_write_bp.route('/plot')
def run_plot():
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')
    config = request.args.get('config')
    print("run plot", dataset, scope_id, config)

    job_id = str(uuid.uuid4())
    command = f'ls-export-plot "{dataset}" {scope_id}'
    escaped_config = json.dumps(config)#.replace('"', '\\"')
    command += f' --plot_config={escaped_config}'
    print("command", command)

    threading.Thread(target=run_job, args=(dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})

