# Usage: ls-sprite-atlas <dataset_id> <scope_id> <image_column>
#            [--cell-size 32] [--samples 1] [--resolutions 64,128] [--quality 80]
#
# Generate "sprite-sheet atlases" for an image dataset, keyed to the heatmap
# grid that the scope step already computes (tile_index_64 / tile_index_128).
#
# For each resolution R (an R x R grid over the normalized [-1, 1] coordinate
# space) we paint ONE WebP image — the sheet — that *is* the heatmap: the cell
# at grid position (col, row) is filled with a representative image sampled
# from the points that fall in that cell. Empty cells stay transparent. Because
# the sheet maps 1:1 onto the coordinate grid, the frontend can stretch the
# whole image across the map and let it pan/zoom for free, replacing the dots
# when you zoom in.
#
# --samples N produces N sheets per resolution: sheet 0 takes the first image
# in each cell, sheet 1 the second, and so on (cells with fewer points leave
# the later sheets transparent there).
#
# This is an OPTIONAL pipeline step that runs AFTER scope (it reads the
# {scope}-input.parquet that joins the image column with the tile indices).
import argparse
import json
import os
import sys

try:
    if 'ipykernel' in sys.modules and 'IPython' in sys.modules:
        from tqdm.notebook import tqdm
    else:
        from tqdm import tqdm
except ImportError:
    from tqdm import tqdm

from latentscope.scripts.sprites import _image_bytes, sprite_slug
from latentscope.util import get_data_dir

DEFAULT_RESOLUTIONS = (64, 128)
DEFAULT_CELL_SIZE = 32


def atlas_root(data_dir, dataset_id, scope_id, image_column):
    """Directory holding every atlas sheet + manifest for a scope/column."""
    return os.path.join(
        data_dir, dataset_id, "scopes", "atlases",
        sprite_slug(scope_id), sprite_slug(image_column),
    )


def atlas_subdir(num_tiles, cell_size):
    return f"r{num_tiles}-c{cell_size}"


def atlas_sheet_name(sheet_index):
    return f"sheet_{sheet_index:03d}.webp"


def atlas_manifest_name():
    return "manifest.json"


def _tile_column(num_tiles):
    return f"tile_index_{num_tiles}"


def generate_sprite_atlas(dataset_id, scope_id, image_column,
                          resolutions=DEFAULT_RESOLUTIONS, cell_size=DEFAULT_CELL_SIZE,
                          samples=1, quality=80):
    """Build representative-image atlas sheets for *scope_id* of *dataset_id*.

    Output layout::

        <DATA_DIR>/<dataset>/scopes/atlases/<scope>/<column>/
            manifest.json
            r<res>-c<cell>/sheet_000.webp
            r<res>-c<cell>/sheet_001.webp   (when --samples > 1)

    Streams the {scope}-input.parquet row-group by row-group; a source image is
    decoded at most once and pasted into every sheet that still needs that cell.
    Regenerates from scratch each run (not incrementally resumable — atlas
    sheets are whole images held in memory during the single pass).
    """
    import io

    import pyarrow.parquet as pq
    from PIL import Image, ImageOps

    if samples < 1:
        raise ValueError("samples must be >= 1")
    if cell_size < 1:
        raise ValueError("cell_size must be >= 1")

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

    scope_input_path = os.path.join(
        dataset_dir, "scopes", scope_id + "-input.parquet"
    )
    if not os.path.exists(scope_input_path):
        raise FileNotFoundError(
            f"scope-input parquet not found for scope {scope_id!r}; "
            f"run the scope step first ({scope_input_path})"
        )

    parquet_file = pq.ParquetFile(scope_input_path)
    available = set(parquet_file.schema_arrow.names)
    if image_column not in available:
        raise ValueError(
            f"image column {image_column!r} missing from {scope_input_path}"
        )

    # Only keep resolutions whose tile membership the scope step actually wrote.
    resolutions = [
        r for r in sorted(set(resolutions)) if _tile_column(r) in available
    ]
    if not resolutions:
        raise ValueError(
            "no tile_index_* columns found in scope-input parquet; "
            "re-run the scope step (it computes tile_index_64 / tile_index_128)"
        )

    has_deleted = "deleted" in available
    read_columns = [image_column] + [_tile_column(r) for r in resolutions]
    if has_deleted:
        read_columns.append("deleted")

    run_id = f"sprite-atlas-{scope_id}-{image_column}-c{cell_size}"
    print("RUNNING:", run_id)

    # One set of RGBA sheets per resolution. atlas_px = num_tiles * cell_size.
    sheets = {}
    atlas_px = {}
    # filled[res][cell_index] -> how many sheets we've already painted there.
    filled = {}
    for r in resolutions:
        px = r * cell_size
        atlas_px[r] = px
        sheets[r] = [
            Image.new("RGBA", (px, px), (0, 0, 0, 0)) for _ in range(samples)
        ]
        filled[r] = {}
        print(f"  resolution {r}x{r}: {samples} sheet(s) of {px}x{px}px")

    def paste(res, cell_index, sheet_index, thumb):
        num_tiles = res
        col = cell_index % num_tiles
        row = cell_index // num_tiles
        x = col * cell_size
        # Flip vertically: tile row 0 is at data-y = -1 (bottom of the map), but
        # image pixel-row 0 is the top. So the highest row index goes to y=0.
        y = (num_tiles - 1 - row) * cell_size
        sheets[res][sheet_index].paste(thumb, (x, y), thumb)

    total = parquet_file.metadata.num_rows
    index = 0
    with tqdm(total=total, desc=run_id) as pbar:
        for rg in range(parquet_file.metadata.num_row_groups):
            table = parquet_file.read_row_group(rg, columns=read_columns)
            batch = table.to_pydict()
            n = len(batch[image_column])
            for i in range(n):
                pbar.update(1)
                index += 1
                if has_deleted and batch["deleted"][i]:
                    continue

                # Which (resolution, sheet) slots still want this point's image?
                wants = []
                for r in resolutions:
                    cell = int(batch[_tile_column(r)][i])
                    count = filled[r].get(cell, 0)
                    if count < samples:
                        wants.append((r, cell, count))
                if not wants:
                    continue

                raw = _image_bytes(batch[image_column][i])
                if raw is None:
                    continue
                try:
                    img = Image.open(io.BytesIO(raw)).convert("RGBA")
                    # Crop-to-fill so every cell is a uniform square.
                    thumb = ImageOps.fit(img, (cell_size, cell_size))
                except Exception:
                    continue

                for r, cell, count in wants:
                    paste(r, cell, count, thumb)
                    filled[r][cell] = count + 1

    out_root = atlas_root(DATA_DIR, dataset_id, scope_id, image_column)
    os.makedirs(out_root, exist_ok=True)

    resolution_entries = []
    for r in resolutions:
        sub = atlas_subdir(r, cell_size)
        sub_dir = os.path.join(out_root, sub)
        os.makedirs(sub_dir, exist_ok=True)
        sheet_paths = []
        for k in range(samples):
            name = atlas_sheet_name(k)
            target = os.path.join(sub_dir, name)
            tmp = target + ".tmp"
            sheets[r][k].save(tmp, format="WEBP", quality=quality)
            os.replace(tmp, target)
            sheet_paths.append(os.path.join(sub, name))
        resolution_entries.append({
            "num_tiles": r,
            "atlas_px": atlas_px[r],
            "filled_cells": len(filled[r]),
            "sheets": sheet_paths,
        })

    manifest = {
        "scope_id": scope_id,
        "column": image_column,
        "cell_size": cell_size,
        "samples": samples,
        "domain": [-1, 1],
        "resolutions": resolution_entries,
        "complete": True,
    }
    manifest_path = os.path.join(out_root, atlas_manifest_name())
    tmp_manifest = manifest_path + ".tmp"
    with open(tmp_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f)
    os.replace(tmp_manifest, manifest_path)

    print(
        f"wrote {len(resolutions)} resolution(s) x {samples} sheet(s) "
        f"to {out_root}"
    )
    return manifest_path


def _parse_resolutions(value):
    return [int(v) for v in str(value).split(",") if v.strip()]


def main():
    parser = argparse.ArgumentParser(
        description="Generate representative-image sprite-sheet atlases for a scope"
    )
    parser.add_argument("dataset_id", type=str,
                        help="Dataset id (directory name in data/)")
    parser.add_argument("scope_id", type=str,
                        help="Scope id (e.g. scopes-001); must already exist")
    parser.add_argument("image_column", type=str,
                        help="Name of the image-typed column")
    parser.add_argument("--cell-size", type=int, default=DEFAULT_CELL_SIZE,
                        help="Pixel size of each grid cell (default 32)")
    parser.add_argument("--samples", type=int, default=1,
                        help="Number of sheets per resolution (default 1)")
    parser.add_argument("--resolutions", type=_parse_resolutions,
                        default=list(DEFAULT_RESOLUTIONS),
                        help="Comma-separated grid resolutions (default 64,128)")
    parser.add_argument("--quality", type=int, default=80,
                        help="WebP quality 1-100 (default 80)")
    args = parser.parse_args()
    generate_sprite_atlas(
        args.dataset_id, args.scope_id, args.image_column,
        resolutions=args.resolutions, cell_size=args.cell_size,
        samples=args.samples, quality=args.quality,
    )


if __name__ == "__main__":
    main()
