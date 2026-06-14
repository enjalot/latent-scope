"""Tests for the optional image-sprite generation step and serving endpoints.

generate_sprites() writes one small sharded WebP per row; the /sprite and
/sprites/status endpoints serve them and report progress.
"""

import io
import json
import os

import pandas as pd
import pytest
from PIL import Image

COLORS = [
    ("red", (255, 0, 0)),
    ("green", (0, 255, 0)),
    ("blue", (0, 0, 255)),
    ("yellow", (255, 255, 0)),
]
IMG_SIZE = (96, 48)  # non-square + larger than sprite size so thumbnailing bites
DATASET_ID = "sprite-ds"


def make_png_bytes(color, size=IMG_SIZE):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def sprite_dataset(tmp_data_dir, monkeypatch):
    """A tiny ingested image dataset; row 2 has a null image (missing)."""
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    from latentscope.scripts.ingest import ingest

    images = [
        {"bytes": make_png_bytes(rgb), "path": f"{name}.png"}
        for name, rgb in COLORS
    ]
    images[2] = None  # blue row -> missing image
    df = pd.DataFrame({
        "image": images,
        "text": [f"a {name} image" for name, _ in COLORS],
    })
    ingest(DATASET_ID, df, text_column="text")
    return DATASET_ID


def sprite_path(data_dir, dataset, column, size, index):
    shard = f"{index // 1000:03d}"
    return os.path.join(
        data_dir, dataset, "sprites", f"{column}-{size}", shard, f"{index}.webp"
    )


def load_manifest(data_dir, dataset, column, size):
    path = os.path.join(data_dir, dataset, "sprites", f"{column}-{size}.json")
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# generate_sprites
# ---------------------------------------------------------------------------

def test_generate_sprites_writes_sharded_webp(tmp_data_dir, sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    generate_sprites(sprite_dataset, "image", size=64)

    # present images -> valid 64px WEBP in shard 000
    for index in (0, 1, 3):
        path = sprite_path(tmp_data_dir, sprite_dataset, "image", 64, index)
        assert os.path.exists(path)
        img = Image.open(path)
        assert img.format == "WEBP"
        assert max(img.size) <= 64

    # null image row -> no file
    assert not os.path.exists(
        sprite_path(tmp_data_dir, sprite_dataset, "image", 64, 2)
    )


def test_generate_sprites_manifest(tmp_data_dir, sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    generate_sprites(sprite_dataset, "image", size=64)
    manifest = load_manifest(tmp_data_dir, sprite_dataset, "image", 64)

    assert manifest["column"] == "image"
    assert manifest["size"] == 64
    assert manifest["shard_size"] == 1000
    assert manifest["total"] == 4
    assert manifest["count"] == 3
    assert manifest["missing"] == [2]
    assert manifest["complete"] is True


def test_generate_sprites_resumable(tmp_data_dir, sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    generate_sprites(sprite_dataset, "image", size=64)

    kept = sprite_path(tmp_data_dir, sprite_dataset, "image", 64, 0)
    regen = sprite_path(tmp_data_dir, sprite_dataset, "image", 64, 3)
    kept_mtime = os.path.getmtime(kept)
    os.remove(regen)

    generate_sprites(sprite_dataset, "image", size=64)

    # untouched file not rewritten, deleted file regenerated
    assert os.path.getmtime(kept) == kept_mtime
    assert os.path.exists(regen)


def test_generate_sprites_non_image_column_raises(sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    with pytest.raises(ValueError):
        generate_sprites(sprite_dataset, "text", size=64)


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

def test_sprites_status_endpoint(client, tmp_data_dir, sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    # before generation
    before = client.get(
        f"/api/datasets/{sprite_dataset}/sprites/status?column=image&size=64"
    )
    assert before.status_code == 200
    assert before.get_json()["generated"] is False

    generate_sprites(sprite_dataset, "image", size=64)

    after = client.get(
        f"/api/datasets/{sprite_dataset}/sprites/status?column=image&size=64"
    )
    assert after.status_code == 200
    data = after.get_json()
    assert data["generated"] is True
    assert data["count"] == 3
    assert data["total"] == 4
    assert data["missing_count"] == 1


def test_sprite_endpoint_serves_and_404s(client, sprite_dataset):
    from latentscope.scripts.sprites import generate_sprites

    generate_sprites(sprite_dataset, "image", size=64)

    ok = client.get(f"/api/datasets/{sprite_dataset}/sprite?column=image&index=0&size=64")
    assert ok.status_code == 200
    assert ok.content_type == "image/webp"
    assert ok.headers["Cache-Control"] == "public, max-age=86400"
    img = Image.open(io.BytesIO(ok.data))
    assert img.format == "WEBP"
    assert max(img.size) <= 64

    # missing (null) image -> 404
    missing = client.get(f"/api/datasets/{sprite_dataset}/sprite?column=image&index=2&size=64")
    assert missing.status_code == 404

    # out-of-range index -> 404
    oob = client.get(f"/api/datasets/{sprite_dataset}/sprite?column=image&index=99&size=64")
    assert oob.status_code == 404

    # non-image column -> 400
    bad = client.get(f"/api/datasets/{sprite_dataset}/sprite?column=text&index=0&size=64")
    assert bad.status_code == 400
