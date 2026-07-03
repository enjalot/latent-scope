#!/usr/bin/env bash
# Rebuild recipe: dadabase — 53k dad jokes. The fast text quickstart.
#
# SOURCE (verify/adjust): a CSV/parquet with a `joke` text column (~53k rows).
#   Land it at $INPUT (default: $LATENT_SCOPE_DATA/../sources/dadabase.csv).
# Needs OPENAI_API_KEY for the LLM label step (or swap the label model).
set -euo pipefail
source "$(dirname "$0")/../_lib.sh"

DS="dadabase"
INPUT="${INPUT:-$LATENT_SCOPE_DATA/../sources/dadabase.csv}"
require_input "$INPUT"

ls_ingest  "$DS" --path "$INPUT" --text_column joke
ls_embed   "$DS" joke huggingface-jinaai___jina-embeddings-v5-text-nano-retrieval
ls_umap    "$DS" embedding-001 100 0.1 --name "jina-v5-nano n100"
ls_cluster "$DS" umap-001 25 5 0.0 --method evoc --name "evoc 25"
ls_label   "$DS" joke cluster-001 openai-gpt-4o 10 ""
ls_scope   "$DS" embedding-001 umap-001 cluster-001 cluster-001-labels-001 \
  "Dadabase" "53k dad jokes"

echo "Done. Publish with:  ls-upload-dataset \$LATENT_SCOPE_DATA/$DS enjalot/ls-$DS"
