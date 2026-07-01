#!/usr/bin/env bash
# CLI flags shared with src/gzdoom-oracle/parityCaptureArgs.ts (Step 2c native ≡ WASM).
GZDOOM_PARITY_ARGS=(
  +vid_hidpi 0
  +vid_fullscreen 0
  +vid_defwidth 640
  +vid_defheight 480
  +vid_rendermode 0
  +vid_preferbackend 2
  +gl_es 1
  +r_dynlights 0
  +r_drawplayersprites 0
  +r_multithreaded 0
  +gl_multithread 0
  +gl_lights 0
  -nosound
  -windowed
  +wipetype 0
  +screenblocks 10
  +screenshot_quiet 1
  +vid_scalemode 0
  +vid_scale_linear 0
  +gl_texture_filter 0
  +gl_lightmode 1
  +gl_fogmode 2
  +gl_bandedswlight 0
)
