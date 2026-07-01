#!/usr/bin/env bash
# Capture a GZDRAW v1 oracle from native GZDoom at a fixed view.
#
# Usage:
#   tools/gzrender-v2/capture-gzdoom-gzdraw.sh [iwad] [map] [gzstate] [view] [out.gzdraw] [probeId]
#
# view: x,y,yaw or x,y,yaw,pitch (map units + degrees)
#
# Logs:
#   artifacts/gzrender-v2/logs/capture-gzdraw-<map>-probe-<id>.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
# shellcheck source=gzdoom-run-batch.sh
source "$SCRIPT_DIR/gzdoom-run-batch.sh"
GZDOOM="$(resolve_gzdoom_bin)" || GZDOOM=""
IWAD="${1:-$ROOT/public/wads/DOOM.WAD}"
MAP="${2:-E1M1}"
GZSTATE="${3:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}.gzstate}"
VIEW="${4:--960,-3200,90}"
OUT_DRAW="${5:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}.gzdraw}"
PROBE_ID="${6:-0}"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/capture-gzdraw-${MAP}-probe-${PROBE_ID}.log"

mkdir -p "$(dirname "$OUT_DRAW")" "$LOG_DIR"
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

if [[ ! -f "$GZSTATE" ]]; then
  die "GZSTATE not found: $GZSTATE — run capture-gzdoom-ref-frame.sh first"
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

export SDL_VIDEO_HIGHDPI_DISABLED="${SDL_VIDEO_HIGHDPI_DISABLED:-1}"

GZDOOM_HOME="$(mktemp -d 2>/dev/null || mktemp -d -t gzdoom-gzdraw)"
trap 'rm -rf "$GZDOOM_HOME"' EXIT

log "capture-gzdoom-gzdraw"
log "  iwad:    $IWAD"
log "  map:     $MAP"
log "  gzstate: $GZSTATE"
log "  view:    $VIEW"
log "  gzdraw:  $OUT_DRAW"
log "  probeId: $PROBE_ID"
log "  gzdoom:  $GZDOOM"
log "  timeout: ${GZDOOM_TIMEOUT:-45}s"
log ""

HOME="$GZDOOM_HOME" GZDOOM_BIN="$GZDOOM" run_gzdoom_batch "$LOG_FILE" -- \
  +vid_hidpi 0 +vid_fullscreen 0 +vid_defwidth 640 +vid_defheight 480 \
  +vid_rendermode 4 +vid_preferbackend 0 +r_dynlights 0 +r_drawplayersprites 0 +gl_multithread 0 +gl_lights 0 \
  -nosound -windowed \
  +wipetype 0 +screenblocks 10 +screenshot_quiet 1 +vid_scalemode 0 +vid_scale_linear 0 +gl_texture_filter 0 \
  -iwad "$IWAD" "${MAP_ARGS[@]}" \
  -loadgzstate "$GZSTATE" \
  -gzrender_only \
  -gzrender_view "$VIEW" \
  -gzdraw_probe_id "$PROBE_ID" \
  -gzdraw_dump "$OUT_DRAW"
GZ_EXIT=$?

if [[ $GZ_EXIT -eq 124 ]]; then
  die "gzdoom timed out after ${GZDOOM_TIMEOUT:-45}s"
fi

if [[ $GZ_EXIT -ne 0 ]]; then
  die "gzdoom exited $GZ_EXIT"
fi

if [[ ! -f "$OUT_DRAW" ]]; then
  die "gzdraw output not created: $OUT_DRAW"
fi

if ! rg -q "GZDRAW dumped" "$LOG_FILE"; then
  die "gzdoom ran but did not report GZDRAW dump success"
fi

DRAW_BYTES=$(wc -c <"$OUT_DRAW" | tr -d ' ')
log "SUCCESS: gzdraw $DRAW_BYTES bytes -> $OUT_DRAW"
log "log: $LOG_FILE"
