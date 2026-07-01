#!/usr/bin/env bash
# Capture a frame from GZDoom loading geometry via -loadgzstate (same renderer as reference).
#
# Uses Node-exported GZSTATE (100% WAD data incl. REJECT/BLOCKMAP wire sections).
#
# Usage:
#   tools/gzrender-v2/capture-gzstate-import-frame.sh [gzstate] [out.png] [display-mode]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
# shellcheck source=gzdoom-run-batch.sh
source "$SCRIPT_DIR/gzdoom-run-batch.sh"
GZDOOM="$(resolve_gzdoom_bin)" || GZDOOM=""
GZSTATE="${1:-$ROOT/artifacts/gzrender-v2/node-export/E1M1.gzstate}"
OUT_FRAME="${2:-$ROOT/artifacts/gzrender-v2/gzrender-import/E1M1.png}"
DISPLAY_MODE="${3:-${DISPLAY_MODE:-full}}"
MODE_LINE="$(cd "$ROOT" && npx tsx "$SCRIPT_DIR/print-display-mode-args.mts" "$DISPLAY_MODE" 2>/dev/null | tail -1)"
read -r -a MODE_ARGS <<< "$MODE_LINE"
[[ ${#MODE_ARGS[@]} -gt 0 ]] || die "Could not resolve display mode args for: $DISPLAY_MODE"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
MAP="$(basename "$GZSTATE" .gzstate)"
# gold-standard layout: .../<MAP>/gzdoom.gzstate (or node.gzstate)
if [[ "$MAP" == "node" || "$MAP" == "ref" || "$MAP" == "gzdoom" ]]; then
  MAP="$(basename "$(dirname "$GZSTATE")")"
fi
LOG_FILE="$LOG_DIR/capture-import-${MAP}.log"

if [[ "$MAP" == MAP* ]]; then
  IWAD="${IWAD:-$ROOT/public/wads/DOOM2.WAD}"
else
  IWAD="${IWAD:-$ROOT/public/wads/DOOM.WAD}"
fi

mkdir -p "$(dirname "$OUT_FRAME")" "$LOG_DIR" "$(dirname "$GZSTATE")"
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

if [[ ! -f "$GZSTATE" ]]; then
  log "export-node-gzstate: generating $GZSTATE from $IWAD"
  npx tsx "$SCRIPT_DIR/export-node-gzstate.mts" "$IWAD" "$MAP" "$GZSTATE" >>"$LOG_DIR/export-node-${MAP}.log" 2>&1 \
    || die "Node GZSTATE export failed — see $LOG_DIR/export-node-${MAP}.log"
fi

[[ -x "$GZDOOM" ]] || die "GZDoom binary not found — run tools/gzrender-v2/build-gzdoom.sh"
[[ -f "$IWAD" ]] || die "IWAD not found: $IWAD"
[[ -f "$GZSTATE" ]] || die "GZSTATE not found: $GZSTATE"

"$SCRIPT_DIR/build-gzdoom-pk3.sh" >>"$LOG_FILE" 2>&1 || die "pk3 build failed"

export SDL_VIDEO_HIGHDPI_DISABLED="${SDL_VIDEO_HIGHDPI_DISABLED:-1}"
GZDOOM_HOME="$(mktemp -d 2>/dev/null || mktemp -d -t gzdoom-import)"
trap 'rm -rf "$GZDOOM_HOME"' EXIT

WARP_ARGS=(-warp 1 1)
if [[ "$MAP" =~ ^E([0-9])M([0-9])$ ]]; then
  WARP_ARGS=(-warp "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
elif [[ "$MAP" =~ ^MAP([0-9][0-9])$ ]]; then
  WARP_ARGS=(+map "$MAP")
fi

log "capture-gzstate-import-frame"
log "  gzstate: $GZSTATE"
log "  frame:   $OUT_FRAME"
log "  map:     $MAP"
log "  mode:    $DISPLAY_MODE"
log "  iwad:    $IWAD"
log "  timeout: ${GZDOOM_TIMEOUT:-45}s"
log ""

HOME="$GZDOOM_HOME" GZDOOM_BIN="$GZDOOM" run_gzdoom_batch "$LOG_FILE" -- \
  "${MODE_ARGS[@]}" \
  -iwad "$IWAD" "${WARP_ARGS[@]}" \
  -loadgzstate "$GZSTATE" \
  -gzrender_only -gzstate_refframe "$OUT_FRAME"
GZ_EXIT=$?

if [[ $GZ_EXIT -eq 124 ]]; then
  die "gzdoom timed out after ${GZDOOM_TIMEOUT:-45}s"
fi
if [[ $GZ_EXIT -ne 0 ]]; then
  die "gzdoom exited $GZ_EXIT"
fi
[[ -f "$OUT_FRAME" ]] || die "frame not created: $OUT_FRAME"
rg -q "GZSTATE import:" "$LOG_FILE" || die "import path did not run — check log"
rg -q "GZSTATE reference frame captured" "$LOG_FILE" || die "ref frame capture not reported"
if rg -q "GZRENDER_STATS" "$LOG_FILE"; then
  log "  stats:   $(rg 'GZRENDER_STATS' "$LOG_FILE" | tail -1)"
fi

log "SUCCESS: $OUT_FRAME"
