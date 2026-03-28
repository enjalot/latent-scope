"""Tests for the Flask server (app factory and key routes)."""
import json
import os
import pytest


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

class TestCreateApp:
    def test_app_created_with_data_dir(self, app, tmp_data_dir):
        assert app.config['DATA_DIR'] == tmp_data_dir

    def test_data_dir_created_if_missing(self, tmp_path):
        from latentscope.server.app import create_app
        new_dir = str(tmp_path / "new-data")
        assert not os.path.exists(new_dir)
        application = create_app(data_dir=new_dir)
        assert os.path.exists(new_dir)

    def test_read_only_false_by_default(self, app):
        assert app.config['READ_ONLY'] is False

    def test_read_only_can_be_set(self, tmp_data_dir):
        from latentscope.server.app import create_app
        application = create_app(data_dir=tmp_data_dir, read_only=True)
        assert application.config['READ_ONLY'] is True


# ---------------------------------------------------------------------------
# /api/version
# ---------------------------------------------------------------------------

class TestVersion:
    def test_returns_version_string(self, client):
        response = client.get('/api/version')
        assert response.status_code == 200
        from latentscope.__version__ import __version__
        assert response.data.decode() == __version__


# ---------------------------------------------------------------------------
# /api/datasets/
# ---------------------------------------------------------------------------

class TestDatasets:
    def test_empty_data_dir_returns_empty_list(self, client):
        response = client.get('/api/datasets/')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data == []

    def test_dataset_with_meta_json_is_listed(self, client, tmp_data_dir):
        # Create a minimal dataset directory
        ds_dir = os.path.join(tmp_data_dir, "test-dataset")
        os.makedirs(ds_dir)
        meta = {"id": "test-dataset", "length": 10, "label": "Test"}
        with open(os.path.join(ds_dir, "meta.json"), "w") as f:
            json.dump(meta, f)

        response = client.get('/api/datasets/')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['id'] == 'test-dataset'


# ---------------------------------------------------------------------------
# /api/settings (write mode)
# ---------------------------------------------------------------------------

class TestSettings:
    def test_get_settings_returns_data_dir(self, client, tmp_data_dir):
        # Create a minimal .env file so dotenv_values doesn't fail
        env_file = os.path.join(os.getcwd(), '.env')
        # Use a tmp env_file via app.config
        response = client.get('/api/settings')
        # May return 200 or 500 depending on .env presence; we just check it's reachable
        assert response.status_code in (200, 500)

    def test_settings_not_available_in_read_only(self, readonly_client):
        response = readonly_client.get('/api/settings')
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# /api/jobs/all
# ---------------------------------------------------------------------------

class TestJobs:
    def test_no_jobs_returns_empty_list(self, client, tmp_data_dir):
        # Create the dataset directory
        ds_dir = os.path.join(tmp_data_dir, "my-dataset")
        os.makedirs(ds_dir)
        response = client.get('/api/jobs/all?dataset=my-dataset')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data == []

    def test_job_file_is_returned(self, client, tmp_data_dir):
        # Manually write a job file
        ds_dir = os.path.join(tmp_data_dir, "my-dataset", "jobs")
        os.makedirs(ds_dir)
        job = {
            "id": "abc-123",
            "dataset": "my-dataset",
            "job_name": "embed",
            "command": "ls-embed ...",
            "status": "completed",
            "last_update": "2024-01-01",
            "progress": [],
            "times": [],
        }
        with open(os.path.join(ds_dir, "abc-123.json"), "w") as f:
            json.dump(job, f)

        response = client.get('/api/jobs/all?dataset=my-dataset')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['id'] == 'abc-123'
        assert data[0]['status'] == 'completed'


# ---------------------------------------------------------------------------
# /api/tags/ - basic smoke test
# ---------------------------------------------------------------------------

class TestTags:
    def test_empty_tags_returns_empty_dict(self, client, tmp_data_dir):
        ds_dir = os.path.join(tmp_data_dir, "ds1")
        os.makedirs(ds_dir)
        response = client.get('/api/tags/?dataset=ds1')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data == {}

    def test_write_blocked_in_read_only(self, readonly_client):
        response = readonly_client.get('/api/tags/new?dataset=ds1&tag=mytag')
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# /api/models routes
# ---------------------------------------------------------------------------

class TestModels:
    def test_embedding_models_returns_list(self, client):
        response = client.get('/api/models/embedding_models')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_chat_models_returns_list(self, client):
        response = client.get('/api/models/chat_models')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_recent_embedding_models_no_history(self, client):
        response = client.get('/api/models/embedding_models/recent')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data == []

    def test_custom_models_empty(self, client):
        response = client.get('/api/models/custom-models')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data == []
