#!/usr/bin/env bash
# Rebuild recipe: common-corpus-100k — 100k docs from PleIAs/common_corpus.
#
# SOURCE (verify/adjust): a 100k sample of PleIAs/common_corpus with a `text`
# column. Land it at $INPUT (default: .../sources/common-corpus-100k.parquet).
# Uses jina-embeddings-v3 (1024-dim, multilingual). nltk labels — no API key.
set -euo pipefail
source "$(dirname "$0")/../_lib.sh"

DS="common-corpus-100k"
INPUT="${INPUT:-$LATENT_SCOPE_DATA/../sources/common-corpus-100k.parquet}"
require_input "$INPUT"

ls_ingest  "$DS" --path "$INPUT" --text_column text
ls_embed   "$DS" text transformers-jinaai___jina-embeddings-v3
ls_umap    "$DS" embedding-001 25 0.1 --name "jina-v3 n25"
ls_cluster "$DS" umap-001 25 5 0.0 --method evoc --name "evoc 25"
ls_label   "$DS" text cluster-001 nltk-top-words 10 ""
ls_scope   "$DS" embedding-001 umap-001 cluster-001 cluster-001-labels-001 \
  "Common Corpus 100k" "100k documents from Common Corpus"

echo "Done. Publish with:  ls-upload-dataset \$LATENT_SCOPE_DATA/$DS enjalot/ls-$DS"
