#!/usr/bin/env bash
# Copy gold wasm/js/pk3 into gzdoom-s/ when the (s) artifact dir is empty.
# Does nothing if gzdoom-s/gzdoom.wasm already exists. Never touches public/wasm/gzdoom/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GOLD="$ROOT/public/wasm/gzdoom"
OUT="$ROOT/public/wasm/gzdoom-s"

if [[ -f "$OUT/gzdoom.wasm" && -f "$OUT/gzdoom.js" ]]; then
  exit 0
fi

if [[ ! -f "$GOLD/gzdoom.wasm" ]]; then
  echo "bootstrap-if-missing: skip — gold wasm not built yet (npm run build:gzdoom-wasm)" >&2
  exit 0
fi

exec bash "$(dirname "$0")/bootstrap-gzdoom-s-from-gold.sh"
