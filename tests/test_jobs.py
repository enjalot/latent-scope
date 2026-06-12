"""Tests for the subprocess job runner and job routes."""
import json
import os
import subprocess
import sys
import threading
import time

from latentscope.server.jobs import PROCESSES, reconcile_stale_jobs, run_job

DATASET = "ds1"
JOB_ID = "job-test-1"


def _job_path(data_dir, job_id=JOB_ID, dataset=DATASET, ext="json"):
    return os.path.join(data_dir, dataset, "jobs", f"{job_id}.{ext}")


def _read_job(data_dir, job_id=JOB_ID, dataset=DATASET):
    with open(_job_path(data_dir, job_id, dataset)) as f:
        return json.load(f)


def _pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# run_job (called synchronously — the endpoints wrap it in a thread)
# ---------------------------------------------------------------------------

class TestRunJob:
    def test_streams_output_and_completes(self, tmp_data_dir):
        command = [sys.executable, "-c", "print('hello'); print('RUNNING: foo-001')"]
        run_job(tmp_data_dir, DATASET, JOB_ID, command)

        job = _read_job(tmp_data_dir)
        assert job["status"] == "completed"
        assert "hello" in job["progress"]
        assert job["run_id"] == "foo-001"
        assert isinstance(job["pid"], int)
        assert job["job_name"] == sys.executable.replace("ls-", "")
        assert len(job["times"]) == len(job["progress"])
        assert JOB_ID not in PROCESSES

    def test_failing_command_sets_error(self, tmp_data_dir):
        command = [sys.executable, "-c", "import sys; print('boom'); sys.exit(3)"]
        run_job(tmp_data_dir, DATASET, JOB_ID, command)

        job = _read_job(tmp_data_dir)
        assert job["status"] == "error"
        assert "boom" in job["progress"]
        assert JOB_ID not in PROCESSES

    def test_nonexistent_command_sets_error(self, tmp_data_dir):
        run_job(tmp_data_dir, DATASET, JOB_ID, ["definitely-not-a-real-binary-xyz"])
        job = _read_job(tmp_data_dir)
        assert job["status"] == "error"
        assert any("Failed to start process" in line for line in job["progress"])
        assert JOB_ID not in PROCESSES

    def test_log_sidecar_has_all_lines_when_progress_capped(self, tmp_data_dir):
        n_lines = 600
        command = [sys.executable, "-c", f"for i in range({n_lines}): print(f'line {{i}}')"]
        run_job(tmp_data_dir, DATASET, JOB_ID, command)

        job = _read_job(tmp_data_dir)
        assert job["status"] == "completed"
        assert len(job["progress"]) <= 500
        assert len(job["times"]) == len(job["progress"])
        # last line emitted must be retained
        assert f"line {n_lines - 1}" in job["progress"]

        log_path = _job_path(tmp_data_dir, ext="log")
        assert os.path.exists(log_path)
        with open(log_path) as f:
            log_lines = [line.strip() for line in f if line.strip()]
        assert log_lines == [f"line {i}" for i in range(n_lines)]


# ---------------------------------------------------------------------------
# kill endpoint
# ---------------------------------------------------------------------------

class TestKillJob:
    def test_kill_running_job(self, client, tmp_data_dir):
        command = [sys.executable, "-c", "import time; print('started'); time.sleep(60)"]
        thread = threading.Thread(
            target=run_job, args=(tmp_data_dir, DATASET, JOB_ID, command)
        )
        thread.start()

        # wait for the subprocess to be registered
        deadline = time.time() + 10
        while JOB_ID not in PROCESSES and time.time() < deadline:
            time.sleep(0.05)
        assert JOB_ID in PROCESSES
        pid = PROCESSES[JOB_ID].pid

        response = client.get(f'/api/jobs/kill?dataset={DATASET}&job_id={JOB_ID}')
        assert response.status_code == 200
        assert response.get_json()["status"] == "dead"

        thread.join(timeout=10)
        assert not thread.is_alive()

        job = _read_job(tmp_data_dir)
        assert job["status"] == "dead"
        assert job["cause_of_death"] == "killed"
        assert JOB_ID not in PROCESSES
        assert not _pid_alive(pid)

    def test_kill_unknown_process_marks_dead(self, client, tmp_data_dir):
        job_dir = os.path.join(tmp_data_dir, DATASET, "jobs")
        os.makedirs(job_dir)
        job = {"id": JOB_ID, "status": "running", "progress": [], "times": []}
        with open(os.path.join(job_dir, f"{JOB_ID}.json"), "w") as f:
            json.dump(job, f)

        response = client.get(f'/api/jobs/kill?dataset={DATASET}&job_id={JOB_ID}')
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "dead"
        assert data["cause_of_death"] == "process not found, presumed dead"
        assert _read_job(tmp_data_dir)["status"] == "dead"

    def test_kill_missing_job_file_404(self, client, tmp_data_dir):
        response = client.get(f'/api/jobs/kill?dataset={DATASET}&job_id=nope')
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# reconcile_stale_jobs
# ---------------------------------------------------------------------------

class TestReconcileStaleJobs:
    def _write_job(self, data_dir, job, job_id=JOB_ID):
        job_dir = os.path.join(data_dir, DATASET, "jobs")
        os.makedirs(job_dir, exist_ok=True)
        with open(os.path.join(job_dir, f"{job_id}.json"), "w") as f:
            json.dump(job, f)

    def test_dead_pid_marked_error(self, tmp_data_dir):
        # spawn a process and let it exit so the pid is definitely dead
        proc = subprocess.Popen([sys.executable, "-c", "pass"])
        proc.wait()
        self._write_job(tmp_data_dir, {
            "id": JOB_ID, "status": "running", "pid": proc.pid,
            "progress": [], "times": [],
        })

        reconcile_stale_jobs(tmp_data_dir)

        job = _read_job(tmp_data_dir)
        assert job["status"] == "error"
        assert "server restarted while job was running; marked as dead" in job["progress"]

    def test_missing_pid_treated_as_dead(self, tmp_data_dir):
        self._write_job(tmp_data_dir, {
            "id": JOB_ID, "status": "running", "progress": [], "times": [],
        })
        reconcile_stale_jobs(tmp_data_dir)
        assert _read_job(tmp_data_dir)["status"] == "error"

    def test_alive_pid_left_running(self, tmp_data_dir):
        self._write_job(tmp_data_dir, {
            "id": JOB_ID, "status": "running", "pid": os.getpid(),
            "progress": [], "times": [],
        })
        reconcile_stale_jobs(tmp_data_dir)
        assert _read_job(tmp_data_dir)["status"] == "running"

    def test_non_running_jobs_untouched(self, tmp_data_dir):
        self._write_job(tmp_data_dir, {
            "id": JOB_ID, "status": "completed", "progress": ["done"], "times": [],
        })
        reconcile_stale_jobs(tmp_data_dir)
        job = _read_job(tmp_data_dir)
        assert job["status"] == "completed"
        assert job["progress"] == ["done"]

    def test_bad_job_file_does_not_break_startup(self, tmp_data_dir):
        job_dir = os.path.join(tmp_data_dir, DATASET, "jobs")
        os.makedirs(job_dir, exist_ok=True)
        with open(os.path.join(job_dir, "bad.json"), "w") as f:
            f.write("{not json")
        reconcile_stale_jobs(tmp_data_dir)  # must not raise

    def test_called_on_create_app(self, tmp_data_dir):
        self._write_job(tmp_data_dir, {
            "id": JOB_ID, "status": "running", "progress": [], "times": [],
        })
        from latentscope.server.app import create_app
        create_app(data_dir=tmp_data_dir, read_only=False)
        assert _read_job(tmp_data_dir)["status"] == "error"


# ---------------------------------------------------------------------------
# path traversal / input validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_job_endpoint_rejects_traversal(self, client):
        response = client.get('/api/jobs/job?dataset=../../etc&job_id=x')
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_all_endpoint_rejects_traversal(self, client):
        response = client.get('/api/jobs/all?dataset=../../etc')
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_job_endpoint_rejects_traversal_job_id(self, client):
        response = client.get('/api/jobs/job?dataset=ds1&job_id=../../../x')
        assert response.status_code == 400

    def test_rejects_absolute_path(self, client):
        response = client.get('/api/jobs/all?dataset=/etc')
        assert response.status_code == 400

    def test_rejects_missing_dataset(self, client):
        response = client.get('/api/jobs/all')
        assert response.status_code == 400

    def test_kill_rejects_traversal(self, client):
        response = client.get('/api/jobs/kill?dataset=..%5C..%5Cetc&job_id=x')
        assert response.status_code == 400

    def test_rerun_rejects_traversal(self, client):
        response = client.get('/api/jobs/rerun?dataset=a/b&job_id=x')
        assert response.status_code == 400

    def test_ingest_without_file_returns_400_json(self, client):
        response = client.post('/api/jobs/ingest', data={"dataset": "ds1"})
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_ingest_without_dataset_returns_400_json(self, client):
        response = client.post('/api/jobs/ingest', data={})
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_tags_rejects_traversal(self, client):
        response = client.get('/api/tags/?dataset=../../etc')
        assert response.status_code == 400

    def test_datasets_meta_rejects_traversal(self, client):
        response = client.get('/api/datasets/..%5C..%5Cetc/meta')
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# mutations accept POST as well as GET
# ---------------------------------------------------------------------------

class TestPostCompat:
    def test_kill_via_post_form(self, client, tmp_data_dir):
        job_dir = os.path.join(tmp_data_dir, DATASET, "jobs")
        os.makedirs(job_dir)
        with open(os.path.join(job_dir, f"{JOB_ID}.json"), "w") as f:
            json.dump({"id": JOB_ID, "status": "running"}, f)

        response = client.post('/api/jobs/kill', data={"dataset": DATASET, "job_id": JOB_ID})
        assert response.status_code == 200
        assert response.get_json()["status"] == "dead"


def test_readonly_app_does_not_reconcile_jobs(tmp_data_dir):
    """Codex review on #119: read-only deployments must not mutate the data
    dir — starting the app in read_only mode must leave stale 'running' job
    files untouched."""
    import json
    import os

    from latentscope.server.app import create_app

    jobs_dir = os.path.join(tmp_data_dir, "some-dataset", "jobs")
    os.makedirs(jobs_dir)
    job = {"id": "stale-job", "status": "running", "pid": 99999999,
           "progress": [], "times": [], "last_update": ""}
    job_path = os.path.join(jobs_dir, "stale-job.json")
    with open(job_path, "w") as f:
        json.dump(job, f)

    create_app(data_dir=tmp_data_dir, read_only=True)
    with open(job_path) as f:
        assert json.load(f)["status"] == "running"

    create_app(data_dir=tmp_data_dir, read_only=False)
    with open(job_path) as f:
        assert json.load(f)["status"] == "error"
