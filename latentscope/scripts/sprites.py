# Usage: ls-sprites <dataset_id> <image_column> [--size 64] [--quality 80]
#
# Generate individual WebP thumbnail "sprites" for an image column, one small
# file per row, sharded by index so no directory holds more than ~1000 files.
# This is an OPTIONAL pipeline step (like embed / umap) that powers the
# viewport-culled DOM image overlay in the scatter map.
import argparse
import hashlib
import json
import os
import re
import sys

try:
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError:
    from tqdm import tqdm

from latentscope.util import get_data_dir

SHARD_SIZE = 1000


def sprite_slug(column):
    """Path-safe directory component for an image column name.

    The writer (this script) and the server endpoints must produce the same
    slug so generated files can be served back. Stripping path separators and
    dots keeps thumbnails contained under ``<dataset>/sprites/`` even when a
    column name contains ``/``, ``\\`` or ``..``.

    The substitution is lossy, so distinct columns ("a/b", "a.b", "a b") could
    collapse to the same string and clobber each other's manifest/thumbnails.
    When a name needs sanitizing we append a short stable hash of the original
    to keep slugs collision-free. Names that are already path-safe (e.g.
    "image") pass through unchanged so previously generated sprites stay valid.
    """
    col = str(column)
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", col)
    if safe == col and safe:
        return safe
    digest = hashlib.sha1(col.encode("utf-8")).hexdigest()[:8]
    return f"{safe or '_'}-{digest}"


def sprite_dir_name(column, size):
    """Directory name for a column's sprites of a given size."""
    return f"{sprite_slug(column)}-{size}"


def sprite_manifest_name(column, size):
    """Manifest filename for a column's sprites of a given size."""
    return f"{sprite_slug(column)}-{size}.json"


def shard_for(index):
    """Return the zero-padded shard directory name for a row index."""
    return f"{index // SHARD_SIZE:03d}"


def _image_bytes(value):
    """Extract raw image bytes from a stored cell (HF-style {"bytes": ...}
    dict or raw bytes), or None if there are none."""
    if isinstance(value, dict):
        value = value.get("bytes")
    if isinstance(value, bytearray):
        value = bytes(value)
    if not isinstance(value, bytes) or len(value) == 0:
        return None
    return value


def generate_sprites(dataset_id, image_column, size=64, quality=80):
    """Generate sharded WebP thumbnails for *image_column* of *dataset_id*.

    Output layout::

        <DATA_DIR>/<dataset>/sprites/<column>-<size>/<shard>/<index>.webp
        <DATA_DIR>/<dataset>/sprites/<column>-<size>.json   (manifest)

    Streams input.parquet row-group by row-group so the full image set is
    never held in RAM.  Resumable: an index whose .webp already exists is
    skipped.  Null / undecodable cells write no file and are recorded in the
    manifest's ``missing`` list so the frontend can skip them.
    """
    import io

    import pyarrow.parquet as pq
    from PIL import Image

    DATA_DIR = get_data_dir()
    dataset_dir = os.path.join(DATA_DIR, dataset_id)

    meta_path = os.path.join(dataset_dir, "meta.json")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    column_meta = (meta.get("column_metadata") or {}).get(image_column)
    if not isinstance(column_meta, dict) or column_meta.get("type") != "image":
        raise ValueError(
            f"column {image_column!r} is not an image column in {dataset_id}"
        )

    run_id = f"sprites-{image_column}-{size}"
    print("RUNNING:", run_id)

    sprites_root = os.path.join(dataset_dir, "sprites")
    out_dir = os.path.join(sprites_root, sprite_dir_name(image_column, size))
    os.makedirs(out_dir, exist_ok=True)

    input_path = os.path.join(dataset_dir, "input.parquet")
    parquet_file = pq.ParquetFile(input_path)
    total = parquet_file.metadata.num_rows

    def out_path(index):
        return os.path.join(out_dir, shard_for(index), f"{index}.webp")

    # Count what already exists so a rerun reports resumed progress.
    existing_start = sum(
        1 for i in range(total) if os.path.exists(out_path(i))
    )
    print(f"{existing_start} of {total} sprites already exist; resuming")

    manifest_path = os.path.join(sprites_root, sprite_manifest_name(image_column, size))

    def write_manifest(missing, count, complete):
        os.makedirs(sprites_root, exist_ok=True)
        manifest = {
            "column": image_column,
            "size": size,
            "shard_size": SHARD_SIZE,
            "count": count,
            "total": total,
            "missing": missing,
            "complete": complete,
        }
        tmp_path = manifest_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f)
        os.replace(tmp_path, manifest_path)

    missing = []
    written_total = 0
    index = 0
    with tqdm(total=total, desc=run_id) as pbar:
        for rg in range(parquet_file.metadata.num_row_groups):
            table = parquet_file.read_row_group(rg, columns=[image_column])
            column = table.column(0)
            for cell in column:
                value = cell.as_py()
                target = out_path(index)
                if os.path.exists(target):
                    written_total += 1
                    index += 1
                    pbar.update(1)
                    continue

                raw = _image_bytes(value)
                img = None
                if raw is not None:
                    try:
                        img = Image.open(io.BytesIO(raw))
                        img = img.convert("RGB")
                        img.thumbnail((size, size))
                    except Exception:
                        img = None

                if img is None:
                    # null or undecodable: write nothing, record as missing
                    missing.append(index)
                else:
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    tmp_target = target + ".tmp"
                    img.save(tmp_target, format="WEBP", quality=quality)
                    os.replace(tmp_target, target)
                    written_total += 1

                index += 1
                pbar.update(1)

    write_manifest(missing, written_total, complete=True)
    print(
        f"wrote {written_total} sprites ({len(missing)} missing) "
        f"of {total} rows to {out_dir}"
    )
    return manifest_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate sharded WebP image sprites for a dataset column"
    )
    parser.add_argument("dataset_id", type=str,
                        help="Dataset id (directory name in data/)")
    parser.add_argument("image_column", type=str,
                        help="Name of the image-typed column")
    parser.add_argument("--size", type=int, default=64,
                        help="Max thumbnail dimension in px (default 64)")
    parser.add_argument("--quality", type=int, default=80,
                        help="WebP quality 1-100 (default 80)")
    args = parser.parse_args()
    generate_sprites(args.dataset_id, args.image_column,
                     size=args.size, quality=args.quality)


if __name__ == "__main__":
    main()
