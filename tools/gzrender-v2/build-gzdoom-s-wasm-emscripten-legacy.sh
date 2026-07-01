#!/usr/bin/env bash
# DEPRECATED — Emscripten (s) build. GZDoom (s) must use pure WASM (build-gzdoom-s-pure-wasm.sh).
# Kept for reference only; do not wire to npm scripts. Never fall back to this from the UI host.
#
# Build GZDoom (s) WASM — stripped fork artifact. NEVER writes to public/wasm/gzdoom/.
#
# Phase 0: same zdoom target, separate build dir + output. Strip subsystems on
# gzdoom-project branch feature/gzdoom-s-stripped in later phases.
#
# Output: doom-wad-lab/public/wasm/gzdoom-s/{gzdoom.js,gzdoom.wasm,*.pk3}
#
# Usage: tools/gzrender-v2/build-gzdoom-s-wasm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gzdoom-paths.sh
source "$SCRIPT_DIR/gzdoom-paths.sh"

GZDOOM_ROOT="$(resolve_gzdoom_root)"
OUT_DIR="$ROOT/public/wasm/gzdoom-s"
BUILD_DIR="$GZDOOM_ROOT/build-wasm-s"
USE_WASM64="${GZDOOM_WASM64:-1}"
if [[ "$USE_WASM64" == "0" ]]; then
  BUILD_DIR="$GZDOOM_ROOT/build-wasm32-s"
fi
LOG_DIR="$ROOT/artifacts/gzrender-v2/logs"
LOG_FILE="$LOG_DIR/build-gzdoom-s-wasm.log"
PATCH_DIR="$SCRIPT_DIR/patches"

mkdir -p "$OUT_DIR" "$LOG_DIR"
: >"$LOG_FILE"

log() { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

command -v emcc >/dev/null || die "emcc not found — install emscripten"
command -v ninja >/dev/null || die "ninja not found"
[[ -d "$GZDOOM_ROOT/zmusic" ]] || die "missing zmusic submodule in $GZDOOM_ROOT"

ensure_node_for_emscripten() {
  if node --version >>"$LOG_FILE" 2>&1; then
    return 0
  fi
  die "node must run for emcmake — see log"
}

resolve_emscripten_sdl2_include() {
  local cache="${EM_CACHE:-${EMSCRIPTEN_CACHE:-$HOME/.emscripten_cache}}"
  local sdl_h
  sdl_h="$(find "$cache/ports/sdl2" -name SDL.h 2>/dev/null | head -1 || true)"
  [[ -n "$sdl_h" ]] || die "SDL.h not in emscripten cache"
  dirname "$sdl_h"
}

# Compile the OpenAL static path against GZDoom's bundled OpenAL Soft headers and link the standard
# AL ABI symbols with -lopenal (Emscripten → WebAudio). See build-gzdoom-wasm.sh for rationale.
resolve_emscripten_openal_include() {
  local hdr="$GZDOOM_ROOT/src/common/audio/sound/thirdparty"
  [[ -f "$hdr/al.h" ]] || die "bundled OpenAL al.h not found at $hdr"
  printf '%s' "$hdr"
}

ensure_native_import_executables() {
  local import="$GZDOOM_ROOT/build/ImportExecutables.cmake"
  [[ -f "$import" ]] || die "missing $import — build native GZDoom first"
  printf '%s' "$import"
}

build_libvpx_wasm() {
  local memflag="$1"
  local tag="$2"
  local libvpx_dir="$GZDOOM_ROOT/libvpx-wasm"
  local install="$libvpx_dir/install-$tag"
  if [[ -f "$install/lib/libvpx.a" ]]; then
    log "libvpx $tag: using $install/lib/libvpx.a"
    return 0
  fi
  log "libvpx $tag: configure + build..."
  rm -rf "$libvpx_dir/build-$tag"
  mkdir -p "$libvpx_dir/build-$tag"
  (
    cd "$libvpx_dir/build-$tag"
    export CFLAGS="$memflag -O3"
    export CXXFLAGS="$memflag -O3"
    export LDFLAGS="$memflag"
    emconfigure ../configure \
      --prefix="$install" \
      --target=generic-gnu \
      --disable-examples --disable-tools --disable-docs --disable-unit-tests \
      --enable-static --disable-shared >>"$LOG_FILE" 2>&1
    emmake make -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)" >>"$LOG_FILE" 2>&1
    emmake make install >>"$LOG_FILE" 2>&1
  )
  [[ -f "$install/lib/libvpx.a" ]] || die "libvpx $tag build failed"
}

build_libvpx_wasm64() { build_libvpx_wasm "-sMEMORY64=1" "wasm64"; }
build_libvpx_wasm32() { build_libvpx_wasm "" "wasm32"; }

apply_zmusic_wasm_patches() {
  local zmusic="$GZDOOM_ROOT/zmusic"
  local cmake="$zmusic/source/CMakeLists.txt"
  local fluid="$zmusic/source/mididevices/music_fluidsynth_mididevice.cpp"
  local stub="$PATCH_DIR/music_fluidsynth_mididevice.wasm-stub.cpp"
  [[ -f "$stub" ]] || die "missing patch $stub"
  if [[ ! -f "${cmake}.orig-wasm" ]]; then
    cp "$cmake" "${cmake}.orig-wasm"
  fi
  if [[ ! -f "${fluid}.orig-wasm" ]]; then
    cp "$fluid" "${fluid}.orig-wasm"
  fi
  cp "$stub" "$fluid"
  sed -i.bak 's/ fluidsynth//g' "$cmake"
}

build_zmusic_wasm() {
  local memflag="$1"
  local tag="$2"
  local zmusic="$GZDOOM_ROOT/zmusic"
  local zbuild="$zmusic/build-$tag"
  local zinstall="$zbuild/install"
  apply_zmusic_wasm_patches
  log "zmusic $tag: cmake + ninja..."
  rm -rf "$zbuild"
  mkdir -p "$zbuild"
  (
    cd "$zbuild"
    emcmake cmake .. -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX="$zinstall" \
      -DCMAKE_C_FLAGS="$memflag" \
      -DCMAKE_CXX_FLAGS="$memflag" \
      -DCMAKE_EXE_LINKER_FLAGS="$memflag" \
      -DBUILD_SHARED_LIBS=OFF >>"$LOG_FILE" 2>&1
    emmake ninja install >>"$LOG_FILE" 2>&1
  )
  [[ -f "$zinstall/lib/libzmusic.a" ]] || die "zmusic $tag build failed"
}

build_zmusic_wasm64() { build_zmusic_wasm "-sMEMORY64=1" "wasm64"; }
build_zmusic_wasm32() { build_zmusic_wasm "" "wasm32"; }

log "build-gzdoom-s-wasm (stripped fork — output ONLY $OUT_DIR)"
log "  gzdoom: $GZDOOM_ROOT"
log "  out:    $OUT_DIR"

ensure_node_for_emscripten

"$SCRIPT_DIR/build-gzdoom-pk3.sh" >>"$LOG_FILE" 2>&1

PK3_SRC="$GZDOOM_ROOT/build/gzdoom.app/Contents/MacOS"
if [[ ! -f "$PK3_SRC/gzdoom.pk3" ]]; then
  PK3_SRC="$GZDOOM_ROOT/build"
fi
[[ -f "$PK3_SRC/gzdoom.pk3" ]] || die "gzdoom.pk3 not found"

IMPORT_EXECUTABLES="$(ensure_native_import_executables)"
SDL2_INC="$(resolve_emscripten_sdl2_include)"
OPENAL_INC="$(resolve_emscripten_openal_include)"

# GZDOOM_STRIPPED=1 marks the (s) fork in C++; strip subsystems on feature/gzdoom-s-stripped.
STRIPPED_CXX="-DGZDOOM_STRIPPED=1"

if [[ "$USE_WASM64" == "0" ]]; then
  WASM_TAG="wasm32"
  MEM64_FLAG=""
  EMFLAGS="-fexceptions $STRIPPED_CXX -isystem $OPENAL_INC"
  LINKFLAGS="-s USE_SDL=2 -lopenal -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=536870912 -s STACK_SIZE=16777216 -s WASM=1 -s ENVIRONMENT=web -s MODULARIZE=1 -s EXPORT_NAME=createGzdoomModule -sASSERTIONS=2 -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=['FS','callMain','UTF8ToString'] -s EXPORTED_FUNCTIONS=['_main','_gzr_set_view','_gzr_is_ready','_gzr_gametic','_gzr_on_pointer_lock','_gzr_mouse_move','_gzr_poll_sound_events'] -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 -fexceptions -sASYNCIFY=1 -Wl,--allow-multiple-definition"
  build_libvpx_wasm32
  build_zmusic_wasm32
  ZMUSIC_BUILD="$GZDOOM_ROOT/zmusic/build-wasm32"
  LIBVPX_INSTALL="$GZDOOM_ROOT/libvpx-wasm/install-wasm32"
else
  WASM_TAG="wasm64"
  MEM64_FLAG="-sMEMORY64=1"
  EMFLAGS="-sMEMORY64=1 -fexceptions $STRIPPED_CXX -isystem $OPENAL_INC"
  LINKFLAGS="-s USE_SDL=2 -lopenal -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=536870912 -s STACK_SIZE=16777216 -s WASM=1 -s ENVIRONMENT=web -s MODULARIZE=1 -s EXPORT_NAME=createGzdoomModule -sMEMORY64=1 -sASSERTIONS=2 -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=['FS','callMain','UTF8ToString'] -s EXPORTED_FUNCTIONS=['_main','_gzr_set_view','_gzr_is_ready','_gzr_gametic','_gzr_on_pointer_lock','_gzr_mouse_move','_gzr_poll_sound_events'] -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 -fexceptions -sASYNCIFY=1 -Wl,--allow-multiple-definition"
  build_libvpx_wasm64
  build_zmusic_wasm64
  ZMUSIC_BUILD="$GZDOOM_ROOT/zmusic/build-wasm64"
  LIBVPX_INSTALL="$GZDOOM_ROOT/libvpx-wasm/install-wasm64"
fi

if [[ ! -f "$BUILD_DIR/build.ninja" ]] || [[ "${FORCE_GZDOOM_S_WASM_RECONFIGURE:-0}" == "1" ]]; then
  log "cmake configure (Emscripten $WASM_TAG, GZDOOM_STRIPPED=1)..."
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  emcmake cmake -S "$GZDOOM_ROOT" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="$EMFLAGS" \
    -DCMAKE_CXX_FLAGS="$EMFLAGS" \
    -DFORCE_CROSSCOMPILE=ON \
    -DCMAKE_SYSTEM_NAME=Emscripten \
    -DZDOOM_BUILD_TOOLS=ON \
    -DHAVE_VULKAN=OFF \
    -DNO_GTK=ON \
    -DIMPORT_EXECUTABLES="$IMPORT_EXECUTABLES" \
    -DSDL2_INCLUDE_DIR="$SDL2_INC" \
    -DSDL2_LIBRARY="-s USE_SDL=2" \
    -DDYN_OPENAL=OFF \
    -DOPENAL_INCLUDE_DIR="$OPENAL_INC" \
    -DOPENAL_LIBRARY="-lopenal" \
    -DZMUSIC_INCLUDE_DIR="$ZMUSIC_BUILD/install/include" \
    -DZMUSIC_LIBRARIES="$ZMUSIC_BUILD/install/lib/libzmusic.a" \
    -DVPX_FOUND=ON \
    -DVPX_INCLUDE_DIR="$LIBVPX_INSTALL/include" \
    -DVPX_LIBRARIES="$LIBVPX_INSTALL/lib/libvpx.a" \
    -DCMAKE_EXE_LINKER_FLAGS="$LINKFLAGS" \
    >>"$LOG_FILE" 2>&1 || die "cmake configure failed — see $LOG_FILE"
else
  log "cmake configure: reusing $BUILD_DIR"
fi

log "ninja zdoom → gzdoom-s artifact..."
emmake ninja -C "$BUILD_DIR" zdoom >>"$LOG_FILE" 2>&1 || die "ninja failed — see $LOG_FILE"

[[ -f "$BUILD_DIR/gzdoom.js" && -f "$BUILD_DIR/gzdoom.wasm" ]] \
  || die "missing gzdoom.js or gzdoom.wasm in $BUILD_DIR"

cp "$BUILD_DIR/gzdoom.js" "$BUILD_DIR/gzdoom.wasm" "$OUT_DIR/"
for pk3 in gzdoom.pk3 game_support.pk3 brightmaps.pk3 lights.pk3 game_widescreen_gfx.pk3; do
  [[ -f "$PK3_SRC/$pk3" ]] && cp "$PK3_SRC/$pk3" "$OUT_DIR/"
done

python3 "$SCRIPT_DIR/build-shader-overlay-pk3.py" "$OUT_DIR/gzdoom.pk3" "$OUT_DIR/gzdoom-wasm-shaders.pk3" >>"$LOG_FILE" 2>&1

log "SUCCESS: gzdoom-s.wasm → $OUT_DIR ($(wc -c <"$OUT_DIR/gzdoom.wasm" | tr -d ' ') bytes)"
