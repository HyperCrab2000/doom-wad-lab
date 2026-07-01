#!/usr/bin/env bash
# Wave 4 — native GZDRAW baseline captures (resumable; skips existing artifacts).
#
# Usage:
#   tools/gzrender-v2/run-wave4-native-baseline.sh [jobs]
#
# Phases:
#   1. E1M1 full probe grid (329)
#   2. DOOM all maps spawn probe (probe 0)
#   3. DOOM2 all maps spawn probe (probe 0)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JOBS="${1:-6}"
LOG="$ROOT/artifacts/gzrender-v2/logs/wave4-native-baseline.log"
mkdir -p "$(dirname "$LOG")"

log() { printf '%s\n' "$*" | tee -a "$LOG"; }

run_corpus() {
  local iwad="$1"
  shift
  log ""
  log "==> gzdraw-corpus $* $iwad (jobs=$JOBS)"
  npx tsx "$ROOT/tools/gzrender-v2/gzdraw-corpus.mts" "$iwad" --native-only --jobs "$JOBS" "$@" 2>&1 | tee -a "$LOG"
}

log "wave4-native-baseline started $(date -u +%Y-%m-%dT%H:%M:%SZ)"

run_corpus "$ROOT/public/wads/DOOM.WAD" --maps E1M1
run_corpus "$ROOT/public/wads/DOOM.WAD" --probes 0
run_corpus "$ROOT/public/wads/DOOM2.WAD" --probes 0

log "wave4-native-baseline finished $(date -u +%Y-%m-%dT%H:%M:%SZ)"
