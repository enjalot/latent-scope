#!/usr/bin/env bash
# Rebuild recipe: fineweb-edu-100k — 100k educational web docs.
#
# SOURCE (verify/adjust): a 100k sample of HuggingFaceFW/fineweb-edu with a
# `text` column. Land it at $INPUT (default: .../sources/fineweb-edu-100k.parquet).
# Labels use nltk-top-words (TF-IDF style) — no API key needed.
set -euo pipefail
source "$(dirname "$0")/../_lib.sh"

DS="fineweb-edu-100k"
INPUT="${INPUT:-$LATENT_SCOPE_DATA/../sources/fineweb-edu-100k.parquet}"
require_input "$INPUT"

ls_ingest  "$DS" --path "$INPUT" --text_column text
ls_embed   "$DS" text transformers-jinaai___jina-embeddings-v5-text-nano-retrieval --prefix "Document: "
ls_umap    "$DS" embedding-001 25 0.1 --name "jina-v5-nano n25"
ls_cluster "$DS" umap-001 100 25 0.0 --method evoc --name "evoc 100"
ls_label   "$DS" text cluster-001 nltk-top-words 10 ""
ls_scope   "$DS" embedding-001 umap-001 cluster-001 cluster-001-labels-001 \
  "Fineweb Edu 100k" "100k educational web documents"

echo "Done. Publish with:  ls-upload-dataset \$LATENT_SCOPE_DATA/$DS enjalot/ls-$DS"
