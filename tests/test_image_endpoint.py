"""Tests for serving binary image columns.

Covers the GET /api/datasets/<dataset>/image endpoint and the regression
where POST /api/indexed 500ed on datasets with binary image columns
("Unsupported UTF-8 sequence length when encoding string").
"""

import io
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
IMG_SIZE = (32, 16)  # non-square so thumbnail aspect handling is visible
DATASET_ID = "img-ds"


def make_png_bytes(color, size=IMG_SIZE):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def image_dataset(tmp_data_dir, monkeypatch):
    """A tiny ingested dataset with an HF-style binary image column.

    Ingested with skip_thumbnails so the thumbnail cache starts cold and the
    cache tests below can observe the write-through behavior.
    """
    monkeypatch.setenv("LATENT_SCOPE_DATA", tmp_data_dir)
    monkeypatch.setenv("LATENT_SCOPE_NO_DOTENV", "1")
    from latentscope.scripts.ingest import ingest

    df = pd.DataFrame({
        "image": [
            {"bytes": make_png_bytes(rgb), "path": f"{name}.png"}
            for name, rgb in COLORS
        ],
        "text": [f"a {name} image" for name, _ in COLORS],
    })
    ingest(DATASET_ID, df, text_column="text", skip_thumbnails=True)
    return DATASET_ID


def cache_path(data_dir, index, bucket, dataset=DATASET_ID, column="image"):
    """Path where /image write-through-caches a thumbnail (sprite layout)."""
    return os.path.join(
        data_dir, dataset, "sprites", f"{column}-{bucket}", "000", f"{index}.webp"
    )


def get_image(client, dataset, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get(f"/api/datasets/{dataset}/image?{query}")


# ---------------------------------------------------------------------------
# GET /api/datasets/<dataset>/image
# ---------------------------------------------------------------------------

def test_image_endpoint_serves_original_bytes(client, image_dataset):
    for index, (_, rgb) in enumerate(COLORS):
        response = get_image(client, image_dataset, column="image", index=index)
        assert response.status_code == 200
        assert response.content_type == "image/png"
        assert response.headers["Cache-Control"] == "public, max-age=86400"
        img = Image.open(io.BytesIO(response.data))
        assert img.format == "PNG"
        assert img.size == IMG_SIZE
        assert img.convert("RGB").getpixel((0, 0)) == rgb


def test_image_endpoint_size_param_returns_webp_thumbnail(client, image_dataset):
    response = get_image(client, image_dataset, column="image", index=1, size=8)
    assert response.status_code == 200
    assert response.content_type == "image/webp"
    assert response.headers["Cache-Control"] == "public, max-age=86400"
    img = Image.open(io.BytesIO(response.data))
    assert img.format == "WEBP"
    # size is a maximum dimension: the cache stores the 64 bucket rendition,
    # but the response is downscaled to the requested size
    assert max(img.size) <= 8
    # WebP is lossy; just check the dominant channel survived (green)
    r, g, b = img.convert("RGB").getpixel((0, 0))
    assert g > 200 and r < 60 and b < 60


def test_image_endpoint_non_image_column_400(client, image_dataset):
    response = get_image(client, image_dataset, column="text", index=0)
    assert response.status_code == 400

    response = get_image(client, image_dataset, column="nope", index=0)
    assert response.status_code == 400

    # missing column param entirely
    response = client.get(f"/api/datasets/{image_dataset}/image?index=0")
    assert response.status_code == 400


def test_image_endpoint_bad_index_404(client, image_dataset):
    assert get_image(client, image_dataset, column="image", index=99).status_code == 404
    assert get_image(client, image_dataset, column="image", index=-1).status_code == 404
    assert get_image(client, image_dataset, column="image", index="abc").status_code == 404
    response = client.get(f"/api/datasets/{image_dataset}/image?column=image")
    assert response.status_code == 404


def test_image_endpoint_bad_size_400(client, image_dataset):
    assert get_image(
        client, image_dataset, column="image", index=0, size=1025
    ).status_code == 400
    assert get_image(
        client, image_dataset, column="image", index=0, size=0
    ).status_code == 400
    assert get_image(
        client, image_dataset, column="image", index=0, size="big"
    ).status_code == 400
    # 1024 is the inclusive cap
    assert get_image(
        client, image_dataset, column="image", index=0, size=1024
    ).status_code == 200


# ---------------------------------------------------------------------------
# Write-through thumbnail cache (sprite layout)
# ---------------------------------------------------------------------------

def make_webp_bytes(color, size=(3, 3)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=80)
    return buf.getvalue()


def test_image_thumbnail_miss_creates_cache_file(client, image_dataset, tmp_data_dir):
    path = cache_path(tmp_data_dir, index=0, bucket=150)
    assert not os.path.exists(path)

    response = get_image(client, image_dataset, column="image", index=0, size=150)
    assert response.status_code == 200
    assert response.content_type == "image/webp"
    assert response.headers["Cache-Control"] == "public, max-age=86400"

    # the thumbnail was persisted in the sprite layout, byte-for-byte
    assert os.path.exists(path)
    with open(path, "rb") as f:
        assert f.read() == response.data
    # no stray tmp files left behind
    assert all(
        not name.endswith(".webp.tmp") and ".tmp-" not in name
        for name in os.listdir(os.path.dirname(path))
    )


def test_image_thumbnail_second_request_served_from_cache(
    client, image_dataset, tmp_data_dir
):
    # warm the cache
    first = get_image(client, image_dataset, column="image", index=1, size=150)
    assert first.status_code == 200

    # overwrite the cached file with a sentinel webp: if the second request
    # is served from the cache (no parquet read / decode), we get it back
    sentinel = make_webp_bytes((255, 0, 255))
    assert sentinel != first.data
    path = cache_path(tmp_data_dir, index=1, bucket=150)
    with open(path, "wb") as f:
        f.write(sentinel)

    second = get_image(client, image_dataset, column="image", index=1, size=150)
    assert second.status_code == 200
    assert second.content_type == "image/webp"
    assert second.headers["Cache-Control"] == "public, max-age=86400"
    assert second.data == sentinel


def test_image_thumbnail_size_quantized_up_to_bucket(
    client, image_dataset, tmp_data_dir
):
    # 120 is not a bucket: it quantizes up to 150 and shares that cache
    response = get_image(client, image_dataset, column="image", index=2, size=120)
    assert response.status_code == 200
    assert os.path.exists(cache_path(tmp_data_dir, index=2, bucket=150))
    assert not os.path.exists(cache_path(tmp_data_dir, index=2, bucket=100))

    # a follow-up size=150 request is a cache hit on the same file
    sentinel = make_webp_bytes((1, 2, 3))
    with open(cache_path(tmp_data_dir, index=2, bucket=150), "wb") as f:
        f.write(sentinel)
    again = get_image(client, image_dataset, column="image", index=2, size=150)
    assert again.data == sentinel

    # exact bucket sizes cache under their own bucket
    response = get_image(client, image_dataset, column="image", index=2, size=64)
    assert response.status_code == 200
    assert os.path.exists(cache_path(tmp_data_dir, index=2, bucket=64))


def test_image_thumbnail_size_is_a_maximum(client, image_dataset, tmp_data_dir, monkeypatch):
    """A non-bucket size never returns a larger image than requested: the
    response is downscaled from the cached bucket rendition, without touching
    the parquet."""
    # seed the 150 bucket with a solid magenta 150px rendition
    sentinel = make_webp_bytes((255, 0, 255), size=(150, 100))
    path = cache_path(tmp_data_dir, index=3, bucket=150)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(sentinel)

    # prove the cache (not the parquet) is the source
    import pyarrow.parquet as pq

    def boom(*args, **kwargs):
        raise AssertionError("parquet should not be read on a cache hit")

    monkeypatch.setattr(pq, "ParquetFile", boom)

    response = get_image(client, image_dataset, column="image", index=3, size=120)
    assert response.status_code == 200
    img = Image.open(io.BytesIO(response.data))
    assert max(img.size) <= 120
    r, g, b = img.convert("RGB").getpixel((0, 0))
    assert r > 200 and b > 200 and g < 60


def test_image_original_bytes_not_cached(client, image_dataset, tmp_data_dir):
    response = get_image(client, image_dataset, column="image", index=3)
    assert response.status_code == 200
    assert response.content_type == "image/png"
    assert not os.path.exists(os.path.join(tmp_data_dir, DATASET_ID, "sprites"))


def test_image_thumbnail_served_even_if_cache_write_fails(
    client, image_dataset, tmp_data_dir, monkeypatch
):
    """A failed cache persist must not fail the request."""
    monkeypatch.setattr("os.replace", _raise_oserror)

    response = get_image(client, image_dataset, column="image", index=0, size=150)
    assert response.status_code == 200
    assert response.content_type == "image/webp"


def _raise_oserror(*args, **kwargs):
    raise OSError("disk full")


# ---------------------------------------------------------------------------
# /api/indexed regression: bytes columns must not 500 the row serialization
# ---------------------------------------------------------------------------

def test_indexed_returns_rows_without_image_column(client, image_dataset):
    response = client.post(
        "/api/indexed",
        json={"dataset": image_dataset, "indices": [0, 2]},
    )
    assert response.status_code == 200
    # /api/indexed returns a raw JSON string (not an application/json response)
    rows = response.get_json(force=True)
    assert len(rows) == 2
    for row, expected_index in zip(rows, [0, 2]):
        assert row["index"] == expected_index
        assert row["text"] == f"a {COLORS[expected_index][0]} image"
        # the image column is excluded (or at minimum nulled) in the response
        assert row.get("image") is None


def test_indexed_with_explicit_columns_including_image(client, image_dataset):
    response = client.post(
        "/api/indexed",
        json={"dataset": image_dataset, "indices": [1], "columns": ["text", "image"]},
    )
    assert response.status_code == 200
    rows = response.get_json(force=True)
    assert rows[0]["text"] == "a green image"
    assert rows[0].get("image") is None


def test_query_returns_rows_without_image_column(client, image_dataset):
    response = client.post(
        "/api/query",
        json={"dataset": image_dataset, "indices": [0, 1, 2, 3]},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 4
    for row in data["rows"]:
        assert row.get("image") is None
        assert isinstance(row["text"], str)
