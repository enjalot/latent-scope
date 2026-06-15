"""Tests for the representative-image sprite-atlas step + serving endpoints.

generate_sprite_atlas() paints one WebP sheet per heatmap resolution, sampling
a representative image into each grid cell; the /atlas endpoints serve them.
"""

import io
import json
import os

import pandas as pd
import pytest
from PIL import Image

DATASET_ID = "atlas-ds"
SCOPE_ID = "scopes-001"
NUM_TILES = 64
CELL = 8  # small cells keep the test sheet tiny (64*8 = 512px)


def make_png_bytes(color, size=(40, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def cell_index(col, row, num_tiles=NUM_TILES):
    return row * num_tiles + col


def cell_center_px(col, row, num_tiles=NUM_TILES, cell=CELL):
    """Pixel at the center of grid cell (col,row) in the saved sheet, accounting
    for the vertical flip the generator bakes in."""
    x = col * cell + cell // 2
    y = (num_tiles - 1 - row) * cell + cell // 2
    return x, y


def approx_color(pixel, expected, tol=12):
    """WebP is lossy, so compare RGB channels within a tolerance."""
    return all(abs(a - b) <= tol for a, b in zip(pixel[:3], expected))


@pytest.fixture
def atlas_dataset(tmp_data_dir, monkeypatch):
    """A dataset + scope-input parquet with images placed in known cells.

    - cell (2,3): RED then GREEN  -> exercises samples depth
    - cell (5,5): BLUE (single)   -> sheet 1 stays transparent here
    - a deleted RED in cell (10,10) -> must be skipped
    - a null image                -> recorded as no-op
    """
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    ds_dir = os.path.join(tmp_data_dir, DATASET_ID)
    os.makedirs(os.path.join(ds_dir, "scopes"))
    meta = {
        "id": DATASET_ID,
        "length": 5,
        "column_metadata": {"image": {"type": "image", "image": True}},
    }
    with open(os.path.join(ds_dir, "meta.json"), "w") as f:
        json.dump(meta, f)

    rows = [
        {"image": make_png_bytes((255, 0, 0)), "c64": cell_index(2, 3), "deleted": False},
        {"image": make_png_bytes((0, 255, 0)), "c64": cell_index(2, 3), "deleted": False},
        {"image": make_png_bytes((0, 0, 255)), "c64": cell_index(5, 5), "deleted": False},
        {"image": make_png_bytes((255, 0, 0)), "c64": cell_index(10, 10), "deleted": True},
        {"image": None, "c64": cell_index(20, 20), "deleted": False},
    ]
    df = pd.DataFrame({
        "image": [r["image"] for r in rows],
        "tile_index_64": [r["c64"] for r in rows],
        "tile_index_128": [r["c64"] for r in rows],  # value unused by these tests
        "deleted": [r["deleted"] for r in rows],
    })
    df.to_parquet(os.path.join(ds_dir, "scopes", f"{SCOPE_ID}-input.parquet"))
    return DATASET_ID


def load_sheet(tmp_data_dir, dataset, scope, column, res, cell, sheet):
    from latentscope.scripts.sprite_atlas import (
        atlas_root,
        atlas_sheet_name,
        atlas_subdir,
    )

    path = os.path.join(
        atlas_root(tmp_data_dir, dataset, scope, column),
        atlas_subdir(res, cell),
        atlas_sheet_name(sheet),
    )
    return Image.open(path).convert("RGBA")


# ---------------------------------------------------------------------------
# generator
# ---------------------------------------------------------------------------

def test_atlas_sheet_dimensions_and_manifest(tmp_data_dir, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, samples=2)

    from latentscope.scripts.sprite_atlas import atlas_manifest_name, atlas_root
    manifest_path = os.path.join(
        atlas_root(tmp_data_dir, atlas_dataset, SCOPE_ID, "image"),
        atlas_manifest_name(),
    )
    with open(manifest_path) as f:
        manifest = json.load(f)

    assert manifest["complete"] is True
    assert manifest["cell_size"] == CELL
    assert manifest["samples"] == 2
    assert manifest["domain"] == [-1, 1]
    assert len(manifest["resolutions"]) == 1
    entry = manifest["resolutions"][0]
    assert entry["num_tiles"] == 64
    assert entry["atlas_px"] == 64 * CELL
    # two cells have at least one (non-deleted, decodable) image
    assert entry["filled_cells"] == 2
    assert len(entry["sheets"]) == 2

    sheet0 = load_sheet(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, CELL, 0)
    assert sheet0.size == (64 * CELL, 64 * CELL)


def test_atlas_cell_placement_and_sampling(tmp_data_dir, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, samples=2)

    sheet0 = load_sheet(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, CELL, 0)
    sheet1 = load_sheet(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, CELL, 1)

    # cell (2,3): sheet 0 = first image (RED), sheet 1 = second image (GREEN)
    px = cell_center_px(2, 3)
    assert approx_color(sheet0.getpixel(px), (255, 0, 0))
    assert approx_color(sheet1.getpixel(px), (0, 255, 0))

    # cell (5,5): single image (BLUE) -> sheet 0 filled, sheet 1 transparent
    px55 = cell_center_px(5, 5)
    assert approx_color(sheet0.getpixel(px55), (0, 0, 255))
    assert sheet1.getpixel(px55)[3] == 0  # alpha 0 = empty

    # deleted row's cell (10,10) must be empty in every sheet
    px_del = cell_center_px(10, 10)
    assert sheet0.getpixel(px_del)[3] == 0


def test_atlas_skips_unavailable_resolution(tmp_data_dir, atlas_dataset):
    """Requesting a resolution with no tile_index column just drops it."""
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64, 256), cell_size=CELL, samples=1)
    from latentscope.scripts.sprite_atlas import atlas_manifest_name, atlas_root
    with open(os.path.join(
        atlas_root(tmp_data_dir, atlas_dataset, SCOPE_ID, "image"),
        atlas_manifest_name(),
    )) as f:
        manifest = json.load(f)
    assert [e["num_tiles"] for e in manifest["resolutions"]] == [64]


def test_atlas_non_image_column_raises(atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    with pytest.raises(ValueError):
        generate_sprite_atlas(atlas_dataset, SCOPE_ID, "tile_index_64",
                              resolutions=(64,), cell_size=CELL)


def test_atlas_missing_scope_raises(atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    with pytest.raises(FileNotFoundError):
        generate_sprite_atlas(atlas_dataset, "scopes-999", "image",
                              resolutions=(64,), cell_size=CELL)


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

def test_atlas_status_endpoint(client, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    before = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/status?column=image"
    )
    assert before.status_code == 200
    assert before.get_json()["generated"] is False

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, samples=2)

    after = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/status?column=image"
    )
    assert after.status_code == 200
    data = after.get_json()
    assert data["generated"] is True
    assert data["cell_size"] == CELL
    assert data["samples"] == 2
    assert data["domain"] == [-1, 1]
    assert data["resolutions"][0]["num_tiles"] == 64


def test_atlas_sheet_endpoint_serves_and_errors(client, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, samples=2)

    ok = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=image&res=64&sheet=0"
    )
    assert ok.status_code == 200
    assert ok.content_type == "image/webp"
    assert ok.headers["Cache-Control"] == "public, max-age=86400"
    img = Image.open(io.BytesIO(ok.data))
    assert img.size == (64 * CELL, 64 * CELL)

    # resolution that was not generated -> 404
    missing_res = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=image&res=128&sheet=0"
    )
    assert missing_res.status_code == 404

    # sheet index past --samples -> 404
    oob = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=image&res=64&sheet=9"
    )
    assert oob.status_code == 404

    # non-image column -> 400
    bad = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=tile_index_64&res=64&sheet=0"
    )
    assert bad.status_code == 400
