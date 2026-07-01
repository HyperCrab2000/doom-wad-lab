#!/usr/bin/env bash
# Build GZDoom (s) as pure WASM — clang/wasi, NOT Emscripten.
# NEVER writes to public/wasm/gzdoom/ (gold oracle).
#
# Gold (always keep working): npm run build:gzdoom-wasm
# Output (s): doom-wad-lab/public/wasm/gzdoom-s/gzdoom.wasm (+ pk3s copied from gold)
#
# Usage: tools/gzrender-v2/build-gzdoom-s-pure-wasm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"

GZDOOM_ROOT="$(resolve_gzdoom_root)"
GOLD_WASM_DIR="$ROOT/public/wasm/gzdoom"
OUT_DIR="$ROOT/public/wasm/gzdoom-s"
BUILD_DIR="$GZDOOM_ROOT/build-pure-wasm-s"
LOG_DIR="$ROOT/artifacts/gzrender-v2/logs"
LOG_FILE="$LOG_DIR/build-gzdoom-s-pure-wasm.log"
TOOLCHAIN="$GZDOOM_ROOT/cmake/pure-wasm-toolchain.cmake"

mkdir -p "$OUT_DIR" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

log "build-gzdoom-s-pure-wasm (clang → .wasm, NO emcc, NO gold OUT_DIR)"
log "  gzdoom:     $GZDOOM_ROOT"
log "  build dir:  $BUILD_DIR  (NOT build-wasm)"
log "  out:        $OUT_DIR     (NOT public/wasm/gzdoom)"

[[ -f "$TOOLCHAIN" ]] || die "missing $TOOLCHAIN — update gzdoom-project"
[[ -f "$GZDOOM_ROOT/cmake/GZDoomPureWasm.cmake" ]] || die "missing GZDoomPureWasm.cmake"

# Gold pk3s required for (s) runtime mount (reuse gold assets; do not rebuild pk3 here)
GOLD_PK3="$GOLD_WASM_DIR/gzdoom.pk3"
if [[ ! -f "$GOLD_PK3" ]]; then
  log "WARN: gold pk3 missing — run npm run build:gzdoom-wasm first for pk3 copy"
fi

ensure_native_import_executables() {
  local import="$GZDOOM_ROOT/build/ImportExecutables.cmake"
  [[ -f "$import" ]] || die "missing $import — build native GZDoom first (gold tools unchanged)"
  printf '%s' "$import"
}

IMPORT_EXECUTABLES="$(ensure_native_import_executables)"

if [[ ! -x "$(command -v ninja)" ]]; then
  die "ninja required"
fi

if [[ ! -f "$BUILD_DIR/build.ninja" ]] || [[ "${FORCE_GZDOOM_S_PURE_RECONFIGURE:-0}" == "1" ]]; then
  log "cmake configure (pure WASM toolchain)..."
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  cmake -S "$GZDOOM_ROOT" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DFORCE_CROSSCOMPILE=ON \
    -DIMPORT_EXECUTABLES="$IMPORT_EXECUTABLES" \
    -DZDOOM_BUILD_TOOLS=OFF \
    -DHAVE_VULKAN=OFF \
    >>"$LOG_FILE" 2>&1 || die "$(cat <<EOF
cmake configure failed — gold oracle is unchanged.

Install wasi-sdk and export WASI_SDK_PATH, then retry:
  npm run build:gzdoom-s-wasm

Gold (always available): npm run build:gzdoom-wasm → public/wasm/gzdoom/
Log: $LOG_FILE
Docs: gzdoom-project/docs/PURE-WASM-BUILD.md
EOF
)"
else
  log "cmake configure: reusing $BUILD_DIR"
fi

log "ninja zdoom (pure wasm)..."
if ninja -C "$BUILD_DIR" zdoom >>"$LOG_FILE" 2>&1; then
  wasm_out="$BUILD_DIR/gzdoom.wasm"
  [[ -f "$wasm_out" ]] || wasm_out="$BUILD_DIR/zdoom.wasm"
  [[ -f "$wasm_out" ]] || die "ninja succeeded but no .wasm in $BUILD_DIR — see $LOG_FILE"
  cp "$wasm_out" "$OUT_DIR/gzdoom.wasm"
  log "SUCCESS: pure gzdoom-s.wasm → $OUT_DIR ($(wc -c <"$OUT_DIR/gzdoom.wasm" | tr -d ' ') bytes)"
else
  die "$(cat <<EOF
ninja failed for pure WASM (s) — gold oracle is unchanged.

  Gold play/parity: npm run build:gzdoom-wasm  → public/wasm/gzdoom/
  Log: $LOG_FILE
  Docs: gzdoom-project/docs/PURE-WASM-BUILD.md

Phase 1: configure + platform shims land first; full zdoom link grows incrementally.
EOF
)"
fi

# Copy pk3s from gold tree (same renderer assets; separate .wasm binary)
if [[ -d "$GOLD_WASM_DIR" ]]; then
  for pk3 in gzdoom.pk3 gzdoom-wasm-shaders.pk3 game_support.pk3 game_widescreen_gfx.pk3 brightmaps.pk3 lights.pk3; do
    if [[ -f "$GOLD_WASM_DIR/$pk3" ]]; then
      cp "$GOLD_WASM_DIR/$pk3" "$OUT_DIR/"
    fi
  done
  log "pk3s copied from gold dir (assets only — wasm binary is pure clang output)"
fi
