#!/usr/bin/env bash
# Bootstrap public/wasm/gzdoom-s/ from gold oracle assets for dev/testing.
# Copies gzdoom.js + gzdoom.wasm + pk3s into gzdoom-s/ — NEVER modifies public/wasm/gzdoom/.
# Runtime (s) host loads ONLY from /wasm/gzdoom-s/, not gold paths.
#
# Replace with stripped build when ready:
#   bash tools/gzrender-v2/build-gzdoom-s-wasm-emscripten-legacy.sh
#   OR npm run build:gzdoom-s-wasm (pure wasm, when wasi-sdk lands)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GOLD="$ROOT/public/wasm/gzdoom"
OUT="$ROOT/public/wasm/gzdoom-s"

[[ -f "$GOLD/gzdoom.wasm" && -f "$GOLD/gzdoom.js" ]] \
  || { echo "ERROR: gold artifact missing — run npm run build:gzdoom-wasm first" >&2; exit 1; }

mkdir -p "$OUT"
for f in gzdoom.js gzdoom.wasm gzdoom.pk3 gzdoom-wasm-shaders.pk3 game_support.pk3 \
  game_widescreen_gfx.pk3 brightmaps.pk3 lights.pk3; do
  cp "$GOLD/$f" "$OUT/$f"
done

echo "Bootstrapped gzdoom-s from gold ($(wc -c <"$OUT/gzdoom.wasm" | tr -d ' ') bytes wasm)"
echo "  $OUT"
echo "Gold oracle unchanged: $GOLD"
