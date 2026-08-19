#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:5150/}"

if curl -sf --connect-timeout 3 "$URL" -o /dev/null; then
  echo "PASS: dev server reachable at $URL"
  exit 0
else
  echo "FAIL: nothing listening at $URL"
  echo "  Start it in Terminal.app:  ./scripts/start-dev.sh"
  echo "  (Agent/Cursor shells cannot keep a server running for your browser.)"
  exit 1
fi
