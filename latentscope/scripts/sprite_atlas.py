# Usage: ls-sprite-atlas <dataset_id> <scope_id> <image_column>
#            [--cell-size 32] [--samples 1] [--resolutions 64,128,256] [--quality 80]
#            [--tile-px 2048]
#
# Generate a tiled "sprite-sheet atlas" pyramid for an image dataset, keyed to
# the same grid the heatmap uses (the scope step's make_tiles). Cell membership
# is recomputed here from each point's x/y, so any resolution works on any scope.
#
# For each resolution R (an R x R grid over the normalized [-1, 1] coordinate
# space) the cell at grid position (col, row) is filled with a representative
# image sampled from the points that fall in that cell. Instead of one giant
# sheet per resolution, the sheet is split into <= TILE_PX tiles (an image
# pyramid): a finer grid keeps full cell resolution and just produces more
# tiles. Tiles with no populated cells are not written, so cost scales with how
# populated the data is, not with the grid size. The frontend loads only the
# visible, populated tiles.
#
# --samples N produces N sheets per (resolution, tile): sheet 0 takes the first
# image in each cell, sheet 1 the second, and so on.
#
# This is an OPTIONAL pipeline step that runs AFTER scope (it reads the
# {scope}-input.parquet that joins the image column with x/y).
import argparse
import json
import math
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

DEFAULT_RESOLUTIONS = (64, 128, 256)
DEFAULT_CELL_SIZE = 32
# Max pixel size of a single tile (one decoded browser texture ~ tile_px^2 * 4).
DEFAULT_TILE_PX = 2048


def tile_cells(cell_size, tile_px=DEFAULT_TILE_PX):
    """How many grid cells fit along one axis of a tile."""
    return max(1, tile_px // cell_size)


def tiles_per_axis(num_tiles, cell_size, tile_px=DEFAULT_TILE_PX):
    """Number of tiles along one axis for an R x R grid at this cell size."""
    tc = tile_cells(cell_size, tile_px)
    return max(1, math.ceil(num_tiles / tc))


def cell_to_tile(col, row_img, cell_size, tile_px=DEFAULT_TILE_PX):
    """Tile (tx, ty) containing image-space cell (col, row_img)."""
    tc = tile_cells(cell_size, tile_px)
    return col // tc, row_img // tc


def tile_index(x, y, num_tiles):
    """Map a normalized [-1, 1] coordinate to a flat grid-cell index.

    Mirrors ``make_tiles`` in scope.py so the atlas grid lines up exactly with
    the heatmap.
    """
    tile_size = 2.0 / num_tiles
    col = int((x + 1) / tile_size)
    row = int((y + 1) / tile_size)
    col = min(max(col, 0), num_tiles - 1)
    row = min(max(row, 0), num_tiles - 1)
    return row * num_tiles + col


def atlas_root(data_dir, dataset_id, scope_id, image_column):
    """Directory holding every atlas tile + manifest for a scope/column."""
    return os.path.join(
        data_dir, dataset_id, "scopes", "atlases",
        sprite_slug(scope_id), sprite_slug(image_column),
    )


def atlas_tile_dir(num_tiles, tx, ty):
    return os.path.join(f"r{num_tiles}", f"t{tx}_{ty}")


def atlas_sheet_name(sheet_index):
    return f"sheet_{sheet_index:03d}.webp"


def atlas_manifest_name():
    return "manifest.json"


def plan_atlas(xs, ys, resolutions, cell_size=DEFAULT_CELL_SIZE,
               tile_px=DEFAULT_TILE_PX, density_res=64, max_tile_coords=8192):
    """Compute, without generating anything, how an atlas would tile.

    Returns per-resolution stats (populated/total cells and tiles, tiles-per-axis)
    plus the image-space coords of populated tiles (capped), and a coarse density
    grid for rendering the heatmap. Fast: only bins x/y.
    """
    import numpy as np

    xs = np.asarray(xs, dtype=np.float64)
    ys = np.asarray(ys, dtype=np.float64)
    tc = tile_cells(cell_size, tile_px)

    def colrow(num_tiles):
        ts = 2.0 / num_tiles
        col = np.clip(((xs + 1) / ts).astype(np.int64), 0, num_tiles - 1)
        row = np.clip(((ys + 1) / ts).astype(np.int64), 0, num_tiles - 1)
        return col, row

    entries = []
    for r in sorted(set(resolutions)):
        col, row = colrow(r)
        cell_flat = row * r + col
        populated_cells = int(np.unique(cell_flat).size)

        T = tiles_per_axis(r, cell_size, tile_px)
        row_img = (r - 1) - row  # match the generator's vertical flip
        tx = col // tc
        ty = row_img // tc
        tile_flat = ty * T + tx
        uniq = np.unique(tile_flat)
        populated_tiles = int(uniq.size)

        coords = None
        if populated_tiles <= max_tile_coords:
            coords = [[int(v % T), int(v // T)] for v in uniq.tolist()]  # [tx, ty]

        entries.append({
            "num_tiles": r,
            "cell_size": cell_size,
            "tile_px": tile_px,
            "tiles_per_axis": T,
            "full_px": r * cell_size,
            "total_cells": r * r,
            "populated_cells": populated_cells,
            "total_tiles": T * T,
            "populated_tiles": populated_tiles,
            "tile_coords": coords,  # image-space [tx, ty]; null if too many
        })

    dcol, drow = colrow(density_res)
    grid = np.zeros((density_res, density_res), dtype=np.int64)
    np.add.at(grid, (drow, dcol), 1)
    return {
        "resolutions": entries,
        "density": {"res": density_res, "counts": grid.tolist()},
        "total_points": int(xs.size),
    }


def sample_bytes_per_cell(scope_input_path, image_column, cell_size,
                          quality=80, sample=48):
    """Estimate the encoded WebP bytes per populated cell by packing a sample of
    real images at *cell_size* and measuring. Accounts for content, cell size,
    quality and packing. Returns None if no images can be sampled."""
    import io
    import math

    import pyarrow.parquet as pq
    from PIL import Image, ImageOps

    pf = pq.ParquetFile(scope_input_path)
    thumbs = []
    for batch in pf.iter_batches(batch_size=128, columns=[image_column]):
        for v in batch.column(0).to_pylist():
            raw = _image_bytes(v)
            if raw is None:
                continue
            try:
                img = Image.open(io.BytesIO(raw)).convert("RGBA")
                thumbs.append(ImageOps.fit(img, (cell_size, cell_size)))
            except Exception:
                continue
            if len(thumbs) >= sample:
                break
        if len(thumbs) >= sample:
            break
    if not thumbs:
        return None

    n = len(thumbs)
    side = math.ceil(math.sqrt(n))
    mosaic = Image.new("RGBA", (side * cell_size, side * cell_size), (0, 0, 0, 0))
    for i, t in enumerate(thumbs):
        mosaic.paste(t, ((i % side) * cell_size, (i // side) * cell_size), t)
    buf = io.BytesIO()
    mosaic.save(buf, format="WEBP", quality=quality)
    return buf.getbuffer().nbytes / n


def generate_sprite_atlas(dataset_id, scope_id, image_column,
                          resolutions=DEFAULT_RESOLUTIONS, cell_size=DEFAULT_CELL_SIZE,
                          samples=1, quality=80, tile_px=DEFAULT_TILE_PX):
    """Build a tiled representative-image atlas pyramid for *scope_id*.

    Output layout::

        <DATA_DIR>/<dataset>/scopes/atlases/<scope>/<column>/
            manifest.json
            r<R>/t<tx>_<ty>/sheet_000.webp
            ...

    One parquet pass: each source image is decoded once, fit to a cell-sized
    square, and pasted into the relevant tile of every resolution. Tile images
    are allocated lazily, so only populated tiles consume memory or disk.
    """
    import io

    import pyarrow.parquet as pq
    from PIL import Image, ImageOps

    if samples < 1:
        raise ValueError("samples must be >= 1")
    if cell_size < 1:
        raise ValueError("cell_size must be >= 1")
    if tile_px < cell_size:
        raise ValueError("tile_px must be >= cell_size")

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
    if "x" not in available or "y" not in available:
        raise ValueError(
            f"scope-input parquet {scope_input_path} is missing x/y columns; "
            "re-run the scope step"
        )

    resolutions = sorted(set(resolutions))
    tc = tile_cells(cell_size, tile_px)
    has_deleted = "deleted" in available
    read_columns = [image_column, "x", "y"]
    if has_deleted:
        read_columns.append("deleted")

    run_id = f"sprite-atlas-{scope_id}-{image_column}-c{cell_size}"
    print("RUNNING:", run_id)
    for r in resolutions:
        T = tiles_per_axis(r, cell_size, tile_px)
        print(f"  resolution {r}x{r}: {r * cell_size}px -> {T}x{T} tiles")

    # tiles[(r, tx, ty, sheet)] -> PIL image (lazy). filled[r][cell_index] -> count.
    tiles = {}
    filled = {r: {} for r in resolutions}

    def tile_pixels(r, tx, ty):
        w_cells = min(tc, r - tx * tc)
        h_cells = min(tc, r - ty * tc)
        return w_cells * cell_size, h_cells * cell_size

    def get_tile(r, tx, ty, sheet_index):
        key = (r, tx, ty, sheet_index)
        img = tiles.get(key)
        if img is None:
            w, h = tile_pixels(r, tx, ty)
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            tiles[key] = img
        return img

    def paste(r, cell_idx, sheet_index, thumb):
        col = cell_idx % r
        row = cell_idx // r
        # Flip vertically: grid row 0 is data-y = -1 (bottom), image row 0 is top.
        row_img = r - 1 - row
        tx, ty = col // tc, row_img // tc
        lx = (col % tc) * cell_size
        ly = (row_img % tc) * cell_size
        get_tile(r, tx, ty, sheet_index).paste(thumb, (lx, ly), thumb)

    total = parquet_file.metadata.num_rows
    with tqdm(total=total, desc=run_id) as pbar:
        for rg in range(parquet_file.metadata.num_row_groups):
            table = parquet_file.read_row_group(rg, columns=read_columns)
            batch = table.to_pydict()
            n = len(batch[image_column])
            for i in range(n):
                pbar.update(1)
                if has_deleted and batch["deleted"][i]:
                    continue

                x = batch["x"][i]
                y = batch["y"][i]
                wants = []
                for r in resolutions:
                    cell_idx = tile_index(x, y, r)
                    count = filled[r].get(cell_idx, 0)
                    if count < samples:
                        wants.append((r, cell_idx, count))
                if not wants:
                    continue

                raw = _image_bytes(batch[image_column][i])
                if raw is None:
                    continue
                try:
                    img = Image.open(io.BytesIO(raw)).convert("RGBA")
                    thumb = ImageOps.fit(img, (cell_size, cell_size))
                except Exception:
                    continue

                for r, cell_idx, count in wants:
                    paste(r, cell_idx, count, thumb)
                    filled[r][cell_idx] = count + 1

    out_root = atlas_root(DATA_DIR, dataset_id, scope_id, image_column)
    os.makedirs(out_root, exist_ok=True)

    # Save populated tiles and build the manifest.
    written = 0
    resolution_entries = []
    for r in resolutions:
        T = tiles_per_axis(r, cell_size, tile_px)
        # per-tile filled-cell counts (derive from the cell index of each filled cell)
        tile_counts = {}
        for cell_idx in filled[r]:
            col = cell_idx % r
            row_img = r - 1 - (cell_idx // r)
            key = (col // tc, row_img // tc)
            tile_counts[key] = tile_counts.get(key, 0) + 1

        tile_entries = []
        for (tx, ty) in sorted(tile_counts):
            tdir = os.path.join(out_root, atlas_tile_dir(r, tx, ty))
            os.makedirs(tdir, exist_ok=True)
            for k in range(samples):
                img = tiles.get((r, tx, ty, k))
                if img is None:
                    continue
                target = os.path.join(tdir, atlas_sheet_name(k))
                tmp = target + ".tmp"
                img.save(tmp, format="WEBP", quality=quality)
                os.replace(tmp, target)
                written += 1
            tile_entries.append({
                "tx": tx,
                "ty": ty,
                "filled_cells": tile_counts[(tx, ty)],
            })

        resolution_entries.append({
            "num_tiles": r,
            "cell_size": cell_size,
            "tile_px": tile_px,
            "tile_cells": tc,
            "tiles_per_axis": T,
            "full_px": r * cell_size,
            "filled_cells": len(filled[r]),
            "tiles": tile_entries,
        })

    manifest = {
        "scope_id": scope_id,
        "column": image_column,
        "cell_size": cell_size,
        "samples": samples,
        "tile_px": tile_px,
        "domain": [-1, 1],
        "resolutions": resolution_entries,
        "complete": True,
    }
    manifest_path = os.path.join(out_root, atlas_manifest_name())
    tmp_manifest = manifest_path + ".tmp"
    with open(tmp_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f)
    os.replace(tmp_manifest, manifest_path)

    print(f"wrote {written} tile sheet(s) across {len(resolutions)} resolution(s) to {out_root}")
    return manifest_path


def _parse_resolutions(value):
    return [int(v) for v in str(value).split(",") if v.strip()]


def main():
    parser = argparse.ArgumentParser(
        description="Generate a tiled representative-image atlas pyramid for a scope"
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
                        help="Number of sheets per tile (default 1)")
    parser.add_argument("--resolutions", type=_parse_resolutions,
                        default=list(DEFAULT_RESOLUTIONS),
                        help="Comma-separated grid resolutions (default 64,128,256)")
    parser.add_argument("--tile-px", type=int, default=DEFAULT_TILE_PX,
                        help="Max tile pixel size (default 2048)")
    parser.add_argument("--quality", type=int, default=80,
                        help="WebP quality 1-100 (default 80)")
    args = parser.parse_args()
    generate_sprite_atlas(
        args.dataset_id, args.scope_id, args.image_column,
        resolutions=args.resolutions, cell_size=args.cell_size,
        samples=args.samples, quality=args.quality, tile_px=args.tile_px,
    )


if __name__ == "__main__":
    main()
