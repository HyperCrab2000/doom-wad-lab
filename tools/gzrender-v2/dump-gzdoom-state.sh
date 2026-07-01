#!/usr/bin/env bash
# Dump GZDoom post-load GZSTATE for a map.
#
# Usage:
#   tools/gzrender-v2/dump-gzdoom-state.sh [iwad] [map] [out.gzstate]
#
# Logs:
#   artifacts/gzrender-v2/logs/dump-<map>.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
GZDOOM="$(resolve_gzdoom_bin)" || GZDOOM=""
IWAD="${1:-$ROOT/public/wads/DOOM.WAD}"
MAP="${2:-E1M1}"
OUT="${3:-$ROOT/artifacts/gzrender-v2/gzdoom/${MAP}.gzstate}"
LOG_DIR="${GZRENDER_LOG_DIR:-$ROOT/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/dump-${MAP}.log"

mkdir -p "$(dirname "$OUT")" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() {
  log ""
  log "======== DUMP FAILED ========"
  log "$*"
  log "Full log: $LOG_FILE"
  log ""
  log "Fatal lines from GZDoom output:"
  rg -n "Execution could not continue|I_FatalError|Cannot find|Unable to load|Could not find map|ERROR" "$LOG_FILE" 2>/dev/null | tail -30 || tail -30 "$LOG_FILE"
  exit 1
}

if [[ -z "$GZDOOM" || ! -x "$GZDOOM" ]]; then
  die "GZDoom binary not found — set GZDOOM_BIN or build: tools/gzrender-v2/build-gzdoom.sh (expected under doom/gzdoom-project)"
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
    # Doom II: -warp episode/map does not select MAP##; use +map.
    echo "+map $map"
    return
  fi
  echo "Unsupported map name: $map (use E#M# or MAP##)" >&2
  exit 2
}

MAP_ARGS=($(resolve_map_args "$MAP"))

log "dump-gzdoom-state"
log "  iwad:  $IWAD"
log "  map:   $MAP"
log "  args:  ${MAP_ARGS[*]}"
log "  out:   $OUT"
log "  gzdoom: $GZDOOM"

# Optional extra CLI tokens (e.g. -file mod.wad +cvar). One token per line or space-separated.
EXTRA_ARGS=()
if [[ -n "${GZDOOM_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  EXTRA_ARGS=($GZDOOM_EXTRA_ARGS)
  log "  extra: ${EXTRA_ARGS[*]}"
fi
log ""

set +e
if ((${#EXTRA_ARGS[@]})); then
  "$GZDOOM" -batchout /dev/null -nosound -iwad "$IWAD" "${EXTRA_ARGS[@]}" "${MAP_ARGS[@]}" -dumpgzstate "$OUT" >>"$LOG_FILE" 2>&1
else
  "$GZDOOM" -batchout /dev/null -nosound -iwad "$IWAD" "${MAP_ARGS[@]}" -dumpgzstate "$OUT" >>"$LOG_FILE" 2>&1
fi
GZ_EXIT=$?
set -e

if [[ $GZ_EXIT -ne 0 ]]; then
  die "gzdoom exited $GZ_EXIT"
fi

if [[ ! -f "$OUT" ]]; then
  die "output not created: $OUT"
fi

if ! rg -q "GZSTATE dumped" "$LOG_FILE"; then
  die "gzdoom ran but did not report GZSTATE dump success"
fi

BYTES=$(wc -c <"$OUT" | tr -d ' ')
log "SUCCESS: wrote $BYTES bytes -> $OUT"
log "log: $LOG_FILE"
