"""Tests for latentscope.util.configuration."""
import os

import pytest

# ---------------------------------------------------------------------------
# get_data_dir
# ---------------------------------------------------------------------------

class TestGetDataDir:
    def test_raises_when_env_not_set(self, monkeypatch):
        monkeypatch.delenv('LATENT_SCOPE_DATA', raising=False)
        # load_dotenv() finds the project .env via the source-file path, not cwd,
        # so mock it out to ensure the env variable stays absent.
        monkeypatch.setattr('latentscope.util.configuration._load_dotenv', lambda *a, **kw: None)
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
            set_cohere_key,
            set_mistral_key,
            set_openai_key,
            set_together_key,
            set_voyage_key,
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


# ---------------------------------------------------------------------------
# LATENT_SCOPE_NO_DOTENV opt-out
# ---------------------------------------------------------------------------

class TestNoDotenvOptOut:
    def test_dotenv_disabled_when_flag_set(self, monkeypatch):
        monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
        from latentscope.util.configuration import _dotenv_disabled
        assert _dotenv_disabled() is True

    def test_dotenv_enabled_by_default(self, monkeypatch):
        monkeypatch.delenv("LATENT_SCOPE_NO_DOTENV", raising=False)
        from latentscope.util.configuration import _dotenv_disabled
        assert _dotenv_disabled() is False

    def test_dotenv_enabled_when_flag_not_one(self, monkeypatch):
        monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "0")
        from latentscope.util.configuration import _dotenv_disabled
        assert _dotenv_disabled() is False

    def test_load_dotenv_skipped_when_opted_out(self, monkeypatch):
        """When LATENT_SCOPE_NO_DOTENV=1, _load_dotenv should not call load_dotenv."""
        monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
        calls = []
        monkeypatch.setattr(
            'latentscope.util.configuration.load_dotenv',
            lambda *a, **kw: calls.append(1),
        )
        from latentscope.util.configuration import _load_dotenv
        _load_dotenv()
        assert len(calls) == 0

    def test_load_dotenv_called_when_not_opted_out(self, monkeypatch):
        """When LATENT_SCOPE_NO_DOTENV is unset, _load_dotenv delegates to load_dotenv."""
        monkeypatch.delenv("LATENT_SCOPE_NO_DOTENV", raising=False)
        calls = []
        monkeypatch.setattr(
            'latentscope.util.configuration.load_dotenv',
            lambda *a, **kw: calls.append(1),
        )
        from latentscope.util.configuration import _load_dotenv
        _load_dotenv()
        assert len(calls) == 1

    def test_safe_set_key_warns_on_readonly(self, tmp_path, monkeypatch):
        """_safe_set_key emits a warning instead of raising on permission error."""
        import errno as _errno

        from latentscope.util.configuration import _safe_set_key

        def _raise_permission_error(*args, **kwargs):
            raise OSError(_errno.EACCES, "Permission denied")

        monkeypatch.setattr("latentscope.util.configuration.set_key", _raise_permission_error)
        env_file = str(tmp_path / ".env")
        with pytest.warns(UserWarning, match="Could not write"):
            _safe_set_key(env_file, "FOO", "bar")

    def test_safe_set_key_reraises_non_permission_oserror(self, tmp_path, monkeypatch):
        """_safe_set_key re-raises OSError that is not a permission/read-only error."""
        import errno as _errno

        from latentscope.util.configuration import _safe_set_key

        def _raise_other_oserror(*args, **kwargs):
            raise OSError(_errno.ENOSPC, "No space left on device")

        monkeypatch.setattr("latentscope.util.configuration.set_key", _raise_other_oserror)
        env_file = str(tmp_path / ".env")
        with pytest.raises(OSError, match="No space left on device"):
            _safe_set_key(env_file, "FOO", "bar")

    def test_get_data_dir_works_with_no_dotenv(self, monkeypatch):
        """get_data_dir should work when dotenv is disabled and env var is set."""
        monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
        monkeypatch.setenv("LATENT_SCOPE_DATA", "/some/path")
        from latentscope.util.configuration import get_data_dir
        assert get_data_dir() == "/some/path"
