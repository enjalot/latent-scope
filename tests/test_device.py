"""CPU-fallback tests for latentscope.util.device.resolve_device (WP-H, #63).

This machine has no cuML installed, so every resolution must degrade to
``use_cuml=False``. The branch logic (auto / cuda / cpu, GPU-torch-without-cuML,
env override, bad-value coercion) is exercised deterministically by stubbing the
two guarded hardware probes so the tests never depend on whether torch reports a
CUDA device on the box they run on.
"""
import pytest

import latentscope.util.device as device_mod
from latentscope.util.device import DeviceResolution, resolve_device


@pytest.fixture(autouse=True)
def _no_dotenv(monkeypatch):
    # get_device_preference() loads .env; keep the workstation .env out of tests.
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    monkeypatch.delenv("LATENT_SCOPE_DEVICE", raising=False)


def _stub_probes(monkeypatch, cuda_ok, cuml_ok):
    monkeypatch.setattr(device_mod, "_cuda_torch_available", lambda: cuda_ok)
    monkeypatch.setattr(device_mod, "_cuml_importable", lambda: cuml_ok)


# ---------------------------------------------------------------------------
# Real-environment guarantee: no cuML installed => use_cuml is always False
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("pref", ["auto", "cuda", "cpu"])
def test_no_cuml_installed_never_uses_cuml(pref):
    """Locks the CPU-fallback guarantee on this box: with cuML absent, no
    preference can turn on use_cuml, and torch_device stays a sane value."""
    res = resolve_device(pref)
    assert res.use_cuml is False
    assert res.torch_device in ("cpu", "cuda")
    assert isinstance(res.reason, str) and res.reason


def test_cpu_is_always_cpu_no_cuml():
    res = resolve_device("cpu")
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


# ---------------------------------------------------------------------------
# Deterministic branch coverage via stubbed probes
# ---------------------------------------------------------------------------

def test_no_gpu_no_cuml_all_prefs_cpu(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=False, cuml_ok=False)
    for pref in ("auto", "cuda", "cpu"):
        res = resolve_device(pref)
        assert res.torch_device == "cpu"
        assert res.use_cuml is False


def test_auto_with_full_stack(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    res = resolve_device("auto")
    assert res.torch_device == "cuda"
    assert res.use_cuml is True


def test_auto_gpu_torch_without_cuml(monkeypatch):
    """torch sees a GPU but cuML is missing -> GPU torch, CPU clustering/UMAP."""
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=False)
    res = resolve_device("auto")
    assert res.torch_device == "cuda"
    assert res.use_cuml is False


def test_cuda_requested_but_no_torch_cuda_falls_back(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=False, cuml_ok=True)
    res = resolve_device("cuda")
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


def test_cuda_with_cuml(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    res = resolve_device("cuda")
    assert res.torch_device == "cuda"
    assert res.use_cuml is True


def test_cuda_without_cuml_keeps_gpu_torch(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=False)
    res = resolve_device("cuda")
    assert res.torch_device == "cuda"
    assert res.use_cuml is False


def test_cpu_forced_even_with_full_stack(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    res = resolve_device("cpu")
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


# ---------------------------------------------------------------------------
# Env override + bad-value coercion
# ---------------------------------------------------------------------------

def test_env_var_is_honored(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=False, cuml_ok=False)
    monkeypatch.setenv("LATENT_SCOPE_DEVICE", "cpu")
    res = resolve_device(None)  # read env preference
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


def test_env_var_cuda_honored(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    monkeypatch.setenv("LATENT_SCOPE_DEVICE", "CUDA")  # case-insensitive
    res = resolve_device(None)
    assert res.torch_device == "cuda"
    assert res.use_cuml is True


def test_explicit_arg_overrides_env(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    monkeypatch.setenv("LATENT_SCOPE_DEVICE", "cuda")
    res = resolve_device("cpu")  # explicit arg wins
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


@pytest.mark.parametrize("bad", ["gpu", "", "xla", "  ", "tpu"])
def test_bad_preference_coerces_to_auto(monkeypatch, bad):
    # auto with no GPU/cuML -> cpu; the point is it does not raise / stays sane.
    _stub_probes(monkeypatch, cuda_ok=False, cuml_ok=False)
    res = resolve_device(bad)
    assert res.torch_device == "cpu"
    assert res.use_cuml is False


def test_case_insensitive_and_whitespace(monkeypatch):
    _stub_probes(monkeypatch, cuda_ok=True, cuml_ok=True)
    res = resolve_device("  AuTo  ")
    assert res.torch_device == "cuda"
    assert res.use_cuml is True


# ---------------------------------------------------------------------------
# Guarded probes never raise, even when the import machinery explodes
# ---------------------------------------------------------------------------

def test_cuml_probe_swallows_import_errors(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def boom(name, *args, **kwargs):
        if name == "cuml" or name.startswith("cuml."):
            raise RuntimeError("broken RAPIDS ABI")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", boom)
    # must not raise, just report False
    assert device_mod._cuml_importable() is False


def test_no_heavy_imports_at_module_top_level():
    """CONTRACT: importing the module must not drag in torch/cuml."""
    import ast
    import inspect

    src = inspect.getsource(device_mod)
    tree = ast.parse(src)
    top_level_imports = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            top_level_imports += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            top_level_imports.append(node.module or "")
    joined = " ".join(top_level_imports)
    assert "torch" not in joined
    assert "cuml" not in joined


# ---------------------------------------------------------------------------
# DeviceResolution mapping / dataclass surface (CONTRACT §1)
# ---------------------------------------------------------------------------

def test_device_resolution_mapping_access():
    res = DeviceResolution(torch_device="cpu", use_cuml=False, reason="because")
    # attribute access
    assert res.torch_device == "cpu"
    # mapping access
    assert res["torch_device"] == "cpu"
    assert res["use_cuml"] is False
    # dict(res) and **res unpacking rely on keys() + __getitem__
    assert dict(res) == {"torch_device": "cpu", "use_cuml": False, "reason": "because"}
    assert res.to_dict() == dict(res)

    def _consume(torch_device, use_cuml, reason):
        return (torch_device, use_cuml, reason)

    assert _consume(**res) == ("cpu", False, "because")


def test_resolve_device_returns_dataclass_with_all_fields():
    res = resolve_device("cpu")
    assert isinstance(res, DeviceResolution)
    assert set(res.keys()) == {"torch_device", "use_cuml", "reason"}


def test_decision_is_logged(capsys):
    resolve_device("cpu")
    out = capsys.readouterr().out
    assert "resolve_device: backend=cpu use_cuml=False" in out
