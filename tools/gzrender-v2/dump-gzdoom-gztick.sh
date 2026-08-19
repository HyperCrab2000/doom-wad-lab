#!/usr/bin/env bash
# Dump GZDoom GZTICK for a map at tick N (t=0 map lump; t>0 runtime sectors + actors).
#
# Usage:
#   tools/gzrender-v2/dump-gzdoom-gztick.sh [iwad] [map] [tick] [out.gztick] [script]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
GZDOOM="$(resolve_gzdoom_bin)" || GZDOOM=""
IWAD="${1:-$ROOT/public/wads/DOOM.WAD}"
MAP="${2:-E1M1}"
TICK="${3:-0}"
OUT="${4:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}_t${TICK}.gztick}"
GZTICK_SCRIPT="${5:-}"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/dump-gztick-${MAP}-t${TICK}.log"

mkdir -p "$(dirname "$OUT")" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() {
  log ""
  log "======== GZTICK DUMP FAILED ========"
  log "$*"
  log "Full log: $LOG_FILE"
  exit 1
}

if [[ -z "$GZDOOM" || ! -x "$GZDOOM" ]]; then
  die "GZDoom binary not found — build gzdoom-project first"
fi

if [[ ! -f "$IWAD" ]]; then
  die "IWAD not found: $IWAD"
fi

if ! "$SCRIPT_DIR/build-gzdoom-pk3.sh"; then
  die "pk3 build/check failed"
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
  echo "Unsupported map name: $map" >&2
  exit 2
}

MAP_ARGS=($(resolve_map_args "$MAP"))
DUMP_ARG="${TICK},${OUT}"
SCRIPT_ARGS=()
if [[ -n "$GZTICK_SCRIPT" ]]; then
  SCRIPT_ARGS=(-gztick_script "$GZTICK_SCRIPT")
fi

log "dump-gzdoom-gztick"
log "  iwad: $IWAD"
log "  map:  $MAP"
log "  tick: $TICK"
log "  out:  $OUT"
if [[ -n "$GZTICK_SCRIPT" ]]; then
  log "  script: $GZTICK_SCRIPT"
fi
log "  gzdoom: $GZDOOM"
log ""

set +e
if ((${#SCRIPT_ARGS[@]} > 0)); then
  "$GZDOOM" -batchout /dev/null -nosound -nomonsters -iwad "$IWAD" "${MAP_ARGS[@]}" "${SCRIPT_ARGS[@]}" -dumpgztick "$DUMP_ARG" >>"$LOG_FILE" 2>&1
else
  "$GZDOOM" -batchout /dev/null -nosound -nomonsters -iwad "$IWAD" "${MAP_ARGS[@]}" -dumpgztick "$DUMP_ARG" >>"$LOG_FILE" 2>&1
fi
GZ_EXIT=$?
set -e

if [[ $GZ_EXIT -ne 0 ]]; then
  die "gzdoom exited $GZ_EXIT"
fi

if [[ ! -f "$OUT" ]]; then
  die "output not created: $OUT"
fi

if ! rg -q "GZTICK dumped" "$LOG_FILE"; then
  die "gzdoom ran but did not report GZTICK dump success"
fi

BYTES=$(wc -c <"$OUT" | tr -d ' ')
log "SUCCESS: wrote $BYTES bytes -> $OUT"
log "log: $LOG_FILE"
