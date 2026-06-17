#!/usr/bin/env bash
# Build GZDoom resource pk3 archives and copy them beside the gzdoom binary.
#
# Notes:
# - `ninja gzdoom` alone does NOT produce pk3 files in this tree.
# - macOS /bin/bash is 3.2 — no associative arrays; keep this script bash-3-safe.
# - zipdir on macOS must recurse subdirs (patched in gzdoom-project/tools/zipdir/zipdir.c).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"
GZDOOM_ROOT="$(resolve_gzdoom_root)" || GZDOOM_ROOT=""
BUILD_DIR="${GZDOOM_BUILD:-${GZDOOM_ROOT:+$GZDOOM_ROOT/build}}"
ZIPDIR="$BUILD_DIR/tools/zipdir/zipdir"
DEST="${GZDOOM_PK3_DIR:-$BUILD_DIR/gzdoom.app/Contents/MacOS}"
LOG_DIR="${GZRENDER_LOG_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/artifacts/gzrender-v2/logs}"
LOG_FILE="$LOG_DIR/build-gzdoom-pk3.log"

mkdir -p "$BUILD_DIR" "$DEST" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

if [[ -z "$GZDOOM_ROOT" ]]; then
  die "GZDOOM_ROOT not found — expected sibling doom/gzdoom-project (or set GZDOOM_ROOT)"
fi

if [[ ! -x "$ZIPDIR" ]]; then
  die "zipdir not found at $ZIPDIR — run: tools/gzrender-v2/build-gzdoom.sh (builds zipdir first)"
fi

build_pk3() {
  local pk3_name="$1"
  local src_dir="$2"
  local out="$BUILD_DIR/$pk3_name"

  if [[ ! -d "$src_dir" ]]; then
    log "skip $pk3_name (missing $src_dir)"
    return 0
  fi

  log "==> zipdir -f $out <- $src_dir"
  if ! "$ZIPDIR" -f "$out" "$src_dir" >>"$LOG_FILE" 2>&1; then
    die "zipdir failed for $pk3_name (see $LOG_FILE)"
  fi

  cp -f "$out" "$DEST/$pk3_name"
  log "built $pk3_name -> $DEST/$pk3_name"
}

log "build-gzdoom-pk3: GZDOOM_ROOT=$GZDOOM_ROOT"
log "build-gzdoom-pk3: DEST=$DEST"

build_pk3 gzdoom.pk3 "$GZDOOM_ROOT/wadsrc/static"
build_pk3 game_support.pk3 "$GZDOOM_ROOT/wadsrc_extra/static"
build_pk3 brightmaps.pk3 "$GZDOOM_ROOT/wadsrc_bm/static"
build_pk3 lights.pk3 "$GZDOOM_ROOT/wadsrc_lights/static"
build_pk3 game_widescreen_gfx.pk3 "$GZDOOM_ROOT/wadsrc_widepix/static"

# Sanity: gzdoom.pk3 must contain shaders (macOS zipdir used to ship only top-level lumps).
if ! python3 - "$DEST/gzdoom.pk3" <<'PY' >>"$LOG_FILE" 2>&1; then
import sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    if 'shaders/glsl/main.vp' not in names:
        print('MISSING shaders/glsl/main.vp in', path)
        print('file count', len(names))
        sys.exit(1)
    print('pk3 ok:', path, 'files', len(names), 'shaders/glsl/main.vp present')
PY
  die "gzdoom.pk3 sanity check failed (see $LOG_FILE)"
fi

log "build-gzdoom-pk3: done"
