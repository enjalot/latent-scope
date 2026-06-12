"""Tests for serving binary image columns.

Covers the GET /api/datasets/<dataset>/image endpoint and the regression
where POST /api/indexed 500ed on datasets with binary image columns
("Unsupported UTF-8 sequence length when encoding string").
"""

import io

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
    """A tiny ingested dataset with an HF-style binary image column."""
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
    ingest(DATASET_ID, df, text_column="text")
    return DATASET_ID


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
