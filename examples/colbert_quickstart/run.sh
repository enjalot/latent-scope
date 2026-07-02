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

# Resolve where the ls-* CLIs live so this works for BOTH a pip-installed user
# and a dev checkout. Precedence: explicit $LS_BIN → CLIs on PATH (pip install)
# → the dev checkout's .venv.
if [[ -n "${LS_BIN:-}" ]]; then
  BIN="${LS_BIN%/}/"
elif command -v ls-ingest >/dev/null 2>&1; then
  BIN=""                                 # installed on PATH
elif [[ -x "$REPO/.venv/bin/ls-ingest" ]]; then
  BIN="$REPO/.venv/bin/"
else
  echo "error: latent-scope CLIs not found. Install it (pip install latentscope)" >&2
  echo "       or set LS_BIN to the directory containing ls-ingest." >&2
  exit 1
fi
# A python interpreter that can import latentscope (for build_data.py / verify.py).
if [[ -n "$BIN" && -x "${BIN}python" ]]; then PY="${BIN}python"
elif command -v python3 >/dev/null 2>&1; then PY="python3"
else PY="python"; fi

export LATENT_SCOPE_DATA="${LATENT_SCOPE_DATA:-/data/latent-scope}"
export CUDA_VISIBLE_DEVICES=""          # force CPU; GPU is reserved for training
export HF_HOME="${HF_HOME:-/data/hf}"   # land model downloads on the big volume

DATASET="colbert-quickstart"
MODEL="colbert-answerdotai___answerai-colbert-small-v1"

echo "== building dataset =="
"$PY" "$HERE/build_data.py"

echo "== ingest =="
"${BIN}ls-ingest" "$DATASET" --path "$HERE/colbert_sentences.csv" --text_column text

echo "== embed (ColBERT late-interaction, CPU) =="
"${BIN}ls-embed" "$DATASET" text "$MODEL"

echo "== umap =="
"${BIN}ls-umap" "$DATASET" embedding-001 15 0.1

echo "== cluster (hdbscan) =="
"${BIN}ls-cluster" "$DATASET" umap-001 5 3 0.0 --method hdbscan

echo "== scope =="
"${BIN}ls-scope" "$DATASET" embedding-001 umap-001 cluster-001 default \
  "ColBERT quickstart" "tiny late-interaction demo"

echo "== verify late-interaction search =="
"$PY" "$HERE/verify.py"

echo
echo "Done. Explore it with:"
echo "  LATENT_SCOPE_DATA=$LATENT_SCOPE_DATA ${BIN}ls-serve"
echo "then open the '$DATASET' dataset in the browser."
