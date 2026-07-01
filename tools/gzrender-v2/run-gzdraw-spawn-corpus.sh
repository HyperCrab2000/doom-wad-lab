#!/usr/bin/env bash
# Step 2d — spawn probe (probe-0) native ≡ WASM for all stock maps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export GZDOOM_TIMEOUT="${GZDOOM_TIMEOUT:-90}"

bash tools/gzrender-v2/build-gzdoom-pk3.sh

echo "=== 2d native baselines DOOM ==="
npx tsx tools/gzrender-v2/gzdraw-corpus.mts public/wads/DOOM.WAD --native-only --probes 0 --jobs 4 --force

echo "=== 2d native baselines DOOM2 ==="
npx tsx tools/gzrender-v2/gzdraw-corpus.mts public/wads/DOOM2.WAD --native-only --probes 0 --jobs 4 --force

echo "=== 2d spawn corpus DOOM ==="
npx tsx tools/gzrender-v2/gzdraw-corpus.mts public/wads/DOOM.WAD --wasm --probes 0 --force

echo "=== 2d spawn corpus DOOM2 ==="
npx tsx tools/gzrender-v2/gzdraw-corpus.mts public/wads/DOOM2.WAD --wasm --probes 0 --force

echo "2d spawn corpus: DONE"
