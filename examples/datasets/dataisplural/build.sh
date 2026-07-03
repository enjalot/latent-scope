#!/usr/bin/env bash
# Rebuild recipe: dataisplural — ~2k Data Is Plural newsletter entries.
#
# SOURCE (verify/adjust): the Data Is Plural archive as a CSV/parquet with a
# `text` column (~2k rows). Land it at $INPUT (default: .../sources/dataisplural.csv).
# Needs OPENAI_API_KEY for the label step (or swap the model).
set -euo pipefail
source "$(dirname "$0")/../_lib.sh"

DS="dataisplural"
INPUT="${INPUT:-$LATENT_SCOPE_DATA/../sources/dataisplural.csv}"
require_input "$INPUT"

ls_ingest  "$DS" --path "$INPUT" --text_column text
ls_embed   "$DS" text transformers-jinaai___jina-embeddings-v5-text-nano-retrieval --prefix "Document: "
ls_umap    "$DS" embedding-001 25 0.1 --name "jina-v5-nano n25"
ls_cluster "$DS" umap-001 5 5 0.0 --method evoc --name "evoc 5"
ls_label   "$DS" text cluster-001 openai-gpt-4o-mini 10 ""
ls_scope   "$DS" embedding-001 umap-001 cluster-001 cluster-001-labels-001 \
  "Data Is Plural" "~2k Data Is Plural newsletter entries"

echo "Done. Publish with:  ls-upload-dataset \$LATENT_SCOPE_DATA/$DS enjalot/ls-$DS"
