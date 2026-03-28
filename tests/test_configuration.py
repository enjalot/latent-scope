"""Tests for latentscope.util.configuration."""
import os
import pytest


# ---------------------------------------------------------------------------
# get_data_dir
# ---------------------------------------------------------------------------

class TestGetDataDir:
    def test_raises_when_env_not_set(self, monkeypatch, tmp_path):
        monkeypatch.delenv('LATENT_SCOPE_DATA', raising=False)
        # Change to a directory with no .env so dotenv doesn't find one
        monkeypatch.chdir(tmp_path)
        from latentscope.util.configuration import get_data_dir
        with pytest.raises(RuntimeError, match="LATENT_SCOPE_DATA"):
            get_data_dir()

    def test_returns_value_from_env(self, monkeypatch, tmp_path):
        monkeypatch.setenv('LATENT_SCOPE_DATA', str(tmp_path))
        from latentscope.util.configuration import get_data_dir
        assert get_data_dir() == str(tmp_path)


# ---------------------------------------------------------------------------
# update_data_dir
# ---------------------------------------------------------------------------

class TestUpdateDataDir:
    def test_creates_directory(self, tmp_path):
        from latentscope.util.configuration import update_data_dir
        new_dir = str(tmp_path / "latentscope-data")
        env_file = str(tmp_path / ".env")
        result = update_data_dir(new_dir, env_file=env_file)
        assert result == new_dir
        assert os.path.exists(new_dir)

    def test_expands_tilde(self, tmp_path, monkeypatch):
        from latentscope.util.configuration import update_data_dir
        home = str(tmp_path / "fakehome")
        os.makedirs(home, exist_ok=True)
        monkeypatch.setenv('HOME', home)
        env_file = str(tmp_path / ".env")
        result = update_data_dir("~/mydata", env_file=env_file)
        assert result == os.path.join(home, "mydata")

    def test_raises_without_directory(self, tmp_path, monkeypatch):
        monkeypatch.delenv('LATENT_SCOPE_DATA', raising=False)
        from latentscope.util.configuration import update_data_dir
        env_file = str(tmp_path / ".env")
        with pytest.raises(ValueError):
            update_data_dir("", env_file=env_file)

    def test_sets_env_variable(self, tmp_path):
        from latentscope.util.configuration import update_data_dir
        new_dir = str(tmp_path / "data")
        env_file = str(tmp_path / ".env")
        update_data_dir(new_dir, env_file=env_file)
        assert os.environ.get('LATENT_SCOPE_DATA') == new_dir


# ---------------------------------------------------------------------------
# set_api_key
# ---------------------------------------------------------------------------

class TestSetApiKey:
    def test_sets_known_key(self, tmp_path):
        from latentscope.util.configuration import set_api_key
        env_file = str(tmp_path / ".env")
        set_api_key("OPENAI_API_KEY", "test-key-123", env_file=env_file)
        assert os.environ.get('OPENAI_API_KEY') == "test-key-123"

    def test_raises_for_unknown_key(self, tmp_path):
        from latentscope.util.configuration import set_api_key
        env_file = str(tmp_path / ".env")
        with pytest.raises(ValueError, match="Unknown API key"):
            set_api_key("FAKE_KEY", "value", env_file=env_file)

    def test_writes_to_env_file(self, tmp_path):
        from latentscope.util.configuration import set_api_key
        env_file = str(tmp_path / ".env")
        set_api_key("VOYAGE_API_KEY", "voyage-abc", env_file=env_file)
        with open(env_file) as f:
            contents = f.read()
        assert "VOYAGE_API_KEY" in contents

    def test_backward_compat_setters(self, tmp_path):
        from latentscope.util.configuration import (
            set_openai_key, set_voyage_key, set_together_key,
            set_cohere_key, set_mistral_key,
        )
        env_file = str(tmp_path / ".env")
        set_openai_key("openai-val", env_file=env_file)
        assert os.environ.get('OPENAI_API_KEY') == "openai-val"
        set_voyage_key("voyage-val", env_file=env_file)
        assert os.environ.get('VOYAGE_API_KEY') == "voyage-val"
        set_together_key("together-val", env_file=env_file)
        assert os.environ.get('TOGETHER_API_KEY') == "together-val"
        set_cohere_key("cohere-val", env_file=env_file)
        assert os.environ.get('COHERE_API_KEY') == "cohere-val"
        set_mistral_key("mistral-val", env_file=env_file)
        assert os.environ.get('MISTRAL_API_KEY') == "mistral-val"


# ---------------------------------------------------------------------------
# get_supported_api_keys
# ---------------------------------------------------------------------------

def test_get_supported_api_keys():
    from latentscope.util.configuration import get_supported_api_keys
    keys = get_supported_api_keys()
    assert isinstance(keys, list)
    assert "OPENAI_API_KEY" in keys
    assert "VOYAGE_API_KEY" in keys
    assert "MISTRAL_API_KEY" in keys
