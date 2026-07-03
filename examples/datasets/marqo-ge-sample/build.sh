#!/usr/bin/env bash
# Rebuild recipe: marqo-ge-sample — 20k e-commerce products with IMAGES.
# The 1.0 hero demo: image map (sprite atlas) + color-by (position/source).
#
# SOURCE (verify/adjust): a 20k sample of Marqo's general e-commerce / shopping
# dataset (google_shopping + amazon_product). Columns: image (binary), title,
# query, position (numeric), source (categorical), item_ID.
#   Obtain a parquet/CSV with an `image` column + `title` and land it at:
#     $INPUT  (default: $LATENT_SCOPE_DATA/../sources/marqo-ge-sample.parquet)
#   e.g. from a Hugging Face dataset via `datasets.load_dataset(...).to_parquet()`.
set -euo pipefail
source "$(dirname "$0")/../_lib.sh"

DS="marqo-ge-sample"
INPUT="${INPUT:-$LATENT_SCOPE_DATA/../sources/marqo-ge-sample.parquet}"
require_input "$INPUT"

ls_ingest  "$DS" --path "$INPUT" --text_column title
# CLIP embeds the auto-detected image column (multimodal). 512-dim.
ls_embed   "$DS" title clip-openai___clip-vit-base-patch32
ls_umap    "$DS" embedding-001 25 0.075 --name "CLIP images"
ls_cluster "$DS" umap-001 30 5 0.0 --method evoc --name "evoc 30"
# No LLM labels for the image demo — use the auto default labels.
ls_scope   "$DS" embedding-001 umap-001 cluster-001 default \
  "Marqo GE Sample (CLIP images)" "20k e-commerce products; image map + color-by"
# Build the tiled representative-image atlas that powers the image map.
ls_atlas   "$DS" scopes-001

echo "Done. Publish with:  ls-upload-dataset \$LATENT_SCOPE_DATA/$DS enjalot/ls-$DS"
