"""Tests for binary image column detection in ingest (issue #87).

HF datasets with Image features land in parquet as {"bytes": ..., "path": ...}
struct columns (e.g. Marqo/polyvore). Ingest must flag these as image columns
without corrupting them (the old behavior stringified unknown column types).
"""

import io
import json
import os

import pandas as pd
import pytest
from PIL import Image


def make_png_bytes(color=(255, 0, 0), size=(4, 4)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def ingest_env(tmp_data_dir, monkeypatch):
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    return tmp_data_dir


def load_meta(data_dir, dataset_id):
    with open(os.path.join(data_dir, dataset_id, "meta.json")) as f:
        return json.load(f)


def test_ingest_detects_hf_style_binary_image_column(ingest_env):
    from latentscope.scripts.ingest import ingest

    n = 6
    df = pd.DataFrame({
        "image": [{"bytes": make_png_bytes((i * 40, 10, 10)), "path": f"{i}.png"}
                  for i in range(n)],
        "caption": [f"caption number {i}" for i in range(n)],
    })
    ingest("img-binary", df, text_column="caption")

    meta = load_meta(ingest_env, "img-binary")
    image_meta = meta["column_metadata"]["image"]
    assert image_meta["type"] == "image"
    assert image_meta["image_kind"] == "binary"
    assert image_meta["image"] is True

    # plain text column unaffected
    caption_meta = meta["column_metadata"]["caption"]
    assert caption_meta["type"] == "string"
    assert "image" not in caption_meta

    # the bytes round-trip through input.parquet unmodified (not stringified)
    out = pd.read_parquet(os.path.join(ingest_env, "img-binary", "input.parquet"))
    assert isinstance(out["image"].iloc[0], dict)
    assert out["image"].iloc[0]["bytes"] == df["image"].iloc[0]["bytes"]


def test_ingest_detects_raw_bytes_image_column(ingest_env):
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "image": [make_png_bytes((10, 200, 10)) for _ in range(4)],
        "label": ["a", "b", "c", "d"],
    })
    ingest("img-raw", df)

    meta = load_meta(ingest_env, "img-raw")
    image_meta = meta["column_metadata"]["image"]
    assert image_meta["type"] == "image"
    assert image_meta["image_kind"] == "binary"


def test_ingest_image_column_with_nulls_still_detected(ingest_env):
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "image": [{"bytes": make_png_bytes(), "path": "a.png"}, None,
                  {"bytes": make_png_bytes((0, 0, 255)), "path": "b.png"}],
        "caption": ["x", "y", "z"],
    })
    ingest("img-nulls", df, text_column="caption")

    meta = load_meta(ingest_env, "img-nulls")
    assert meta["column_metadata"]["image"]["type"] == "image"


def test_ingest_url_image_detection_still_works(ingest_env):
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "image_url": [f"http://example.com/img{i}.png" for i in range(3)],
        "page_url": [f"http://example.com/page{i}" for i in range(3)],
        "caption": ["one", "two", "three"],
    })
    ingest("img-urls", df, text_column="caption")

    meta = load_meta(ingest_env, "img-urls")
    url_meta = meta["column_metadata"]["image_url"]
    assert url_meta["type"] == "string"  # url images stay string columns
    assert url_meta["url"] is True
    assert url_meta["image"] is True
    assert url_meta["image_kind"] == "url"
    # non-image urls are urls but not images
    page_meta = meta["column_metadata"]["page_url"]
    assert page_meta["url"] is True
    assert "image" not in page_meta


def test_ingest_non_image_bytes_not_flagged(ingest_env):
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "blob": [b"not an image at all" + bytes([i]) for i in range(3)],
        "caption": ["one", "two", "three"],
    })
    ingest("img-notimg", df, text_column="caption")

    meta = load_meta(ingest_env, "img-notimg")
    assert meta["column_metadata"]["blob"]["type"] != "image"


def test_image_column_not_picked_as_default_text_column(ingest_env):
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "image": [{"bytes": make_png_bytes(), "path": "a.png"} for _ in range(3)],
        "caption": ["one", "two", "three"],
    })
    ingest("img-default-col", df)

    meta = load_meta(ingest_env, "img-default-col")
    assert meta["text_column"] == "caption"


def test_ingest_directory_of_images(ingest_env, tmp_path):
    """`ls-ingest <ds> --path <dir>` on a folder of images builds an image dataset."""
    from latentscope.scripts.ingest import ingest_file

    img_dir = tmp_path / "shots"
    img_dir.mkdir()
    for i in range(4):
        Image.new("RGB", (4, 4), (i * 50, 20, 20)).save(img_dir / f"shot_{i}.png")
    Image.new("RGB", (4, 4), (0, 200, 0)).save(img_dir / "photo.jpg")
    (img_dir / "notes.txt").write_text("not an image")
    (img_dir / "subdir").mkdir()

    ingest_file("img-folder", str(img_dir))

    meta = load_meta(ingest_env, "img-folder")
    image_meta = meta["column_metadata"]["image"]
    assert image_meta["type"] == "image"
    assert image_meta["image_kind"] == "binary"
    assert meta["length"] == 5  # txt + subdir skipped
    assert meta["text_column"] == "filename"

    out = pd.read_parquet(os.path.join(ingest_env, "img-folder", "input.parquet"))
    assert set(out.columns) >= {"image", "filename", "date", "size_kb"}
    assert isinstance(out["image"].iloc[0], bytes)
    assert sorted(out["filename"])[-1] == "shot_3.png"


def sprite_path(data_dir, dataset_id, index, column="image", size=150):
    shard = f"{index // 1000:03d}"
    return os.path.join(
        data_dir, dataset_id, "sprites", f"{column}-{size}", shard, f"{index}.webp"
    )


def test_ingest_directory_prebakes_150px_thumbnails(ingest_env, tmp_path):
    """Folder ingest generates a 150px webp sprite per row for the image column."""
    from latentscope.scripts.ingest import ingest_file

    img_dir = tmp_path / "shots"
    img_dir.mkdir()
    for i in range(3):
        Image.new("RGB", (300, 200), (i * 60, 30, 30)).save(img_dir / f"shot_{i}.png")

    ingest_file("img-sprites", str(img_dir))

    meta = load_meta(ingest_env, "img-sprites")
    for i in range(meta["length"]):
        path = sprite_path(ingest_env, "img-sprites", i)
        assert os.path.exists(path), f"missing prebaked sprite for row {i}"
        with Image.open(path) as img:
            assert img.format == "WEBP"
            assert max(img.size) <= 150

    # manifest marks the set complete so /sprites/status reports generated
    manifest_file = os.path.join(ingest_env, "img-sprites", "sprites", "image-150.json")
    with open(manifest_file) as f:
        manifest = json.load(f)
    assert manifest["complete"] is True
    assert manifest["count"] == meta["length"]
    assert manifest["size"] == 150


def test_ingest_skip_thumbnails_flag(ingest_env, tmp_path):
    from latentscope.scripts.ingest import ingest_file

    img_dir = tmp_path / "shots"
    img_dir.mkdir()
    Image.new("RGB", (8, 8), (10, 20, 30)).save(img_dir / "only.png")

    ingest_file("img-nosprites", str(img_dir), skip_thumbnails=True)

    meta = load_meta(ingest_env, "img-nosprites")
    assert meta["column_metadata"]["image"]["type"] == "image"
    assert not os.path.exists(os.path.join(ingest_env, "img-nosprites", "sprites"))


def test_ingest_dataframe_prebakes_thumbnails_for_binary_image_columns(ingest_env):
    """DataFrame ingest (HF-style dict column) also prebakes; url columns don't."""
    from latentscope.scripts.ingest import ingest

    n = 3
    df = pd.DataFrame({
        "image": [{"bytes": make_png_bytes((i * 70, 10, 10)), "path": f"{i}.png"}
                  for i in range(n)],
        "image_url": [f"http://example.com/img{i}.png" for i in range(n)],
        "caption": [f"caption {i}" for i in range(n)],
    })
    ingest("img-df-sprites", df, text_column="caption")

    for i in range(n):
        assert os.path.exists(sprite_path(ingest_env, "img-df-sprites", i))
    # url-kind image columns are remote: nothing to prebake
    assert not os.path.exists(
        os.path.join(ingest_env, "img-df-sprites", "sprites", "image_url-150")
    )


def test_ingest_directory_without_images_raises(ingest_env, tmp_path):
    from latentscope.scripts.ingest import ingest_file

    empty = tmp_path / "empty"
    empty.mkdir()
    (empty / "readme.md").write_text("hi")
    with pytest.raises(ValueError, match="No image files"):
        ingest_file("img-empty", str(empty))
