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
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
# shellcheck source=gzdoom-run-batch.sh
source "$SCRIPT_DIR/gzdoom-run-batch.sh"
# shellcheck source=gzdoom-parity-args.sh
source "$SCRIPT_DIR/gzdoom-parity-args.sh"
GZDOOM="$(resolve_gzdoom_bin)" || GZDOOM=""
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
  dump_gzdoom_failure "$LOG_FILE" | tee -a "$LOG_FILE"
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

# Disable macOS Retina framebuffer scaling so PNG matches vid_defwidth × vid_defheight.
export SDL_VIDEO_HIGHDPI_DISABLED="${SDL_VIDEO_HIGHDPI_DISABLED:-1}"

# Ephemeral HOME avoids macOS config restoring vid_hidpi after +vid_hidpi 0.
GZDOOM_HOME="$(mktemp -d 2>/dev/null || mktemp -d -t gzdoom-parity)"
trap 'rm -rf "$GZDOOM_HOME"' EXIT

log "capture-gzdoom-ref-frame"
log "  iwad:   $IWAD"
log "  map:    $MAP"
log "  args:   ${MAP_ARGS[*]}"
log "  state:  $OUT_STATE"
log "  frame:  $OUT_FRAME"
log "  gzdoom: $GZDOOM"
log "  timeout: ${GZDOOM_TIMEOUT:-45}s"
log ""

HOME="$GZDOOM_HOME" GZDOOM_BIN="$GZDOOM" run_gzdoom_batch "$LOG_FILE" -- \
  "${GZDOOM_PARITY_ARGS[@]}" \
  -iwad "$IWAD" "${MAP_ARGS[@]}" \
  -dumpgzstate "$OUT_STATE" \
  -gzrender_only -gzstate_refframe "$OUT_FRAME"
GZ_EXIT=$?

if [[ $GZ_EXIT -eq 124 ]]; then
  die "gzdoom timed out after ${GZDOOM_TIMEOUT:-45}s"
fi

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

FRAME_W=""
FRAME_H=""
if command -v sips >/dev/null 2>&1; then
  FRAME_W=$(sips -g pixelWidth "$OUT_FRAME" 2>/dev/null | awk '/pixelWidth:/ {print $2}')
  FRAME_H=$(sips -g pixelHeight "$OUT_FRAME" 2>/dev/null | awk '/pixelHeight:/ {print $2}')
fi

log "SUCCESS: state $STATE_BYTES bytes -> $OUT_STATE"
log "SUCCESS: frame $FRAME_BYTES bytes -> $OUT_FRAME (${FRAME_W:-?}x${FRAME_H:-?})"
if [[ -n "$FRAME_W" && -n "$FRAME_H" && ( "$FRAME_W" != "640" || "$FRAME_H" != "480" ) ]]; then
  die "frame PNG is ${FRAME_W}x${FRAME_H}, expected 640x480 (GAP-0001) — check +vid_hidpi 0 and SDL_VIDEO_HIGHDPI_DISABLED"
fi
log "log: $LOG_FILE"
