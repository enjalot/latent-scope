"""Pretrained basemap projection (ls-basemap) and procrustes umap alignment
(ls-umap-align).

Uses tiny real torch checkpoints (the basemap nets are small MLPs) and the
fake embedding provider from the e2e tests, so no model downloads or GPU are
needed.
"""
import json
import os

import numpy as np
import pandas as pd
import pytest

torch = pytest.importorskip("torch")

from latentscope.scripts.basemap import _strip_model_prefix, basemapper
from latentscope.scripts.basemap_nets import (
    MLP,
    ResidualBottleneckMLP,
    UMAPNet,
    load_basemap_checkpoint,
)
from latentscope.scripts.umapper import procrustes_align
from tests.test_pipeline_e2e import DIM, FakeEmbedProvider, make_input_df

N_ROWS = 120  # make_input_df(): 3 topics x 40 rows


# ---------------------------------------------------------------------------
# checkpoint loading (both lineages)
# ---------------------------------------------------------------------------

def _save_umapnet_checkpoint(path, d_in=DIM, hidden_dim=16):
    model = UMAPNet(d_in=d_in, hidden_dim=hidden_dim, n_layers=2)
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {"d_in": d_in, "hidden_dim": hidden_dim, "n_layers": 2, "d_out": 2},
    }, path)
    return model


def test_load_umapnet_lineage(tmp_path):
    path = str(tmp_path / "umapnet.pt")
    original = _save_umapnet_checkpoint(path)
    model, info = load_basemap_checkpoint(path)
    assert info["arch"] == "umapnet"
    assert info["d_in"] == DIM
    X = torch.randn(8, DIM)
    with torch.no_grad():
        assert torch.allclose(model(X), original(X))


@pytest.mark.parametrize("arch,cls", [
    ("mlp", MLP), ("residual_bottleneck", ResidualBottleneckMLP),
])
def test_load_parametric_umap_lineage(tmp_path, arch, cls):
    original = cls(DIM, 16, 2, 2)
    path = str(tmp_path / f"{arch}.pt")
    torch.save({
        "model_state_dict": original.state_dict(),
        "architecture": arch,
        # input_dim intentionally omitted: exercised the state-dict inference
        "hidden_dim": 16,
        "n_layers": 2,
        "n_components": 2,
    }, path)
    model, info = load_basemap_checkpoint(path)
    assert info["arch"] == arch
    assert info["d_in"] == DIM
    X = torch.randn(8, DIM)
    with torch.no_grad():
        assert torch.allclose(model(X), original(X))


def test_load_rejects_unknown_format(tmp_path):
    path = str(tmp_path / "bad.pt")
    torch.save({"model_state_dict": {}}, path)
    with pytest.raises(ValueError):
        load_basemap_checkpoint(path)


def test_strip_model_prefix():
    assert _strip_model_prefix("🤗-sentence-transformers___all-MiniLM-L6-v2") == \
        "sentence-transformers/all-MiniLM-L6-v2"
    assert _strip_model_prefix("transformers-nomic-ai___nomic-embed-text-v1.5") == \
        "nomic-ai/nomic-embed-text-v1.5"
    assert _strip_model_prefix("plain-model") == "plain-model"


# ---------------------------------------------------------------------------
# basemapper end-to-end on a fake-embedded dataset
# ---------------------------------------------------------------------------

@pytest.fixture
def embedded_dataset(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")

    import latentscope.scripts.embed as embed_mod
    monkeypatch.setattr(embed_mod, "get_embedding_model",
                        lambda model_id: FakeEmbedProvider())

    from latentscope.scripts.embed import embed
    from latentscope.scripts.ingest import ingest

    dataset_id = "basemapped"
    ingest(dataset_id, make_input_df(), text_column="text")
    embed(dataset_id, "text", "fake-test-model", prefix=None, rerun=None,
          dimensions=None, batch_size=50)
    return tmp_data_dir, dataset_id


def test_basemapper_with_checkpoint_path(embedded_dataset, tmp_path):
    data_dir, dataset_id = embedded_dataset
    path = str(tmp_path / "model.pt")
    _save_umapnet_checkpoint(path)

    umap_id = basemapper(dataset_id, "embedding-001", path)

    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    coords = pd.read_parquet(os.path.join(umap_dir, f"{umap_id}.parquet"))
    assert list(coords.columns) == ["x", "y"]
    assert len(coords) == N_ROWS
    # dataset frame: min-max normalized into [-1, 1]
    assert coords.to_numpy().min() >= -1.0001 and coords.to_numpy().max() <= 1.0001

    with open(os.path.join(umap_dir, f"{umap_id}.json")) as f:
        meta = json.load(f)
    assert meta["embedding_id"] == "embedding-001"
    assert meta["basemap"]["basemap_id"] == "model.pt"
    assert meta["basemap"]["frame"] == "dataset"
    assert os.path.exists(os.path.join(umap_dir, f"{umap_id}.png"))


def test_basemapper_registry_compat_and_canonical_frame(embedded_dataset, tmp_path, monkeypatch):
    data_dir, dataset_id = embedded_dataset
    path = str(tmp_path / "model.pt")
    _save_umapnet_checkpoint(path)

    entry = {
        "id": "basemap-test",
        "name": "test basemap",
        "checkpoint": path,
        "embedding_model": "some/other-model",
        "dimensions": DIM,
        "extent": {"min_values": [-4.0, -4.0], "max_values": [4.0, 4.0]},
    }
    import latentscope.models
    monkeypatch.setattr(latentscope.models, "get_basemap_model_dict",
                        lambda basemap_id: entry)

    # the fake embedding was made with 'fake-test-model', not 'some/other-model'
    with pytest.raises(ValueError, match="expects"):
        basemapper(dataset_id, "embedding-001", "basemap-test")

    entry["embedding_model"] = "fake-test-model"
    umap_id = basemapper(dataset_id, "embedding-001", "basemap-test")

    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    with open(os.path.join(umap_dir, f"{umap_id}.json")) as f:
        meta = json.load(f)
    assert meta["basemap"]["frame"] == "canonical"
    assert meta["min_values"] == [-4.0, -4.0]
    assert meta["max_values"] == [4.0, 4.0]
    # canonical frame maps the registry extent to [-1, 1]; points may exceed it
    coords = pd.read_parquet(os.path.join(umap_dir, f"{umap_id}.parquet")).to_numpy()
    model, _ = load_basemap_checkpoint(path)
    from latentscope.util.embedding_store import load_embeddings
    with torch.no_grad():
        raw = model(torch.from_numpy(
            np.asarray(load_embeddings(data_dir, dataset_id, "embedding-001"),
                       dtype=np.float32))).numpy()
    expected = 2 * (raw - (-4.0)) / 8.0 - 1
    assert np.allclose(coords, expected, atol=1e-5)


def test_basemapper_prompt_convention_check(embedded_dataset, tmp_path, monkeypatch):
    data_dir, dataset_id = embedded_dataset
    path = str(tmp_path / "model.pt")
    _save_umapnet_checkpoint(path)

    entry = {
        "id": "basemap-rawprompt", "name": "raw-prompt basemap", "checkpoint": path,
        "embedding_model": "fake-test-model", "dimensions": DIM,
        "extent": None, "embedding_prompt": "raw",
    }
    import latentscope.models
    monkeypatch.setattr(latentscope.models, "get_basemap_model_dict", lambda _: entry)

    meta_path = os.path.join(data_dir, dataset_id, "embeddings", "embedding-001.json")
    with open(meta_path) as f:
        meta = json.load(f)

    # embedding carries a model-applied prompt -> rejected
    meta["applied_prompt"] = "Document: "
    with open(meta_path, "w") as f:
        json.dump(meta, f)
    with pytest.raises(ValueError, match="prompt-free"):
        basemapper(dataset_id, "embedding-001", "basemap-rawprompt")

    # prompt-free embedding -> accepted
    meta["applied_prompt"] = ""
    meta["prefix"] = ""
    with open(meta_path, "w") as f:
        json.dump(meta, f)
    assert basemapper(dataset_id, "embedding-001", "basemap-rawprompt")


def test_basemapper_rejects_dimension_mismatch(embedded_dataset, tmp_path):
    _, dataset_id = embedded_dataset
    path = str(tmp_path / "model.pt")
    _save_umapnet_checkpoint(path, d_in=DIM * 2)
    with pytest.raises(ValueError, match="dimension"):
        basemapper(dataset_id, "embedding-001", path)


# ---------------------------------------------------------------------------
# procrustes alignment of one existing umap onto another
# ---------------------------------------------------------------------------

def _rotation(theta):
    return np.array([[np.cos(theta), -np.sin(theta)],
                     [np.sin(theta), np.cos(theta)]])


def _write_umap(umap_dir, umap_id, coords, extra_meta=None):
    os.makedirs(umap_dir, exist_ok=True)
    pd.DataFrame(np.asarray(coords, dtype=np.float32), columns=["x", "y"]).to_parquet(
        os.path.join(umap_dir, f"{umap_id}.parquet"))
    meta = {"id": umap_id, "embedding_id": "embedding-001", "neighbors": 25,
            "min_dist": 0.1, "min_values": [-5.0, -5.0], "max_values": [5.0, 5.0]}
    meta.update(extra_meta or {})
    with open(os.path.join(umap_dir, f"{umap_id}.json"), "w") as f:
        json.dump(meta, f)


def test_procrustes_align_recovers_target(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    dataset_id = "aligntest"
    umap_dir = os.path.join(tmp_data_dir, dataset_id, "umaps")

    rng = np.random.default_rng(9)
    target = rng.uniform(-1, 1, size=(80, 2))
    # source is the target rotated/scaled/shifted: procrustes should undo it
    source = 0.5 * target @ _rotation(0.9).T + np.array([0.3, -0.2])
    _write_umap(umap_dir, "umap-001", target)
    _write_umap(umap_dir, "umap-002", source,
                extra_meta={"basemap": {"basemap_id": "basemap-test"}})

    umap_id, disparity = procrustes_align(dataset_id, "umap-002", "umap-001")

    assert umap_id == "umap-003"
    assert disparity < 1e-10
    aligned = pd.read_parquet(os.path.join(umap_dir, "umap-003.parquet")).to_numpy()
    assert np.allclose(aligned, target, atol=1e-5)

    with open(os.path.join(umap_dir, "umap-003.json")) as f:
        meta = json.load(f)
    assert meta["aligned_from"] == "umap-002"
    assert meta["registered_to"] == "umap-001"
    assert meta["procrustes_disparity"] == disparity
    # frame carries over from the target; basemap provenance from the source
    assert meta["min_values"] == [-5.0, -5.0]
    assert meta["basemap"]["basemap_id"] == "basemap-test"
    assert os.path.exists(os.path.join(umap_dir, "umap-003.png"))


# ---------------------------------------------------------------------------
# current (kernel-era) checkpoints: run-directory packs, derived frames,
# density underlays, provenance
# ---------------------------------------------------------------------------

def _save_kernel_era_checkpoint(path, d_in=DIM, hidden_dim=16):
    """A parametric_umap checkpoint with the training knobs current
    latent-basemap runs record next to the weights."""
    model = ResidualBottleneckMLP(d_in, hidden_dim, 2, 3)
    torch.save({
        "model_state_dict": model.state_dict(),
        "architecture": "residual_bottleneck",
        "input_dim": d_in, "hidden_dim": hidden_dim, "n_layers": 3, "n_components": 2,
        "n_neighbors": 15, "a": 1.9328, "b": 0.7905,
        "low_dim_kernel": "umap", "kernel_alpha": 1.0,
        "fneg_weight": 1.0, "fneg_lo": 0.1, "fneg_hi": 0.4,
        "density_weight": 0.0,
    }, path)
    return model


def _make_run_dir(tmp_path, name="umap-md000-x4-fneg10", n=500, density=True):
    """A latent-basemap run directory: checkpoint + coordinates + density render."""
    run_dir = tmp_path / name
    run_dir.mkdir()
    checkpoint = str(run_dir / "model.pt")
    _save_kernel_era_checkpoint(checkpoint)
    rng = np.random.default_rng(3)
    coords = rng.normal(size=(n, 2)).astype(np.float32) * 10
    np.save(run_dir / "coordinates.npy", coords)
    if density:
        import matplotlib.image as mpimg
        mpimg.imsave(str(run_dir / "density.png"), np.zeros((16, 16, 4), dtype=np.float32))
    (run_dir / "summary.json").write_text(json.dumps({"arm": name}))
    return checkpoint, coords


def test_load_records_kernel_era_provenance(tmp_path):
    path = str(tmp_path / "model.pt")
    _save_kernel_era_checkpoint(path)
    _, info = load_basemap_checkpoint(path)
    assert info["arch"] == "residual_bottleneck"
    # kernel/fneg knobs do not touch inference but identify which map this is
    assert info["provenance"]["low_dim_kernel"] == "umap"
    assert info["provenance"]["kernel_alpha"] == 1.0
    assert info["provenance"]["fneg_weight"] == 1.0
    assert info["provenance"]["a"] == 1.9328


def test_extent_from_coordinates_matches_padded_percentile_box(tmp_path):
    from latentscope.scripts.basemap import (
        EXTENT_PAD,
        EXTENT_PERCENTILES,
        _extent_from_coordinates,
    )
    rng = np.random.default_rng(11)
    coords = rng.normal(size=(5000, 2)).astype(np.float32)
    path = str(tmp_path / "coordinates.npy")
    np.save(path, coords)

    mins, maxs = _extent_from_coordinates(path)
    lo, hi = np.percentile(coords.astype(np.float64), EXTENT_PERCENTILES, axis=0)
    pad = EXTENT_PAD * (hi - lo)
    assert np.allclose(mins, lo - pad)
    assert np.allclose(maxs, hi + pad)


def test_basemapper_uses_run_directory_pack(embedded_dataset, tmp_path):
    """A checkpoint given by path picks up its run directory's coordinates
    (canonical frame) and density render (underlay) with no registry entry."""
    data_dir, dataset_id = embedded_dataset
    checkpoint, coords = _make_run_dir(tmp_path)

    umap_id = basemapper(dataset_id, "embedding-001", checkpoint)

    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    with open(os.path.join(umap_dir, f"{umap_id}.json")) as f:
        meta = json.load(f)
    # the run directory names the map, not the (always "model.pt") file
    assert meta["basemap"]["basemap_id"] == "umap-md000-x4-fneg10"
    assert meta["basemap"]["frame"] == "canonical"
    assert meta["basemap"]["extent_source"] == "coordinates"
    assert meta["basemap"]["density_png"].endswith("density.png")
    assert meta["basemap"]["provenance"]["low_dim_kernel"] == "umap"
    # the frame is the map's own padded percentile box
    from latentscope.scripts.basemap import _extent_from_coordinates
    mins, maxs = _extent_from_coordinates(str(tmp_path / "umap-md000-x4-fneg10"
                                              / "coordinates.npy"))
    assert np.allclose(meta["min_values"], mins)
    assert np.allclose(meta["max_values"], maxs)
    assert os.path.exists(os.path.join(umap_dir, f"{umap_id}.png"))


def test_basemapper_no_underlay_flag_and_legacy_extent(embedded_dataset, tmp_path, monkeypatch):
    from latentscope.scripts.basemap import _underlay_aligns
    data_dir, dataset_id = embedded_dataset
    checkpoint, _ = _make_run_dir(tmp_path)

    umap_id = basemapper(dataset_id, "embedding-001", checkpoint, underlay=False)
    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    with open(os.path.join(umap_dir, f"{umap_id}.json")) as f:
        assert json.load(f)["basemap"]["density_png"] is None

    # a legacy registry extent (unpadded, from a separate reference sample) is
    # not the render's box, so no underlay is drawn against it
    assert not _underlay_aligns({"min_values": [-1, -1], "max_values": [1, 1],
                                 "percentiles": [0.1, 99.9]})
    assert _underlay_aligns({"min_values": [-1, -1], "max_values": [1, 1],
                             "percentiles": [0.1, 99.9], "pad": 0.02})


def test_basemapper_dataset_frame_when_no_pack(embedded_dataset, tmp_path):
    """A loose checkpoint with no artifacts beside it still projects, in the
    dataset's own frame."""
    data_dir, dataset_id = embedded_dataset
    checkpoint, _ = _make_run_dir(tmp_path, name="loose")
    os.remove(str(tmp_path / "loose" / "coordinates.npy"))
    os.remove(str(tmp_path / "loose" / "summary.json"))

    umap_id = basemapper(dataset_id, "embedding-001", checkpoint)
    umap_dir = os.path.join(data_dir, dataset_id, "umaps")
    with open(os.path.join(umap_dir, f"{umap_id}.json")) as f:
        meta = json.load(f)
    assert meta["basemap"]["basemap_id"] == "model.pt"
    assert meta["basemap"]["frame"] == "dataset"
    assert meta["basemap"]["density_png"] is None
