"""Device / backend resolution for GPU acceleration (issue #63).

Central place that decides whether pipeline steps run on CPU or on an NVIDIA
GPU with the RAPIDS cuML/cuvs stack.  The rest of the codebase imports
:func:`resolve_device` and branches on the returned struct instead of probing
torch / cuml directly, so the fallback logic lives in exactly one place.

Design constraints (see CLAUDE.md):

* No heavy imports at module load time.  ``torch`` and ``cuml`` are imported
  *inside* :func:`resolve_device` so ``import latentscope`` stays light and the
  package keeps working when cuML is not installed.
* cuML/cuvs probing is guarded — a missing or broken RAPIDS install must never
  hard-fail; it simply degrades to CPU with a logged reason.
"""

from __future__ import annotations

from dataclasses import dataclass

from latentscope.util.configuration import get_device_preference


@dataclass
class DeviceResolution:
    """Result of :func:`resolve_device`.

    Attributes:
        torch_device: ``"cuda"`` or ``"cpu"`` — pass to ``torch``/model ``.to()``.
        use_cuml: whether cuML/cuvs accelerated algorithms should be used.
        reason: short human-readable explanation of the decision (logged).
    """

    torch_device: str
    use_cuml: bool
    reason: str

    # Allow dict-style access / unpacking for callers that prefer a mapping.
    def __getitem__(self, key):
        return getattr(self, key)

    def keys(self):
        return ("torch_device", "use_cuml", "reason")

    def to_dict(self) -> dict:
        return {
            "torch_device": self.torch_device,
            "use_cuml": self.use_cuml,
            "reason": self.reason,
        }


def _cuda_torch_available() -> bool:
    """Return True if torch reports an available CUDA device (guarded)."""
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _cuml_importable() -> bool:
    """Return True if the cuML/cuvs stack can be imported (guarded).

    Never raises: a missing, broken, or ABI-incompatible RAPIDS install just
    reports False so callers fall back to CPU.
    """
    try:
        import cuml  # noqa: F401

        return True
    except Exception:
        return False


def resolve_device(preferred: str | None = None) -> DeviceResolution:
    """Resolve the compute backend for a pipeline step.

    Args:
        preferred: explicit override of the ``LATENT_SCOPE_DEVICE`` env var.
            One of ``"cpu"``, ``"cuda"``, ``"auto"`` (case-insensitive).  When
            ``None`` (the default) the env preference is used.

    Returns:
        A :class:`DeviceResolution` describing the chosen backend.  It supports
        both attribute (``res.torch_device``) and mapping (``res["use_cuml"]``,
        ``dict(res)``) access.

    Semantics:
        * ``auto`` — use cuda+cuML when *both* torch-CUDA and cuML are
          available, otherwise CPU.
        * ``cpu`` — force CPU / no cuML regardless of hardware.
        * ``cuda`` — use CUDA torch; use cuML if importable, otherwise fall back
          (with a logged warning) rather than hard-failing.
    """
    pref = (preferred if preferred is not None else get_device_preference()) or "auto"
    pref = pref.strip().lower()
    if pref not in ("cpu", "cuda", "auto"):
        pref = "auto"

    if pref == "cpu":
        resolution = DeviceResolution(
            torch_device="cpu",
            use_cuml=False,
            reason="LATENT_SCOPE_DEVICE=cpu (forced CPU)",
        )
    elif pref == "cuda":
        cuda_ok = _cuda_torch_available()
        cuml_ok = _cuml_importable()
        if not cuda_ok:
            resolution = DeviceResolution(
                torch_device="cpu",
                use_cuml=False,
                reason="LATENT_SCOPE_DEVICE=cuda requested but torch CUDA unavailable; "
                "falling back to CPU",
            )
        elif cuml_ok:
            resolution = DeviceResolution(
                torch_device="cuda",
                use_cuml=True,
                reason="LATENT_SCOPE_DEVICE=cuda; torch CUDA + cuML available",
            )
        else:
            resolution = DeviceResolution(
                torch_device="cuda",
                use_cuml=False,
                reason="LATENT_SCOPE_DEVICE=cuda; torch CUDA available but cuML not "
                "importable; using GPU torch with CPU clustering/UMAP",
            )
    else:  # auto
        cuda_ok = _cuda_torch_available()
        cuml_ok = _cuml_importable()
        if cuda_ok and cuml_ok:
            resolution = DeviceResolution(
                torch_device="cuda",
                use_cuml=True,
                reason="auto: torch CUDA + cuML available",
            )
        elif cuda_ok:
            resolution = DeviceResolution(
                torch_device="cuda",
                use_cuml=False,
                reason="auto: torch CUDA available, cuML not importable; using GPU "
                "torch with CPU clustering/UMAP",
            )
        else:
            resolution = DeviceResolution(
                torch_device="cpu",
                use_cuml=False,
                reason="auto: no GPU/cuML available; using CPU",
            )

    # Log the decision via the project's convention (scripts print to stdout,
    # which the job runner captures line-by-line).
    print(
        f"resolve_device: backend={resolution.torch_device} "
        f"use_cuml={resolution.use_cuml} ({resolution.reason})"
    )
    return resolution
