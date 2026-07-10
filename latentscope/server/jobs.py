import glob
import json
import os
import shlex
import shutil
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from flask import Blueprint, abort, current_app, jsonify, request
from werkzeug.utils import secure_filename

from latentscope.server.job_utils import _safe_dataset

# Create a Blueprint
jobs_bp = Blueprint('jobs_bp', __name__)
jobs_write_bp = Blueprint('jobs_write_bp', __name__)

TIMEOUT = 60 * 5  # 5 minute no-output timeout
MAX_PROGRESS_LINES = 500  # lines of output retained in the job JSON
WRITE_INTERVAL = 0.5  # seconds between JSON rewrites while streaming output

PROCESSES = {}
# job ids that were explicitly killed via the kill endpoint, so run_job can
# preserve the "dead" status instead of overwriting it with "error"
KILLED = set()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _data_dir():
    return current_app.config['DATA_DIR']


def _require_params(**params):
    """Validate that all named parameters are non-None.

    Returns a tuple (error_response, 400) if any are missing, or None if all
    are present.  Usage::

        err = _require_params(dataset=dataset, model_id=model_id)
        if err:
            return err
    """
    missing = [name for name, value in params.items() if value is None]
    if missing:
        return jsonify({"error": f"Missing required parameters: {', '.join(missing)}"}), 400
    return None


def _atomic_write_json(path, obj):
    """Write JSON atomically: serialize to a temp file in the same directory,
    then os.replace() (an atomic rename on the same filesystem). A concurrent
    reader always sees a complete file — the old one or the new one — never a
    truncated/partial write mid-``json.dump`` (which caused intermittent
    JSONDecodeErrors when polling / killing a running job)."""
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, 'w') as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def run_job(data_dir, dataset, job_id, command):
    """Execute a CLI command in a subprocess and write progress to a JSON file.

    *command* must be a list of strings (no shell=True).  This avoids shell
    injection when dataset names, file paths or user-supplied parameters are
    included in the command.

    Every output line is appended to a plain-text sidecar log
    ``<jobs_dir>/<job_id>.log``.  The job JSON keeps only the last
    ``MAX_PROGRESS_LINES`` lines and is rewritten at most every
    ``WRITE_INTERVAL`` seconds (plus always on status changes / exit).

    This function runs in a background thread, so it receives *data_dir* as an
    explicit parameter rather than relying on the Flask application context.
    """
    job_dir = os.path.join(data_dir, dataset, "jobs")
    os.makedirs(job_dir, exist_ok=True)

    progress_file = os.path.join(job_dir, f"{job_id}.json")
    log_path = os.path.join(job_dir, f"{job_id}.log")
    job_name = command[0].replace("ls-", "")
    progress = deque(maxlen=MAX_PROGRESS_LINES)
    times = deque(maxlen=MAX_PROGRESS_LINES)
    job = {
        "id": job_id,
        "dataset": dataset,
        "job_name": job_name,
        "command": command,
        "status": "running",
        "last_update": _now(),
        "progress": [],
        "times": [],
    }

    def write_job():
        job["progress"] = list(progress)
        job["times"] = list(times)
        _atomic_write_json(progress_file, job)

    write_job()

    env = os.environ.copy()
    env['PYTHONUNBUFFERED'] = '1'
    # Resolve the CLI entry point robustly. subprocess searches PATH, but a
    # server launched from a venv whose bin dir is not on PATH (e.g. started by
    # absolute python path) would fail to find ls-embed/ls-umap/... Fall back to
    # the same bin dir as the running interpreter before giving up.
    if command and shutil.which(command[0]) is None:
        candidate = os.path.join(os.path.dirname(sys.executable), command[0])
        if os.path.exists(candidate):
            command = [candidate, *command[1:]]
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            env=env,
            bufsize=1,
        )
    except (FileNotFoundError, OSError) as exc:
        job["status"] = "error"
        progress.append(f"Failed to start process: {exc}")
        times.append(_now())
        job["last_update"] = _now()
        write_job()
        return

    PROCESSES[job_id] = process
    job["pid"] = process.pid
    write_job()

    last_output_time = time.time()
    last_write_time = time.time()
    timed_out = False

    try:
        with open(log_path, 'a', buffering=1) as log:
            while True:
                output = process.stdout.readline()
                current_time = time.time()

                if output == '' and process.poll() is not None:
                    break
                if output:
                    log.write(output if output.endswith("\n") else output + "\n")
                    if "RUNNING:" in output:
                        run_id = output.strip().split("RUNNING: ")[1]
                        job["run_id"] = run_id
                    progress.append(output.strip())
                    times.append(_now())
                    job["last_update"] = _now()
                    last_output_time = current_time
                    if current_time - last_write_time >= WRITE_INTERVAL:
                        write_job()
                        last_write_time = current_time
                elif current_time - last_output_time > TIMEOUT:
                    message = f"Timeout: No output for more than {TIMEOUT} seconds."
                    log.write(message + "\n")
                    progress.append(message)
                    times.append(_now())
                    timed_out = True
                    process.kill()
                    break

        process.wait()
        if job_id in KILLED:
            job["status"] = "dead"
            job["cause_of_death"] = "killed"
        elif timed_out or process.returncode != 0:
            job["status"] = "error"
        else:
            job["status"] = "completed"
        job["last_update"] = _now()
        write_job()
    finally:
        PROCESSES.pop(job_id, None)
        KILLED.discard(job_id)


def reconcile_stale_jobs(data_dir):
    """Mark 'running' jobs whose recorded process is no longer alive as errored.

    Called once on server startup: any job file left in status "running" from
    a previous server process is checked against its recorded pid; if the pid
    is missing or dead the job is rewritten as an error.
    """
    for path in glob.glob(os.path.join(data_dir, "*", "jobs", "*.json")):
        try:
            with open(path) as f:
                job = json.load(f)
        except Exception:
            continue
        if not isinstance(job, dict) or job.get("status") != "running":
            continue
        pid = job.get("pid")
        alive = False
        if pid is not None:
            try:
                os.kill(int(pid), 0)
                alive = True
            except ProcessLookupError:
                alive = False
            except PermissionError:
                alive = True  # exists but owned by someone else
            except (OSError, ValueError, TypeError):
                alive = False
        if alive:
            continue
        job["status"] = "error"
        progress = job.get("progress") or []
        progress.append("server restarted while job was running; marked as dead")
        job["progress"] = progress
        times = job.get("times") or []
        times.append(_now())
        job["times"] = times
        job["last_update"] = _now()
        try:
            _atomic_write_json(path, job)
        except Exception:
            continue


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
    dataset = _safe_dataset(request.args.get('dataset'))
    job_id = _safe_dataset(request.args.get('job_id'), param='job_id')
    progress_file = os.path.join(_data_dir(), dataset, "jobs", f"{job_id}.json")
    if os.path.exists(progress_file):
        try:
            with open(progress_file) as f:
                job = json.load(f)
        except Exception:
            time.sleep(0.1)
            with open(progress_file) as f:
                job = json.load(f)
        return jsonify(job)
    return jsonify({'status': 'not found'}), 404


@jobs_bp.route('/all')
def get_jobs():
    dataset = _safe_dataset(request.args.get('dataset'))
    job_dir = os.path.join(_data_dir(), dataset, "jobs")
    jobs = []
    if os.path.exists(job_dir):
        for file in os.listdir(job_dir):
            if file.endswith(".json"):
                with open(os.path.join(job_dir, file)) as f:
                    job = json.load(f)
                jobs.append(job)
    return jsonify(jobs)


# ---------------------------------------------------------------------------
# Write job routes
# ---------------------------------------------------------------------------

@jobs_write_bp.route('/ingest', methods=['POST'])
def run_ingest():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.form.get('dataset'))
    file = request.files.get('file')
    text_column = request.form.get('text_column')
    if file is None or not file.filename:
        return jsonify({"error": "Missing required file upload"}), 400
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"error": "Invalid file name"}), 400
    dataset_dir = os.path.join(data_dir, dataset)
    os.makedirs(dataset_dir, exist_ok=True)
    file_path = os.path.join(dataset_dir, filename)
    file.save(file_path)

    job_id = str(uuid.uuid4())
    command = ['ls-ingest', dataset, f'--path={file_path}']
    if text_column:
        command.append(f'--text_column={text_column}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/reingest', methods=['GET', 'POST'])
def run_reingest():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    text_column = request.values.get('text_column')
    file_path = os.path.join(data_dir, dataset, "input.parquet")

    job_id = str(uuid.uuid4())
    command = ['ls-ingest', dataset, f'--path={file_path}']
    if text_column:
        command.append(f'--text_column={text_column}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed', methods=['GET', 'POST'])
def run_embed():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    text_column = request.values.get('text_column')
    model_id = request.values.get('model_id')
    prefix = request.values.get('prefix')
    dimensions = request.values.get('dimensions')
    batch_size = request.values.get('batch_size')
    max_seq_length = request.values.get('max_seq_length')
    # Task for task-conditioned models (jina-v3/v5). Consumed by ls-embed.
    task = request.values.get('task')

    err = _require_params(dataset=dataset, text_column=text_column, model_id=model_id,
                          prefix=prefix, batch_size=batch_size)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-embed', dataset, text_column, model_id,
               f'--prefix={prefix}', f'--batch_size={batch_size}']
    if dimensions is not None:
        command.append(f'--dimensions={dimensions}')
    if max_seq_length is not None:
        command.append(f'--max_seq_length={max_seq_length}')
    if task:
        command.append(f'--task={task}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed_truncate', methods=['GET', 'POST'])
def run_embed_truncate():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    embedding_id = request.values.get('embedding_id')
    dimensions = request.values.get('dimensions')

    err = _require_params(dataset=dataset, embedding_id=embedding_id, dimensions=dimensions)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-embed-truncate', dataset, embedding_id, str(dimensions)]
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/embed_importer', methods=['GET', 'POST'])
def run_embed_importer():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    model_id = request.values.get('model_id')
    embedding_column = request.values.get('embedding_column')
    text_column = request.values.get('text_column')

    err = _require_params(dataset=dataset, model_id=model_id,
                          embedding_column=embedding_column, text_column=text_column)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-embed-importer', dataset, embedding_column, model_id, text_column]
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/rerun', methods=['GET', 'POST'])
def rerun_job():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    job_id = _safe_dataset(request.values.get('job_id'), param='job_id')
    progress_file = os.path.join(data_dir, dataset, "jobs", f"{job_id}.json")
    if not os.path.exists(progress_file):
        abort(404, description="job not found")
    with open(progress_file) as f:
        job = json.load(f)
    command = job.get('command')
    # Handle legacy job files that stored command as a string
    if isinstance(command, str):
        command = shlex.split(command)
    run_id = job.get("run_id")
    if run_id:
        command = command + ['--rerun', run_id]
    new_job_id = str(uuid.uuid4())
    threading.Thread(target=run_job, args=(data_dir, dataset, new_job_id, command)).start()
    return jsonify({"job_id": new_job_id})


@jobs_write_bp.route('/kill', methods=['GET', 'POST'])
def kill_job():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    job_id = _safe_dataset(request.values.get('job_id'), param='job_id')
    progress_file = os.path.join(data_dir, dataset, "jobs", f"{job_id}.json")
    if not os.path.exists(progress_file):
        abort(404, description="job not found")
    with open(progress_file) as f:
        job = json.load(f)
    process = PROCESSES.pop(job_id, None)
    if process is not None:
        KILLED.add(job_id)
        process.kill()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        job["status"] = "dead"
        job["cause_of_death"] = "killed"
    else:
        job["status"] = "dead"
        job["cause_of_death"] = "process not found, presumed dead"
    job["last_update"] = _now()
    _atomic_write_json(progress_file, job)
    return jsonify(job)


@jobs_write_bp.route('/delete/embedding', methods=['GET', 'POST'])
def delete_embedding():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    embedding_id = request.values.get('embedding_id')

    # Find all umaps that reference this embedding
    umap_dir = os.path.join(data_dir, dataset, 'umaps')
    umaps_to_delete = []
    if os.path.exists(umap_dir):
        for file in os.listdir(umap_dir):
            if file.endswith(".json"):
                with open(os.path.join(umap_dir, file)) as f:
                    umap_data = json.load(f)
                if umap_data.get('embedding_id') == embedding_id:
                    umaps_to_delete.append(file.replace('.json', ''))

    # Find all SAEs that reference this embedding
    sae_dir = os.path.join(data_dir, dataset, 'saes')
    saes_to_delete = []
    if os.path.exists(sae_dir):
        for file in os.listdir(sae_dir):
            if file.endswith(".json"):
                with open(os.path.join(sae_dir, file)) as f:
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


@jobs_write_bp.route('/umap', methods=['GET', 'POST'])
def run_umap():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    embedding_id = request.values.get('embedding_id')
    sae_id = request.values.get('sae_id')
    neighbors = request.values.get('neighbors')
    min_dist = request.values.get('min_dist')
    init = request.values.get('init')
    align = request.values.get('align')
    save = request.values.get('save')
    seed = request.values.get('seed')
    # Optional named-step metadata (issue: experiment gallery + named steps).
    # Consumed by ls-umap (WP-A) and written into umap-NNN.json.
    name = request.values.get('name')
    description = request.values.get('description')

    err = _require_params(dataset=dataset, embedding_id=embedding_id,
                          neighbors=neighbors, min_dist=min_dist)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-umap', dataset, embedding_id, neighbors, min_dist]
    if init:
        command.append(f'--init={init}')
    if align:
        command.append(f'--align={align}')
    if save:
        command.append('--save')
    if sae_id:
        command.append(f'--sae_id={sae_id}')
    if seed:
        command.append(f'--seed={seed}')
    if name:
        command.append(f'--name={name}')
    if description:
        command.append(f'--description={description}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/umap', methods=['GET', 'POST'])
def delete_umap_request():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    umap_id = request.values.get('umap_id')
    return _delete_umap(data_dir, dataset, umap_id)


def _delete_umap(data_dir, dataset, umap_id):
    cluster_dir = os.path.join(data_dir, dataset, 'clusters')
    clusters_to_delete = []
    if os.path.exists(cluster_dir):
        for file in os.listdir(cluster_dir):
            if file.endswith(".json"):
                try:
                    with open(os.path.join(cluster_dir, file)) as f:
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


@jobs_write_bp.route('/sae', methods=['GET', 'POST'])
def run_sae():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    embedding_id = request.values.get('embedding_id')
    model_id = request.values.get('model_id')
    k_expansion = request.values.get('k_expansion')

    err = _require_params(dataset=dataset, embedding_id=embedding_id,
                          model_id=model_id, k_expansion=k_expansion)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-sae', dataset, embedding_id, model_id, k_expansion]
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/sae', methods=['GET', 'POST'])
def delete_sae_request():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    sae_id = request.values.get('sae_id')
    return _delete_sae(data_dir, dataset, sae_id)


def _delete_sae(data_dir, dataset, sae_id):
    umap_dir = os.path.join(data_dir, dataset, 'umaps')
    umaps_to_delete = []
    if os.path.exists(umap_dir):
        for file in os.listdir(umap_dir):
            if file.endswith(".json"):
                with open(os.path.join(umap_dir, file)) as f:
                    umap_data = json.load(f)
                if umap_data.get('sae_id') == sae_id:
                    umaps_to_delete.append(file.replace('.json', ''))

    for umap_id in umaps_to_delete:
        _delete_umap(data_dir, dataset, umap_id)

    _delete_glob(data_dir, dataset, "saes", sae_id)

    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete sae {sae_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/cluster', methods=['GET', 'POST'])
def run_cluster():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    umap_id = request.values.get('umap_id')
    samples = request.values.get('samples')
    min_samples = request.values.get('min_samples')
    cluster_selection_epsilon = request.values.get('cluster_selection_epsilon')
    method = request.values.get('method', 'evoc')
    n_neighbors = request.values.get('n_neighbors')
    noise_level = request.values.get('noise_level')
    approx_n_clusters = request.values.get('approx_n_clusters')
    base_n_clusters = request.values.get('base_n_clusters')
    seed = request.values.get('seed')
    # Opt back in to the pre-1.0 behavior of reassigning noise points to their
    # nearest cluster centroid (#143). Default keeps them as "Unclustered".
    assign_noise = request.values.get('assign_noise')
    # Input space to cluster on: 2D umap projection or high-dim embeddings.
    # Consumed by ls-cluster (WP-B). Optional; the script defaults per method
    # (evoc->embedding, hdbscan/kmeans/gmm->umap) when omitted here.
    cluster_on = request.values.get('cluster_on')
    # Optional named-step metadata (experiment gallery + named steps).
    name = request.values.get('name')
    description = request.values.get('description')

    err = _require_params(dataset=dataset, umap_id=umap_id, samples=samples)
    if err:
        return err

    # Whitelist clustering methods; fall back to the historical default rather
    # than passing an arbitrary user string to the CLI.
    if method not in ('evoc', 'hdbscan', 'kmeans', 'gmm'):
        method = 'evoc'
    if cluster_on is not None and cluster_on not in ('umap', 'embedding'):
        cluster_on = None

    # min_samples and cluster_selection_epsilon are positional in the CLI
    # Default them when not provided (EVoC doesn't use them)
    if not min_samples or min_samples == 'null':
        min_samples = '5'
    if not cluster_selection_epsilon or cluster_selection_epsilon == 'null':
        cluster_selection_epsilon = '0'

    job_id = str(uuid.uuid4())
    command = ['ls-cluster', dataset, umap_id, samples, min_samples,
               cluster_selection_epsilon, f'--method={method}']
    if method == 'evoc':
        if n_neighbors is not None:
            command.append(f'--n_neighbors={n_neighbors}')
        if noise_level is not None:
            command.append(f'--noise_level={noise_level}')
        if approx_n_clusters and approx_n_clusters not in ('null', '0'):
            command.append(f'--approx_n_clusters={approx_n_clusters}')
        if base_n_clusters and base_n_clusters not in ('null', '0'):
            command.append(f'--base_n_clusters={base_n_clusters}')
    if seed and seed != 'null':
        command.append(f'--seed={seed}')
    if assign_noise and assign_noise not in ('null', 'false', 'False', '0'):
        command.append('--assign-noise')
    if cluster_on:
        command.append(f'--cluster_on={cluster_on}')
    if name:
        command.append(f'--name={name}')
    if description:
        command.append(f'--description={description}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/cluster', methods=['GET', 'POST'])
def delete_cluster():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    cluster_id = request.values.get('cluster_id')
    _delete_glob(data_dir, dataset, "clusters", cluster_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete cluster {cluster_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/cluster_label', methods=['GET', 'POST'])
def run_cluster_label():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    chat_id = request.values.get('chat_id')
    text_column = request.values.get('text_column')
    cluster_id = request.values.get('cluster_id')
    context = request.values.get('context') or ''
    samples = request.values.get('samples')
    max_tokens_per_sample = request.values.get('max_tokens_per_sample')
    max_tokens_total = request.values.get('max_tokens_total')

    err = _require_params(dataset=dataset, text_column=text_column,
                          cluster_id=cluster_id, chat_id=chat_id, samples=samples)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-label', dataset, text_column, cluster_id, chat_id, samples, context]
    if max_tokens_per_sample:
        command.append(f'--max_tokens_per_sample={max_tokens_per_sample}')
    if max_tokens_total:
        command.append(f'--max_tokens_total={max_tokens_total}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/cluster_label', methods=['GET', 'POST'])
def delete_cluster_label():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    cluster_labels_id = request.values.get('cluster_labels_id')
    _delete_glob(data_dir, dataset, "clusters", cluster_labels_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete cluster labels {cluster_labels_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/scope', methods=['GET', 'POST'])
def run_scope():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    embedding_id = request.values.get('embedding_id')
    sae_id = request.values.get('sae_id')
    umap_id = request.values.get('umap_id')
    cluster_id = request.values.get('cluster_id')
    cluster_labels_id = request.values.get('cluster_labels_id')
    label = request.values.get('label')
    description = request.values.get('description')
    scope_id = request.values.get('scope_id')

    err = _require_params(dataset=dataset, embedding_id=embedding_id,
                          umap_id=umap_id, cluster_id=cluster_id,
                          cluster_labels_id=cluster_labels_id,
                          label=label, description=description)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-scope', dataset, embedding_id, umap_id, cluster_id,
               cluster_labels_id, label, description]
    if sae_id:
        command.append(f'--sae_id={sae_id}')
    if scope_id:
        command.append(f'--scope_id={scope_id}')
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/sprites', methods=['GET', 'POST'])
def run_sprites():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    image_column = request.values.get('image_column')
    size = request.values.get('size') or '64'

    err = _require_params(dataset=dataset, image_column=image_column)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-sprites', dataset, image_column, '--size', str(size)]
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/sprite-atlas', methods=['GET', 'POST'])
def run_sprite_atlas():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    scope_id = _safe_dataset(request.values.get('scope_id'), param="scope_id")
    image_column = request.values.get('image_column')
    cell_size = request.values.get('cell_size') or '32'
    samples = request.values.get('samples') or '1'
    resolutions = request.values.get('resolutions')  # optional, e.g. "64,128"

    err = _require_params(dataset=dataset, image_column=image_column)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-sprite-atlas', dataset, scope_id, image_column,
               '--cell-size', str(cell_size), '--samples', str(samples)]
    if resolutions:
        command += ['--resolutions', str(resolutions)]
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/delete/scope', methods=['GET', 'POST'])
def delete_scope():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    scope_id = request.values.get('scope_id')
    _delete_glob(data_dir, dataset, "scopes", scope_id)
    job_id = str(uuid.uuid4())
    _write_completed_job(data_dir, dataset, job_id, f"delete scope {scope_id}")
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/plot', methods=['GET', 'POST'])
def run_plot():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    scope_id = request.values.get('scope_id')
    config = request.values.get('config')

    err = _require_params(dataset=dataset, scope_id=scope_id, config=config)
    if err:
        return err

    job_id = str(uuid.uuid4())
    command = ['ls-export-plot', dataset, scope_id, f'--plot_config={config}']
    threading.Thread(target=run_job, args=(data_dir, dataset, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/download_dataset', methods=['GET', 'POST'])
def download_dataset():
    data_dir = _data_dir()
    dataset_repo = request.values.get('dataset_repo')
    dataset_name = request.values.get('dataset_name')

    err = _require_params(dataset_repo=dataset_repo, dataset_name=dataset_name)
    if err:
        return err
    dataset_name = _safe_dataset(dataset_name, param='dataset_name')

    job_id = str(uuid.uuid4())
    command = ['ls-download-dataset', dataset_repo, dataset_name, data_dir]
    threading.Thread(target=run_job, args=(data_dir, dataset_name, job_id, command)).start()
    return jsonify({"job_id": job_id})


@jobs_write_bp.route('/upload_dataset', methods=['GET', 'POST'])
def upload_dataset():
    data_dir = _data_dir()
    dataset = _safe_dataset(request.values.get('dataset'))
    hf_dataset = request.values.get('hf_dataset')
    main_parquet = request.values.get('main_parquet')
    private = request.values.get('private')

    err = _require_params(dataset=dataset, hf_dataset=hf_dataset,
                          main_parquet=main_parquet, private=private)
    if err:
        return err

    job_id = str(uuid.uuid4())
    path = os.path.join(data_dir, dataset)
    command = ['ls-upload-dataset', path, hf_dataset,
               f'--main-parquet={main_parquet}', f'--private={private}']
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
        "last_update": _now(),
        "progress": [],
        "times": [],
    }
    _atomic_write_json(os.path.join(job_dir, f"{job_id}.json"), job)
