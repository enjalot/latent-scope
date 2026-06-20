#!/usr/bin/env bash
# ColBERT late-interaction quickstart for latent-scope.
#
# Runs the full pipeline on a tiny topical dataset, entirely on CPU (the GPU may
# be reserved for training), then verifies that late-interaction (MaxSim)
# similarity search via LanceDB returns on-topic results.
#
# Usage:  examples/colbert_quickstart/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PY="$REPO/.venv/bin"

export LATENT_SCOPE_DATA="${LATENT_SCOPE_DATA:-/data/latent-scope}"
export CUDA_VISIBLE_DEVICES=""          # force CPU; GPU is reserved for training
export HF_HOME="${HF_HOME:-/data/hf}"   # land model downloads on the big volume

DATASET="colbert-quickstart"
MODEL="colbert-answerdotai___answerai-colbert-small-v1"

echo "== building dataset =="
"$PY/python" "$HERE/build_data.py"

echo "== ingest =="
"$PY/ls-ingest" "$DATASET" --path "$HERE/colbert_sentences.csv" --text_column text

echo "== embed (ColBERT late-interaction, CPU) =="
"$PY/ls-embed" "$DATASET" text "$MODEL"

echo "== umap =="
"$PY/ls-umap" "$DATASET" embedding-001 15 0.1

echo "== cluster (hdbscan) =="
"$PY/ls-cluster" "$DATASET" umap-001 5 3 0.0 --method hdbscan

echo "== scope =="
"$PY/ls-scope" "$DATASET" embedding-001 umap-001 cluster-001 default \
  "ColBERT quickstart" "tiny late-interaction demo"

echo "== verify late-interaction search =="
"$PY/python" "$HERE/verify.py"

echo
echo "Done. Explore it with:"
echo "  LATENT_SCOPE_DATA=$LATENT_SCOPE_DATA $PY/ls-serve"
echo "then open the '$DATASET' dataset in the browser."
