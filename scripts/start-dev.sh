#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Starting doom-wad-lab on http://127.0.0.1:5150/"
echo "Leave this terminal OPEN. Press Ctrl+C to stop."
export VITE_SKIP_WASM_BUILD=1
npx vite --host 127.0.0.1 --port 5150
