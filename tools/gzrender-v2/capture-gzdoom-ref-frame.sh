#!/usr/bin/env bash
# Dump GZSTATE and capture a GZDoom reference PNG for frame parity.
#
# Usage:
#   tools/gzrender-v2/capture-gzdoom-ref-frame.sh [iwad] [map] [out.gzstate] [out.png]
#
# Logs:
#   artifacts/gzrender-v2/logs/capture-<map>.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GZDOOM="${GZDOOM_BIN:-/Users/williamfarmer/IdeaProjects/gzdoom-project/build/gzdoom.app/Contents/MacOS/gzdoom}"
IWAD="${1:-$ROOT/public/wads/DOOM.WAD}"
MAP="${2:-E1M1}"
OUT_STATE="${3:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}.gzstate}"
OUT_FRAME="${4:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}.png}"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/capture-${MAP}.log"

mkdir -p "$(dirname "$OUT_STATE")" "$(dirname "$OUT_FRAME")" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() {
  log ""
  log "======== CAPTURE FAILED ========"
  log "$*"
  log "Full log: $LOG_FILE"
  log ""
  log "Fatal lines from GZDoom output:"
  rg -n "Execution could not continue|I_FatalError|Cannot find|Unable to load|Could not find map|ERROR" "$LOG_FILE" 2>/dev/null | tail -30 || tail -30 "$LOG_FILE"
  exit 1
}

if [[ ! -x "$GZDOOM" ]]; then
  die "GZDoom binary not found: $GZDOOM — run: tools/gzrender-v2/build-gzdoom.sh"
fi

if [[ ! -f "$IWAD" ]]; then
  die "IWAD not found: $IWAD"
fi

if ! "$SCRIPT_DIR/build-gzdoom-pk3.sh"; then
  die "pk3 build/check failed — see $LOG_DIR/build-gzdoom-pk3.log"
fi

PK3_DIR="$(dirname "$GZDOOM")"
if [[ ! -f "$PK3_DIR/gzdoom.pk3" ]]; then
  die "Missing $PK3_DIR/gzdoom.pk3"
fi

resolve_map_args() {
  local map="$1"
  if [[ "$map" =~ ^E([0-9]+)M([0-9]+)$ ]]; then
    echo "-warp ${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"
    return
  fi
  if [[ "$map" =~ ^MAP([0-9]+)$ ]]; then
    echo "+map $map"
    return
  fi
  echo "Unsupported map name: $map (use E#M# or MAP##)" >&2
  exit 2
}

MAP_ARGS=($(resolve_map_args "$MAP"))

log "capture-gzdoom-ref-frame"
log "  iwad:   $IWAD"
log "  map:    $MAP"
log "  args:   ${MAP_ARGS[*]}"
log "  state:  $OUT_STATE"
log "  frame:  $OUT_FRAME"
log "  gzdoom: $GZDOOM"
log ""

set +e
"$GZDOOM" -batchout /dev/null -nosound -windowed \
  +wipetype 0 +screenblocks 11 +screenshot_quiet 1 \
  +vid_fullscreen 0 +vid_defwidth 640 +vid_defheight 480 +vid_hidpi 0 \
  -iwad "$IWAD" "${MAP_ARGS[@]}" \
  -dumpgzstate "$OUT_STATE" -gzstate_refframe "$OUT_FRAME" >>"$LOG_FILE" 2>&1
GZ_EXIT=$?
set -e

if [[ $GZ_EXIT -ne 0 ]]; then
  die "gzdoom exited $GZ_EXIT"
fi

if [[ ! -f "$OUT_STATE" ]]; then
  die "state output not created: $OUT_STATE"
fi

if [[ ! -f "$OUT_FRAME" ]]; then
  die "frame output not created: $OUT_FRAME"
fi

if ! rg -q "GZSTATE dumped" "$LOG_FILE"; then
  die "gzdoom ran but did not report GZSTATE dump success"
fi

if ! rg -q "GZSTATE reference frame captured" "$LOG_FILE"; then
  die "gzdoom ran but did not report reference frame capture"
fi

STATE_BYTES=$(wc -c <"$OUT_STATE" | tr -d ' ')
FRAME_BYTES=$(wc -c <"$OUT_FRAME" | tr -d ' ')
log "SUCCESS: state $STATE_BYTES bytes -> $OUT_STATE"
log "SUCCESS: frame $FRAME_BYTES bytes -> $OUT_FRAME"
log "log: $LOG_FILE"
