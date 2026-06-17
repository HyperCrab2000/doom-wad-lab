#!/usr/bin/env bash
# Build GZDoom binary + pk3 resources with full logs (no tail/hidden stderr).
#
# Usage:
#   tools/gzrender-v2/build-gzdoom.sh
#   GZDOOM_ROOT=/path/to/gzdoom-project tools/gzrender-v2/build-gzdoom.sh
#
# Logs:
#   artifacts/gzrender-v2/logs/build-gzdoom.log
#   artifacts/gzrender-v2/logs/build-gzdoom-pk3.log
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
GZDOOM_ROOT="$(resolve_gzdoom_root)" || GZDOOM_ROOT=""
BUILD_DIR="${GZDOOM_BUILD:-${GZDOOM_ROOT:+$GZDOOM_ROOT/build}}"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/build-gzdoom.log"

mkdir -p "$LOG_DIR" "$BUILD_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() {
  log ""
  log "======== BUILD FAILED ========"
  log "$*"
  log "Full log: $LOG_FILE"
  log ""
  log "Last errors/warnings from log:"
  rg -n "error:|fatal|FAILED|Cannot find|Unable to load|Execution could not continue" "$LOG_FILE" 2>/dev/null | tail -40 || tail -40 "$LOG_FILE"
  exit 1
}

if [[ -z "$GZDOOM_ROOT" || ! -d "$GZDOOM_ROOT" ]]; then
  die "GZDOOM_ROOT not found — expected sibling doom/gzdoom-project (or set GZDOOM_ROOT)"
fi

if [[ ! -f "$BUILD_DIR/build.ninja" ]]; then
  die "No cmake build at $BUILD_DIR — configure first, e.g.: cd $GZDOOM_ROOT && cmake -B build -G Ninja"
fi

log "build-gzdoom: GZDOOM_ROOT=$GZDOOM_ROOT"
log "build-gzdoom: BUILD_DIR=$BUILD_DIR"
log "build-gzdoom: log=$LOG_FILE"
log ""

log "==> ninja zipdir"
if ! (cd "$BUILD_DIR" && ninja zipdir >>"$LOG_FILE" 2>&1); then
  die "ninja zipdir failed"
fi

log "==> ninja gzdoom"
if ! (cd "$BUILD_DIR" && ninja gzdoom >>"$LOG_FILE" 2>&1); then
  die "ninja gzdoom failed"
fi

BIN="$BUILD_DIR/gzdoom.app/Contents/MacOS/gzdoom"
if [[ ! -x "$BIN" ]]; then
  die "Binary missing after build: $BIN"
fi
log "binary: $BIN"

log "==> build pk3 archives"
if ! "$SCRIPT_DIR/build-gzdoom-pk3.sh"; then
  die "pk3 build failed (see $LOG_DIR/build-gzdoom-pk3.log)"
fi

log ""
log "build-gzdoom: SUCCESS"
log "  binary: $BIN"
log "  pk3:    $BUILD_DIR/gzdoom.app/Contents/MacOS/gzdoom.pk3"
log "  logs:   $LOG_FILE"
