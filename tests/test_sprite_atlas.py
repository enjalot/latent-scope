"""Tests for the tiled representative-image atlas pyramid + serving endpoints.

generate_sprite_atlas() paints a representative image per heatmap cell into
per-resolution tiles (skipping empty tiles); the /atlas endpoints serve tiles
and plan the pyramid.
"""

import io
import json
import os

import numpy as np
import pandas as pd
import pytest
from PIL import Image

DATASET_ID = "atlas-ds"
SCOPE_ID = "scopes-001"
NUM_TILES = 64
CELL = 8  # small cells keep test sheets tiny


def make_png_bytes(color, size=(40, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def cell_to_xy(col, row, num_tiles=NUM_TILES):
    """A normalized (x, y) at the center of grid cell (col, row)."""
    tile_size = 2.0 / num_tiles
    return -1 + (col + 0.5) * tile_size, -1 + (row + 0.5) * tile_size


def cell_center_px_in_tile(col, row, tile_px, num_tiles=NUM_TILES, cell=CELL):
    """Pixel at the center of cell (col,row) within its tile (vertical flip)."""
    tc = tile_px // cell
    row_img = num_tiles - 1 - row
    lx = (col % tc) * cell + cell // 2
    ly = (row_img % tc) * cell + cell // 2
    return lx, ly


def approx_color(pixel, expected, tol=12):
    return all(abs(a - b) <= tol for a, b in zip(pixel[:3], expected))


@pytest.fixture
def atlas_dataset(tmp_data_dir, monkeypatch):
    """A dataset + scope parquets (both {scope}.parquet and {scope}-input.parquet)
    with images in known cells."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    ds_dir = os.path.join(tmp_data_dir, DATASET_ID)
    os.makedirs(os.path.join(ds_dir, "scopes"))
    meta = {"id": DATASET_ID, "length": 5,
            "column_metadata": {"image": {"type": "image", "image": True}}}
    with open(os.path.join(ds_dir, "meta.json"), "w") as f:
        json.dump(meta, f)

    rows = [
        {"image": make_png_bytes((255, 0, 0)), "cell": (2, 3), "deleted": False},
        {"image": make_png_bytes((0, 255, 0)), "cell": (2, 3), "deleted": False},
        {"image": make_png_bytes((0, 0, 255)), "cell": (40, 40), "deleted": False},
        {"image": make_png_bytes((255, 0, 0)), "cell": (10, 10), "deleted": True},
        {"image": None, "cell": (20, 20), "deleted": False},
    ]
    xy = [cell_to_xy(*r["cell"]) for r in rows]
    base = pd.DataFrame({
        "x": [p[0] for p in xy], "y": [p[1] for p in xy],
        "deleted": [r["deleted"] for r in rows],
    })
    base.to_parquet(os.path.join(ds_dir, "scopes", f"{SCOPE_ID}.parquet"))
    inp = base.copy()
    inp["image"] = [r["image"] for r in rows]
    inp.to_parquet(os.path.join(ds_dir, "scopes", f"{SCOPE_ID}-input.parquet"))
    return DATASET_ID


def load_tile(tmp_data_dir, dataset, scope, column, res, tx, ty, sheet=0):
    from latentscope.scripts.sprite_atlas import (
        atlas_root,
        atlas_sheet_name,
        atlas_tile_dir,
    )
    path = os.path.join(atlas_root(tmp_data_dir, dataset, scope, column),
                        atlas_tile_dir(res, tx, ty), atlas_sheet_name(sheet))
    return Image.open(path).convert("RGBA")


def read_manifest(tmp_data_dir, dataset, scope, column):
    from latentscope.scripts.sprite_atlas import atlas_manifest_name, atlas_root
    with open(os.path.join(atlas_root(tmp_data_dir, dataset, scope, column),
                           atlas_manifest_name())) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# tiling helpers
# ---------------------------------------------------------------------------

def test_tiling_math():
    from latentscope.scripts.sprite_atlas import tile_cells, tiles_per_axis
    assert tile_cells(32, 2048) == 64
    assert tiles_per_axis(64, 32, 2048) == 1
    assert tiles_per_axis(128, 32, 2048) == 2
    assert tiles_per_axis(256, 32, 2048) == 4
    assert tiles_per_axis(512, 32, 2048) == 8


# ---------------------------------------------------------------------------
# generation (single tile, default tile_px)
# ---------------------------------------------------------------------------

def test_single_tile_manifest_and_placement(tmp_data_dir, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, samples=2)
    m = read_manifest(tmp_data_dir, atlas_dataset, SCOPE_ID, "image")
    assert m["complete"] and m["tile_px"] == 2048
    entry = m["resolutions"][0]
    assert entry["num_tiles"] == 64
    assert entry["tiles_per_axis"] == 1  # 64*8=512 < 2048
    assert entry["filled_cells"] == 2     # (2,3) and (40,40); deleted/null skipped
    # both populated cells live in the single tile (0,0)
    assert {(t["tx"], t["ty"]) for t in entry["tiles"]} == {(0, 0)}

    sheet0 = load_tile(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, 0, 0, 0)
    sheet1 = load_tile(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, 0, 0, 1)
    assert sheet0.size == (512, 512)
    px = cell_center_px_in_tile(2, 3, 2048)
    assert approx_color(sheet0.getpixel(px), (255, 0, 0))   # first image
    assert approx_color(sheet1.getpixel(px), (0, 255, 0))   # second image
    # deleted point's cell stays empty
    pdel = cell_center_px_in_tile(10, 10, 2048)
    assert sheet0.getpixel(pdel)[3] == 0


def test_256_from_xy(tmp_data_dir, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(256,), cell_size=CELL)
    m = read_manifest(tmp_data_dir, atlas_dataset, SCOPE_ID, "image")
    entry = m["resolutions"][0]
    assert entry["num_tiles"] == 256
    assert entry["tiles_per_axis"] == 1  # 256*8=2048 == tile_px
    assert entry["full_px"] == 2048


# ---------------------------------------------------------------------------
# generation (multiple tiles via small tile_px) + empty-tile skip
# ---------------------------------------------------------------------------

def test_pyramid_splits_into_tiles_and_skips_empty(tmp_data_dir, atlas_dataset):
    from latentscope.scripts.sprite_atlas import (
        atlas_root,
        atlas_tile_dir,
        cell_to_tile,
        generate_sprite_atlas,
        tiles_per_axis,
    )

    # tile_px=64, cell=8 -> tile_cells=8 -> res 64 splits into 8x8 tiles
    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image",
                          resolutions=(64,), cell_size=CELL, tile_px=64)
    m = read_manifest(tmp_data_dir, atlas_dataset, SCOPE_ID, "image")
    entry = m["resolutions"][0]
    assert entry["tiles_per_axis"] == tiles_per_axis(64, CELL, 64) == 8

    # the two populated cells (2,3) and (40,40) -> their image-space tiles
    def img_tile(col, row):
        return cell_to_tile(col, 64 - 1 - row, CELL, 64)
    expected = {img_tile(2, 3), img_tile(40, 40)}
    got = {(t["tx"], t["ty"]) for t in entry["tiles"]}
    assert got == expected
    assert len(expected) == 2  # they fall in different tiles

    # populated tile files exist; an unpopulated tile dir does not
    root = atlas_root(tmp_data_dir, atlas_dataset, SCOPE_ID, "image")
    for (tx, ty) in expected:
        assert os.path.exists(os.path.join(root, atlas_tile_dir(64, tx, ty), "sheet_000.webp"))
    empty = (7, 0)
    assert empty not in expected
    assert not os.path.exists(os.path.join(root, atlas_tile_dir(64, *empty)))

    # the blue image lands in its own tile, correctly colored
    tx, ty = img_tile(40, 40)
    tile = load_tile(tmp_data_dir, atlas_dataset, SCOPE_ID, "image", 64, tx, ty)
    px = cell_center_px_in_tile(40, 40, 64)
    assert approx_color(tile.getpixel(px), (0, 0, 255))


def test_non_image_and_missing_scope_raise(atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas
    with pytest.raises(ValueError):
        generate_sprite_atlas(atlas_dataset, SCOPE_ID, "x", resolutions=(64,), cell_size=CELL)
    with pytest.raises(FileNotFoundError):
        generate_sprite_atlas(atlas_dataset, "scopes-999", "image", resolutions=(64,))


# ---------------------------------------------------------------------------
# plan_atlas
# ---------------------------------------------------------------------------

def test_plan_atlas_counts_and_density():
    from latentscope.scripts.sprite_atlas import plan_atlas

    # 3 distinct cells at 64-grid: (2,3),(2,3 dup),(40,40)
    xs, ys = [], []
    for (c, r) in [(2, 3), (2, 3), (40, 40)]:
        x, y = cell_to_xy(c, r)
        xs.append(x)
        ys.append(y)
    plan = plan_atlas(np.array(xs), np.array(ys), [64, 128], cell_size=CELL, tile_px=64)
    assert plan["total_points"] == 3
    e64 = next(e for e in plan["resolutions"] if e["num_tiles"] == 64)
    assert e64["populated_cells"] == 2          # two distinct cells
    assert e64["tiles_per_axis"] == 8
    assert e64["populated_tiles"] == 2          # in two different tiles
    assert e64["total_tiles"] == 64
    assert e64["tile_coords"] is not None and len(e64["tile_coords"]) == 2
    # density grid is res x res with the right total count
    d = plan["density"]
    assert d["res"] == 64
    assert sum(sum(row) for row in d["counts"]) == 3


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

def test_atlas_status_and_sheet_endpoints(client, atlas_dataset):
    from latentscope.scripts.sprite_atlas import generate_sprite_atlas

    before = client.get(f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/status?column=image")
    assert before.get_json()["generated"] is False

    generate_sprite_atlas(atlas_dataset, SCOPE_ID, "image", resolutions=(64,), cell_size=CELL)

    status = client.get(f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/status?column=image")
    data = status.get_json()
    assert data["generated"] is True
    assert data["resolutions"][0]["tiles_per_axis"] == 1

    ok = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=image&res=64&tx=0&ty=0"
    )
    assert ok.status_code == 200 and ok.content_type == "image/webp"
    assert ok.headers["Cache-Control"] == "public, max-age=86400"

    # missing tile -> 404
    missing = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=image&res=64&tx=3&ty=3"
    )
    assert missing.status_code == 404
    # non-image column -> 400
    bad = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/sheet?column=x&res=64&tx=0&ty=0"
    )
    assert bad.status_code == 400


def test_atlas_plan_endpoint(client, atlas_dataset):
    res = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/plan"
        f"?column=image&resolutions=64,128&cell_size=8&tile_px=64"
    )
    assert res.status_code == 200
    plan = res.get_json()
    # The plan bins x/y only (it can't know which images decode), so the
    # null-image point still counts. Non-deleted distinct 64-grid cells:
    # (2,3), (40,40), (20,20) = 3.
    e64 = next(e for e in plan["resolutions"] if e["num_tiles"] == 64)
    assert e64["populated_cells"] == 3
    assert plan["total_points"] == 4  # 5 rows - 1 deleted
    assert plan["density"]["res"] == 64

    # non-image column rejected
    bad = client.get(
        f"/api/datasets/{atlas_dataset}/scopes/{SCOPE_ID}/atlas/plan?column=x"
    )
    assert bad.status_code == 400
