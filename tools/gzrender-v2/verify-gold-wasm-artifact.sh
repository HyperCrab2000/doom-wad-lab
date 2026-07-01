#!/usr/bin/env bash
# Verify gold GZDoom WASM oracle artifacts and scripts are intact.
# Run after any gzdoom-project CMake or build-script changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GZDOOM_ROOT="$(cd "$ROOT/../gzdoom-project" 2>/dev/null && pwd || true)"
GOLD_DIR="$ROOT/public/wasm/gzdoom"
GOLD_SCRIPT="$ROOT/tools/gzrender-v2/build-gzdoom-wasm.sh"
PURE_SCRIPT="$ROOT/tools/gzrender-v2/build-gzdoom-s-pure-wasm.sh"

fail() { echo "verify-gold-wasm: FAIL — $*" >&2; exit 1; }
ok() { echo "verify-gold-wasm: OK — $*"; }

[[ -f "$GOLD_SCRIPT" ]] || fail "missing gold build script $GOLD_SCRIPT"
grep -q "GOLD ORACLE" "$GOLD_SCRIPT" || fail "gold script missing GOLD ORACLE banner"
grep -q 'build-wasm' "$GOLD_SCRIPT" || fail "gold script must use build-wasm dir"
grep -q 'public/wasm/gzdoom' "$GOLD_SCRIPT" || fail "gold script must output to public/wasm/gzdoom"

[[ -f "$PURE_SCRIPT" ]] || fail "missing pure (s) build script"
grep -q 'build-pure-wasm-s' "$PURE_SCRIPT" || fail "pure script must use build-pure-wasm-s"
grep -q 'public/wasm/gzdoom-s' "$PURE_SCRIPT" || fail "pure script must output to public/wasm/gzdoom-s"
if grep -q 'public/wasm/gzdoom[^-]' "$PURE_SCRIPT" && grep -q 'OUT_DIR=.*public/wasm/gzdoom"' "$PURE_SCRIPT"; then
  fail "pure script must not write to gold OUT_DIR"
fi

if [[ -f "$GOLD_DIR/gzdoom.wasm" ]]; then
  sz="$(wc -c <"$GOLD_DIR/gzdoom.wasm" | tr -d ' ')"
  [[ "$sz" -gt 1000000 ]] || fail "gold gzdoom.wasm too small ($sz bytes)"
  ok "gold artifact present ($sz bytes)"
else
  echo "verify-gold-wasm: WARN — gold gzdoom.wasm not built yet (run npm run build:gzdoom-wasm)"
fi

if [[ -d "$GZDOOM_ROOT" ]]; then
  [[ -f "$GZDOOM_ROOT/cmake/pure-wasm-toolchain.cmake" ]] || fail "missing pure-wasm-toolchain.cmake"
  if grep -q 'GZDOOM_PURE_WASM' "$GZDOOM_ROOT/cmake/GZDoomPureWasm.cmake" 2>/dev/null; then
    ok "GZDOOM_PURE_WASM cmake profile present"
  else
    fail "missing GZDoomPureWasm.cmake profile"
  fi
  if grep -q 'build-wasm' "$GZDOOM_ROOT/cmake/GZDoomPureWasm.cmake"; then
    ok "pure profile guards against gold build-wasm dir"
  fi
fi

ok "gold oracle paths and separation checks passed"
