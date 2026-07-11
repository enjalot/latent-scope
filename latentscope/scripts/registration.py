"""Pure-numpy helpers for incremental and aligned UMAP workflows (issue #142).

These functions have no dependency beyond numpy so they can be unit tested
without running any real UMAP fits:

- ``umeyama_2d`` / ``apply_similarity`` — least-squares 2D similarity
  registration (rotation + uniform scale + translation, reflection allowed),
  used by ``ls-umap --register-to`` to anchor a refit layout onto a
  previously published one.
- ``register_layout`` — register a new layout onto a target layout via their
  shared index prefix.
- ``prefix_relations`` — AlignedUMAP relations for growing (append-only)
  embedding windows.
- ``apply_normalization`` — map raw UMAP coordinates into the [-1, 1] frame
  defined by a previous fit's min/max values, used by
  ``ls-umap --transform-from``.
"""
import numpy as np


def umeyama_2d(src, dst):
    """Least-squares similarity transform mapping ``src`` points onto ``dst``.

    Solves for scale ``c``, orthogonal matrix ``R`` (rotation, reflection
    allowed) and translation ``t`` minimizing ``||(c * src @ R.T + t) - dst||``
    (Umeyama 1991, without the det(R)=+1 constraint so reflections are
    recovered too).

    Parameters
    ----------
    src, dst : array-like of shape (n, 2), n >= 2, rows in correspondence.

    Returns
    -------
    (c, R, t) : float, (2, 2) ndarray, (2,) ndarray
        such that ``dst ≈ c * src @ R.T + t``.
    """
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    if src.shape != dst.shape or src.ndim != 2 or src.shape[1] != 2:
        raise ValueError(f"expected matching (n, 2) arrays, got {src.shape} and {dst.shape}")
    if src.shape[0] < 2:
        raise ValueError("need at least 2 shared points to compute a similarity transform")

    mu_src = src.mean(axis=0)
    mu_dst = dst.mean(axis=0)
    src_c = src - mu_src
    dst_c = dst - mu_dst

    var_src = (src_c ** 2).sum() / src.shape[0]
    if var_src == 0:
        raise ValueError("source points are all identical; similarity transform is undefined")

    cov = dst_c.T @ src_c / src.shape[0]
    U, D, Vt = np.linalg.svd(cov)
    R = U @ Vt  # unconstrained orthogonal: reflections allowed
    c = D.sum() / var_src
    t = mu_dst - c * (R @ mu_src)
    return c, R, t


def apply_similarity(points, c, R, t):
    """Apply a similarity transform ``(c, R, t)`` to an (n, 2) point array."""
    points = np.asarray(points, dtype=np.float64)
    return c * points @ np.asarray(R, dtype=np.float64).T + np.asarray(t, dtype=np.float64)


def register_layout(new_layout, target_layout):
    """Register ``new_layout`` onto ``target_layout`` via their shared prefix.

    Rows are assumed aligned by index (append-only datasets), so the shared
    rows are ``range(min(len(target), len(new)))``. The similarity transform is
    fit on that prefix and applied to ALL points of ``new_layout``.

    Returns
    -------
    (registered, (c, R, t)) : the transformed copy of ``new_layout`` (float64)
        and the transform parameters that produced it.
    """
    new_layout = np.asarray(new_layout)
    target_layout = np.asarray(target_layout)
    n_shared = min(new_layout.shape[0], target_layout.shape[0])
    c, R, t = umeyama_2d(new_layout[:n_shared], target_layout[:n_shared])
    return apply_similarity(new_layout, c, R, t), (c, R, t)


def prefix_relations(lengths):
    """AlignedUMAP relations for a growing (append-only) series of windows.

    Relation i -> i+1 maps the shared index prefix
    ``{j: j for j in range(min(lengths[i], lengths[i+1]))}``. For equal-length
    windows this is identical to the old identity relations.
    """
    return [
        {j: j for j in range(min(lengths[i], lengths[i + 1]))}
        for i in range(len(lengths) - 1)
    ]


def apply_normalization(coords, min_values, max_values):
    """Map raw UMAP coords into the [-1, 1] frame of a previous fit.

    Uses the same per-axis formula the umapper applies at fit time, but with
    the SOURCE fit's stored min/max so new points land in the same frame as
    the old ones (they may fall slightly outside [-1, 1]).
    """
    coords = np.asarray(coords, dtype=np.float64)
    min_values = np.asarray(min_values, dtype=np.float64)
    max_values = np.asarray(max_values, dtype=np.float64)
    scaled = (coords - min_values) / (max_values - min_values)
    return 2 * scaled - 1


def count_out_of_frame(coords, lo=-1.0, hi=1.0):
    """Number of points with any coordinate outside [lo, hi]."""
    coords = np.asarray(coords)
    return int(np.any((coords < lo) | (coords > hi), axis=1).sum())
