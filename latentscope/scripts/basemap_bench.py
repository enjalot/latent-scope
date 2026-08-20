# Usage: ls-basemap-bench <dataset_id> <embedding_id> --maps id1,id2,id3
#        ls-basemap-bench --datasets ds1,ds2 --embedding embedding-001 --maps all
#
# The visual-benchmark runner: project dataset embeddings through several
# basemaps in one pass and write a contact sheet (datasets x maps grid of the
# projection thumbnails) so maps can be compared side by side on the same
# data. Each projection is a regular umap-NNN in the dataset (cluster/scope/
# explore work on it unchanged); an existing projection for the same
# (embedding, map) pair is reused rather than recomputed.
import argparse
import glob
import html
import json
import os
import shutil


def main():
    parser = argparse.ArgumentParser(
        description='Project dataset(s) through several basemaps and build a contact sheet')
    parser.add_argument('dataset_id', type=str, nargs='?', default=None)
    parser.add_argument('embedding_id', type=str, nargs='?', default=None)
    parser.add_argument('--datasets', type=str, default=None,
                        help='Comma-separated dataset ids (alternative to positional)')
    parser.add_argument('--embedding', type=str, default=None,
                        help='Embedding id used for every dataset (default: positional '
                             'embedding_id, or the newest embedding per dataset)')
    parser.add_argument('--maps', type=str, default='all',
                        help="Comma-separated basemap registry ids, or 'all'")
    parser.add_argument('--out', type=str, default=None,
                        help='Contact-sheet output dir (default: '
                             '~/.agent/basemap-maps/projections/bench-<datasets>)')
    parser.add_argument('--device', type=str, default=None)
    parser.add_argument('--force', action='store_true',
                        help='Pass --force through to ls-basemap (skip compat checks)')
    parser.add_argument('--recompute', action='store_true',
                        help='Re-project even when a projection for the same '
                             '(embedding, map) already exists')
    args = parser.parse_args()

    datasets = ([d for d in (args.datasets or '').split(',') if d]
                or ([args.dataset_id] if args.dataset_id else []))
    if not datasets:
        raise SystemExit("no datasets given")
    embedding = args.embedding or args.embedding_id
    bench(datasets, embedding, maps=args.maps, out=args.out, device=args.device,
          force=args.force, recompute=args.recompute)


def _newest_embedding(data_dir, dataset_id):
    metas = sorted(glob.glob(os.path.join(data_dir, dataset_id, "embeddings", "embedding-*.json")))
    metas = [m for m in metas if "-tokens" not in os.path.basename(m)]
    if not metas:
        raise ValueError(f"{dataset_id}: no embeddings found")
    return os.path.splitext(os.path.basename(metas[-1]))[0]


def _existing_projection(umap_dir, embedding_id, map_id):
    for meta_path in sorted(glob.glob(os.path.join(umap_dir, "umap-*.json"))):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        basemap = meta.get("basemap") or {}
        if meta.get("embedding_id") == embedding_id and basemap.get("basemap_id") == map_id:
            return meta["id"]
    return None


def bench(datasets, embedding=None, maps='all', out=None, device=None,
          force=False, recompute=False):
    from latentscope.models import get_basemap_model_list
    from latentscope.scripts.basemap import basemapper
    from latentscope.util import get_data_dir

    data_dir = get_data_dir()
    registry = get_basemap_model_list()
    if maps == 'all':
        map_ids = [m['id'] for m in registry]
    else:
        map_ids = [m for m in maps.split(',') if m]
        known = {m['id'] for m in registry}
        unknown = [m for m in map_ids if m not in known]
        if unknown:
            raise ValueError(f"not in the basemap registry: {unknown}")

    out = out or os.path.expanduser(
        f"~/.agent/basemap-maps/projections/bench-{'-'.join(datasets)}")
    os.makedirs(out, exist_ok=True)

    grid = {}  # (dataset, map_id) -> {"umap_id": ..., "png": ...} | {"error": ...}
    for dataset_id in datasets:
        emb = embedding or _newest_embedding(data_dir, dataset_id)
        umap_dir = os.path.join(data_dir, dataset_id, "umaps")
        for map_id in map_ids:
            existing = None if recompute else _existing_projection(umap_dir, emb, map_id)
            if existing:
                print(f"{dataset_id} x {map_id}: reusing {existing}")
                umap_id = existing
            else:
                print(f"{dataset_id} x {map_id}: projecting ({emb})")
                try:
                    umap_id = basemapper(dataset_id, emb, map_id, device=device, force=force,
                                         name=f"bench {map_id}")
                except Exception as err:  # keep the sheet going; report the miss
                    print(f"  FAILED: {err}")
                    grid[(dataset_id, map_id)] = {"error": str(err)}
                    continue
            src = os.path.join(umap_dir, f"{umap_id}.png")
            thumb = f"{dataset_id}--{map_id}.png"
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(out, thumb))
            grid[(dataset_id, map_id)] = {"umap_id": umap_id, "png": thumb}

    _write_sheet(out, datasets, map_ids, registry, grid)
    print(f"contact sheet: {out}/index.html")
    return out


def _write_sheet(out, datasets, map_ids, registry, grid):
    reg = {m['id']: m for m in registry}
    cols = "".join(
        f"<th><div>{html.escape(reg[m].get('name', m))}</div>"
        f"<small>{html.escape(m)}</small></th>" for m in map_ids)
    rows = []
    for ds in datasets:
        cells = []
        for m in map_ids:
            cell = grid.get((ds, m)) or {}
            if "png" in cell:
                cells.append(
                    f'<td><a href="{cell["png"]}"><img src="{cell["png"]}" loading="lazy">'
                    f'</a><small>{cell["umap_id"]}</small></td>')
            else:
                cells.append(f'<td class="err">{html.escape(cell.get("error", "missing"))}</td>')
        rows.append(f"<tr><th>{html.escape(ds)}</th>{''.join(cells)}</tr>")
    with open(os.path.join(out, "index.html"), "w") as f:
        f.write(f"""<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>basemap bench — {html.escape(', '.join(datasets))}</title>
<style>
 body {{ font-family: system-ui; margin: 1.5rem; color: #1a202c; }}
 table {{ border-collapse: collapse }}
 th, td {{ padding: 6px; text-align: center; vertical-align: top; border: 1px solid #e2e8f0 }}
 img {{ width: 300px; display: block }}
 td.err {{ color: #c53030; font-size: .8rem; max-width: 300px }}
 small {{ color: #4a5568 }}
</style>
<h1>Basemap bench</h1>
<p>Datasets projected through each registered map — same data, different frames.
Red points over each map's density underlay.</p>
<table><tr><th></th>{cols}</tr>{''.join(rows)}</table>
""")


if __name__ == "__main__":
    main()
