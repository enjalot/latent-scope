#!/usr/bin/env bash
# Shared helpers for the latent-scope example-dataset build recipes.
#
# Each recipe (`<name>/build.sh`) sources this file, then runs the pipeline with
# recovered parameters. The goal is a REPRODUCIBLE rebuild: the same commands
# regenerate a demo dataset in the current (1.0) data format, ready to publish
# with `ls-upload-dataset`.
#
# Env (override as needed):
#   LATENT_SCOPE_DATA   where datasets are written   (default ~/latent-scope-data)
#   LATENT_SCOPE_DEVICE cpu|cuda|auto                (default auto — uses GPU if present)
#   HF_HOME             model/dataset cache          (default ~/.cache/huggingface)
#   LS_BIN              dir holding the ls-* CLIs     (default: PATH, then dev .venv)

set -euo pipefail

# Resolve the ls-* CLIs for both a pip install and a dev checkout (mirrors
# examples/colbert_quickstart/run.sh).
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$_LIB_DIR/../.." && pwd)"
if [[ -n "${LS_BIN:-}" ]]; then
  BIN="${LS_BIN%/}/"
elif command -v ls-ingest >/dev/null 2>&1; then
  BIN=""
elif [[ -x "$REPO/.venv/bin/ls-ingest" ]]; then
  BIN="$REPO/.venv/bin/"
else
  echo "error: latent-scope CLIs not found. Install it (pip install latentscope)" >&2
  echo "       or set LS_BIN to the directory containing ls-ingest." >&2
  exit 1
fi

export LATENT_SCOPE_DATA="${LATENT_SCOPE_DATA:-$HOME/latent-scope-data}"
export LATENT_SCOPE_DEVICE="${LATENT_SCOPE_DEVICE:-auto}"
export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"

ls_ingest()  { "${BIN}ls-ingest"  "$@"; }
ls_embed()   { "${BIN}ls-embed"   "$@"; }
ls_umap()    { "${BIN}ls-umap"    "$@"; }
ls_cluster() { "${BIN}ls-cluster" "$@"; }
ls_label()   { "${BIN}ls-label"   "$@"; }
ls_scope()   { "${BIN}ls-scope"   "$@"; }
ls_atlas()   { "${BIN}ls-sprite-atlas" "$@"; }
ls_upload()  { "${BIN}ls-upload-dataset" "$@"; }

# Guard: a recipe needs an input file (CSV/parquet/jsonl). Recipes document how
# to obtain it; this just fails clearly if it's missing.
require_input() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "error: input data not found at: $path" >&2
    echo "       See the SOURCE section in this recipe for how to obtain it." >&2
    exit 1
  fi
}

echo "== recipe env: DATA=$LATENT_SCOPE_DATA DEVICE=$LATENT_SCOPE_DEVICE BIN=${BIN:-<PATH>} =="
