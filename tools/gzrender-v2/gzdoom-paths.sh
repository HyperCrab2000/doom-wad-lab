#!/usr/bin/env bash
# Resolve GZDoom fork paths for doom-wad-lab tools (sourced by other scripts).
# Override with GZDOOM_ROOT / GZDOOM_BIN / GZDOOM_BUILD.

gzrender_lab_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
  cd "$script_dir/../.." && pwd
}

resolve_gzdoom_root() {
  if [[ -n "${GZDOOM_ROOT:-}" && -d "$GZDOOM_ROOT" ]]; then
    printf '%s' "$GZDOOM_ROOT"
    return 0
  fi
  local lab_root sibling legacy
  lab_root="$(gzrender_lab_root)"
  sibling="$(cd "$lab_root/../gzdoom-project" 2>/dev/null && pwd || true)"
  if [[ -n "$sibling" && -d "$sibling" ]]; then
    printf '%s' "$sibling"
    return 0
  fi
  legacy="/Users/williamfarmer/IdeaProjects/gzdoom-project"
  if [[ -d "$legacy" ]]; then
    printf '%s' "$legacy"
    return 0
  fi
  return 1
}

resolve_gzdoom_build_dir() {
  local root="${1:-$(resolve_gzdoom_root)}"
  if [[ -n "${GZDOOM_BUILD:-}" ]]; then
    printf '%s' "$GZDOOM_BUILD"
    return 0
  fi
  printf '%s/build' "$root"
}

resolve_gzdoom_bin() {
  if [[ -n "${GZDOOM_BIN:-}" && -x "$GZDOOM_BIN" ]]; then
    printf '%s' "$GZDOOM_BIN"
    return 0
  fi
  local root build_dir
  root="$(resolve_gzdoom_root)" || return 1
  build_dir="$(resolve_gzdoom_build_dir "$root")"
  local candidates=(
    "$build_dir/gzdoom.app/Contents/MacOS/gzdoom"
    "$build_dir/gzdoom"
    "$build_dir/GZDoom.app/Contents/MacOS/gzdoom"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      printf '%s' "$c"
      return 0
    fi
  done
  return 1
}
