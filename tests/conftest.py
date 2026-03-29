"""Shared pytest fixtures for latent-scope tests."""
import os
import tempfile

import pytest


@pytest.fixture
def tmp_data_dir(tmp_path):
    """A temporary directory that acts as the latent-scope data directory."""
    return str(tmp_path)


@pytest.fixture
def app(tmp_data_dir):
    """A Flask test application with a temporary data directory."""
    # Import here so that the module-level get_data_dir() call in the old code
    # is not triggered before we set up the environment.
    from latentscope.server.app import create_app

    application = create_app(data_dir=tmp_data_dir, read_only=False)
    application.config['TESTING'] = True
    return application


@pytest.fixture
def client(app):
    """A Flask test client."""
    return app.test_client()


@pytest.fixture
def readonly_app(tmp_data_dir):
    """A Flask test application in read-only mode."""
    from latentscope.server.app import create_app

    application = create_app(data_dir=tmp_data_dir, read_only=True)
    application.config['TESTING'] = True
    return application


@pytest.fixture
def readonly_client(readonly_app):
    return readonly_app.test_client()
