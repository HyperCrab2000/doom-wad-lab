#!/usr/bin/env bash
# Step 2 overnight gate loop — rebuild WASM (optional) + full 68-map corpus.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GZDOOM_BUILD="${GZDOOM_BUILD:-$ROOT/../gzdoom-project/build-wasm}"
LOG_DIR="$ROOT/artifacts/gzrender-v2/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/overnight-step2-$STAMP.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG") 2>&1

echo "=== Step 2 overnight corpus $STAMP ==="

if [[ "${SKIP_REBUILD:-0}" != "1" && -d "$GZDOOM_BUILD" ]]; then
  echo "Rebuilding WASM..."
  (cd "$GZDOOM_BUILD" && ninja zdoom)
  cp "$GZDOOM_BUILD/gzdoom.js" "$GZDOOM_BUILD/gzdoom.wasm" "$ROOT/public/wasm/gzdoom/"
fi

cd "$ROOT"
if ! curl -sf -o /dev/null "${TEST_URL:-http://localhost:5150}/"; then
  echo "Dev server not up — start: npm run dev"
  exit 2
fi

npm run gzdoom-wasm:corpus:all
echo "=== Done $(date) — log: $LOG ==="
