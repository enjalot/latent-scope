import os
import shutil
import time
import json
import uuid
import subprocess
import threading
from datetime import datetime
from flask import Blueprint, current_app, jsonify, request

# Create a Blueprint
jobs_bp = Blueprint('jobs_bp', __name__)
jobs_write_bp = Blueprint('jobs_write_bp', __name__)

TIMEOUT = 60 * 5  # 5 minute timeout

PROCESSES = {}


def _data_dir():
    return current_app.config['DATA_DIR']


def run_job(data_dir, dataset, job_id, command):
    """Execute a CLI command in a subprocess and write progress to a JSON file.

    This function runs in a background thread, so it receives *data_dir* as an
    explicit parameter rather than relying on the Flask application context.
    """
    job_dir = os.path.join(data_dir, dataset, "jobs")
    os.makedirs(job_dir, exist_ok=True)

    progress_file = os.path.join(job_dir, f"{job_id}.json")
    job_name = command.split(" ")[0].replace("ls-", "")
    job = {
        "id": job_id,
        "dataset": dataset,
        "job_name": job_name,
        "command": command,
        "status": "running",
        "last_update": str(datetime.now()),
        "progress": [],
        "times": [],
    }
    with open(progress_file, 'w') as f:
        json.dump(job, f)

    env = os.environ.copy()
    env['PYTHONUNBUFFERED'] = '1'
    # NOTE: shell=True is required here because commands use shell features such
    # as argument quoting and PATH lookup for the ls-* entry-points.  Input to
    # this function comes from trusted server-side code, not from raw user input.
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True,
        encoding="utf-8",
        env=env,
        bufsize=1,
    )
    PROCESSES[job_id] = process

    last_output_time = time.time()

    while True:
        output = process.stdout.readline()
        current_time = time.time()

        if output == '' and process.poll() is not None:
            break
        if output:
            if "RUNNING:" in output:
                run_id = output.strip().split("RUNNING: ")[1]
                job["run_id"] = run_id
            job["progress"].append(output.strip())
            job["times"].append(str(datetime.now()))
            job["last_update"] = str(datetime.now())
            with open(progress_file, 'w') as f:
                json.dump(job, f)
            last_output_time = current_time
        elif current_time - last_output_time > TIMEOUT:
            job["progress"].append(f"Timeout: No output for more than {TIMEOUT} seconds.")
            job["status"] = "error"
            break

    job["status"] = "error" if process.returncode != 0 else "completed"
    with open(progress_file, 'w') as f:
        json.dump(job, f)


def _delete_glob(data_dir, dataset, subdirectory, id_prefix):
    """Remove all files/dirs in *subdirectory* whose name starts with *id_prefix*."""
    target_dir = os.path.join(data_dir, dataset, subdirectory)
    if not os.path.exists(target_dir):
        return
    for entry in os.listdir(target_dir):
        if entry.startswith(id_prefix):
            full_path = os.path.join(target_dir, entry)
            if os.path.isdir(full_path):
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)


# ---------------------------------------------------------------------------
# Read-only job routes
# ---------------------------------------------------------------------------

@jobs_bp.route('/job')
def get_job():
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    progress_file = os.path.join(_data_dir(), dataset, "jobs", f"{job_id}.json")
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                job = json.load(f)
        except Exception:
            time.sleep(0.1)
            with open(progress_file, 'r') as f:
                job = json.load(f)
        return jsonify(job)
    return jsonify({'status': 'not found'}), 404


@jobs_bp.route('/all')
def get_jobs():
    dataset = request.args.get('dataset')
    job_dir = os.path.join(_data_dir(), dataset, "jobs")
    jobs = []
    if os.path.exists(job_dir):
        for file in os.listdir(job_dir):
            if file.endswith(".json"):
                with open(os.path.join(job_dir, file), 'r') as f:
                    job = json.load(f)
                jobs.append(job)
    return jsonify(jobs)


# ---------------------------------------------------------------------------
# Write job routes
# ---------------------------------------------------------------------------

@jobs_write_bp.route('/ingest', methods=['POST'])
def run_ingest():
    data_dir = _data_dir()
    dataset = request.form.get('dataset')
    file = request.files.get('file')
    text_column = request.form.get('text_column')
    dataset_dir = os.path.join(data_dir, dataset)
    os.makedirs(dataset_dir, exist_ok=True)
    file_path = os.path.join(dataset_dir, file.filename)
    file.save(file_path)

    job_id = str(uuid.uuid4())
    command = f'ls-ingest "{dataset}" --path="{file_path}"'
    if text_column:
        command += f' --text_column="{text_column}"'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/reingest', methods=['GET'])
def run_reingest():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    text_column = request.args.get('text_column')
    file_path = os.path.join(data_dir, dataset, "input.parquet")

    job_id = str(uuid.uuid4())
    command = f'ls-ingest "{dataset}" --path="{file_path}"'
    if text_column:
        command += f' --text_column="{text_column}"'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed')
def run_embed():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    text_column = request.args.get('text_column')
    model_id = request.args.get('model_id')
    prefix = request.args.get('prefix')
    dimensions = request.args.get('dimensions')
    batch_size = request.args.get('batch_size')
    max_seq_length = request.args.get('max_seq_length')

    job_id = str(uuid.uuid4())
    command = f'ls-embed "{dataset}" "{text_column}" "{model_id}" --prefix="{prefix}" --batch_size={batch_size}'
    if dimensions is not None:
        command += f" --dimensions={dimensions}"
    if max_seq_length is not None:
        command += f" --max_seq_length={max_seq_length}"
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed_truncate')
def run_embed_truncate():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    dimensions = request.args.get('dimensions')

    job_id = str(uuid.uuid4())
    command = f'ls-embed-truncate "{dataset}" "{embedding_id}" {dimensions}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed_importer')
def run_embed_importer():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    model_id = request.args.get('model_id')
    embedding_column = request.args.get('embedding_column')
    text_column = request.args.get('text_column')

    job_id = str(uuid.uuid4())
    command = f'ls-embed-importer "{dataset}" "{embedding_column}" "{model_id}" "{text_column}"'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/rerun')
def rerun_job():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    progress_file = os.path.join(data_dir, dataset, "jobs", f"{job_id}.json")
    with open(progress_file, 'r') as f:
        job = json.load(f)
    command = job.get('command') + f' --rerun {job.get("run_id")}'
    new_job_id = str(uuid.uuid4())
    threading.Thread(target=run_job, args=(data_dir, dataset, new_job_id, command)).start()
    return jsonify({"job_id": new_job_id})


@jobs_write_bp.route('/kill')
def kill_job():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    job_id = request.args.get('job_id')
    progress_file = os.path.join(data_dir, dataset, "jobs", f"{job_id}.json")
    with open(progress_file, 'r') as f:
        job = json.load(f)
    if job_id in PROCESSES:
        PROCESSES[job_id].kill()
        job["status"] = "dead"
        job["cause_of_death"] = "killed"
    else:
        job["status"] = "dead"
        job["cause_of_death"] = "process not found, presumed dead"
    with open(progress_file, 'w') as f:
        json.dump(job, f)
    return jsonify(job)


@jobs_write_bp.route('/delete/embedding')
def delete_embedding():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')

    # Find all umaps that reference this embedding
    umap_dir = os.path.join(data_dir, dataset, 'umaps')
    umaps_to_delete = []
    if os.path.exists(umap_dir):
        for file in os.listdir(umap_dir):
            if file.endswith(".json"):
                with open(os.path.join(umap_dir, file), 'r') as f:
                    umap_data = json.load(f)
                if umap_data.get('embedding_id') == embedding_id:
                    umaps_to_delete.append(file.replace('.json', ''))

    # Find all SAEs that reference this embedding
    sae_dir = os.path.join(data_dir, dataset, 'saes')
    saes_to_delete = []
    if os.path.exists(sae_dir):
        for file in os.listdir(sae_dir):
            if file.endswith(".json"):
                with open(os.path.join(sae_dir, file), 'r') as f:
                    sae_data = json.load(f)
                if sae_data.get('embedding_id') == embedding_id:
                    saes_to_delete.append(file.replace('.json', ''))

    for umap_id in umaps_to_delete:
        _delete_umap(data_dir, dataset, umap_id)
    for sae_id in saes_to_delete:
        _delete_sae(data_dir, dataset, sae_id)

    job_id = str(uuid.uuid4())
    _delete_glob(data_dir, dataset, "embeddings", embedding_id)
    _write_completed_job(data_dir, dataset, job_id, f"delete embedding {embedding_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/umap')
def run_umap():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    sae_id = request.args.get('sae_id')
    neighbors = request.args.get('neighbors')
    min_dist = request.args.get('min_dist')
    init = request.args.get('init')
    align = request.args.get('align')
    save = request.args.get('save')
    seed = request.args.get('seed')

    job_id = str(uuid.uuid4())
    command = f'ls-umap "{dataset}" "{embedding_id}" {neighbors} {min_dist}'
    if init:
        command += f' --init={init}'
    if align:
        command += f' --align={align}'
    if save:
        command += ' --save'
    if sae_id:
        command += f' --sae_id={sae_id}'
    if seed:
        command += f' --seed={seed}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/umap')
def delete_umap_request():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    umap_id = request.args.get('umap_id')
    return _delete_umap(data_dir, dataset, umap_id)


def _delete_umap(data_dir, dataset, umap_id):
    cluster_dir = os.path.join(data_dir, dataset, 'clusters')
    clusters_to_delete = []
    if os.path.exists(cluster_dir):
        for file in os.listdir(cluster_dir):
            if file.endswith(".json"):
                try:
                    with open(os.path.join(cluster_dir, file), 'r') as f:
                        cluster_data = json.load(f)
                    if cluster_data.get('umap_id') == umap_id:
                        clusters_to_delete.append(file.replace('.json', ''))
                except Exception:
                    pass

    for cluster_id in clusters_to_delete:
        _delete_glob(data_dir, dataset, "clusters", cluster_id)

    _delete_glob(data_dir, dataset, "umaps", umap_id)

    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete umap {umap_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/sae')
def run_sae():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    model_id = request.args.get('model_id')
    k_expansion = request.args.get('k_expansion')

    job_id = str(uuid.uuid4())
    command = f'ls-sae "{dataset}" "{embedding_id}" "{model_id}" {k_expansion}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/sae')
def delete_sae_request():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    sae_id = request.args.get('sae_id')
    return _delete_sae(data_dir, dataset, sae_id)


def _delete_sae(data_dir, dataset, sae_id):
    umap_dir = os.path.join(data_dir, dataset, 'umaps')
    umaps_to_delete = []
    if os.path.exists(umap_dir):
        for file in os.listdir(umap_dir):
            if file.endswith(".json"):
                with open(os.path.join(umap_dir, file), 'r') as f:
                    umap_data = json.load(f)
                if umap_data.get('sae_id') == sae_id:
                    umaps_to_delete.append(file.replace('.json', ''))

    for umap_id in umaps_to_delete:
        _delete_umap(data_dir, dataset, umap_id)

    _delete_glob(data_dir, dataset, "saes", sae_id)

    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete sae {sae_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/cluster')
def run_cluster():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    umap_id = request.args.get('umap_id')
    samples = request.args.get('samples')
    min_samples = request.args.get('min_samples')
    cluster_selection_epsilon = request.args.get('cluster_selection_epsilon')

    job_id = str(uuid.uuid4())
    command = f'ls-cluster "{dataset}" "{umap_id}" {samples} {min_samples} {cluster_selection_epsilon}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/cluster')
def delete_cluster():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    cluster_id = request.args.get('cluster_id')
    _delete_glob(data_dir, dataset, "clusters", cluster_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete cluster {cluster_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/cluster_label')
def run_cluster_label():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    chat_id = request.args.get('chat_id')
    text_column = request.args.get('text_column')
    cluster_id = request.args.get('cluster_id')
    context = request.args.get('context')
    samples = request.args.get('samples')
    max_tokens_per_sample = request.args.get('max_tokens_per_sample')
    max_tokens_total = request.args.get('max_tokens_total')
    if context:
        context = context.replace('"', '\\"')

    job_id = str(uuid.uuid4())
    command = f'ls-label "{dataset}" "{text_column}" "{cluster_id}" "{chat_id}" {samples} "{context}"'
    if max_tokens_per_sample:
        command += f' --max_tokens_per_sample={max_tokens_per_sample}'
    if max_tokens_total:
        command += f' --max_tokens_total={max_tokens_total}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/cluster_label')
def delete_cluster_label():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    cluster_labels_id = request.args.get('cluster_labels_id')
    _delete_glob(data_dir, dataset, "clusters", cluster_labels_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete cluster labels {cluster_labels_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/scope')
def run_scope():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    embedding_id = request.args.get('embedding_id')
    sae_id = request.args.get('sae_id')
    umap_id = request.args.get('umap_id')
    cluster_id = request.args.get('cluster_id')
    cluster_labels_id = request.args.get('cluster_labels_id')
    label = request.args.get('label')
    description = request.args.get('description')
    scope_id = request.args.get('scope_id')

    job_id = str(uuid.uuid4())
    command = f'ls-scope "{dataset}" "{embedding_id}" "{umap_id}" "{cluster_id}" "{cluster_labels_id}" "{label}" "{description}"'
    if sae_id:
        command += f' --sae_id={sae_id}'
    if scope_id:
        command += f' --scope_id={scope_id}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/scope')
def delete_scope():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')
    _delete_glob(data_dir, dataset, "scopes", scope_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete scope {scope_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/plot')
def run_plot():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    scope_id = request.args.get('scope_id')
    config = request.args.get('config')

    job_id = str(uuid.uuid4())
    escaped_config = json.dumps(config)
    command = f'ls-export-plot "{dataset}" {scope_id} --plot_config={escaped_config}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/download_dataset')
def download_dataset():
    data_dir = _data_dir()
    dataset_repo = request.args.get('dataset_repo')
    dataset_name = request.args.get('dataset_name')

    job_id = str(uuid.uuid4())
    command = f'ls-download-dataset "{dataset_repo}" "{dataset_name}" "{data_dir}"'
    threading.Thread(target=run_job, args=(data_dir, dataset_name, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/upload_dataset')
def upload_dataset():
    data_dir = _data_dir()
    dataset = request.args.get('dataset')
    hf_dataset = request.args.get('hf_dataset')
    main_parquet = request.args.get('main_parquet')
    private = request.args.get('private')

    job_id = str(uuid.uuid4())
    path = os.path.join(data_dir, dataset)
    command = f'ls-upload-dataset "{path}" "{hf_dataset}" --main-parquet="{main_parquet}" --private={private}'
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _write_completed_job(data_dir, dataset, job_id, description):
    """Write an instantly-completed job record (for synchronous file deletions)."""
    job_dir = os.path.join(data_dir, dataset, "jobs")
    os.makedirs(job_dir, exist_ok=True)
    job = {
        "id": job_id,
        "dataset": dataset,
        "job_name": description,
        "command": description,
        "status": "completed",
        "last_update": str(datetime.now()),
        "progress": [],
        "times": [],
    }
    with open(os.path.join(job_dir, f"{job_id}.json"), 'w') as f:
        json.dump(job, f)
