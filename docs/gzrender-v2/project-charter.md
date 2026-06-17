# GZRender-V2 Project Charter

## Goal

Build a new opt-in renderer path that preserves all existing WAD Lab systems while enabling a GZDoom-derived renderer pipeline.

Final architecture:

```txt
NodeJS WAD Lab Parser
  -> GZSTATE
  -> GZDoom-derived Renderer Core
  -> Native Parity
  -> WASM Browser Renderer
  -> WebGL2/OpenGL-compatible Backend
  -> Future WebGPU/Raytracing Backend
```

## Non-Clobber Requirement

Existing systems must remain intact:

- WAD parser
- music parser
- sound parser
- voxel parser
- existing level parser
- existing renderer
- existing React/browser app behavior

All new work is opt-in and additive.

## Primary Strategy

Do not approximate GZDoom visually. First make GZDoom export canonical post-load renderer-facing state. Then make a stripped/import renderer consume that state. Only after that should NodeJS generate the same state.

Pipeline:

```txt
GZDoom loads WAD normally
-> GZDoom exports post-load GZSTATE
-> Renderer-V2 imports GZSTATE
-> Renderer-V2 renders frame
-> frame diff against GZDoom reference
-> NodeJS exporter produces matching GZSTATE
-> corpus parity
-> WASM/WebGL2 browser target
```

## Key Constraints

- Native first, WASM second.
- Correctness before performance.
- Corpus before completion claims.
- GZDoom code may be reduced only after parity exists.
- Raytracing/WebGPU must be future-proofed but not implemented before classic path parity.

## Success Definition

Success requires:

- GZDoom-generated state imports and renders.
- Node-generated state matches GZDoom-generated state.
- Frame parity exists for supported maps.
- Event parity exists for scripted fixtures.
- Browser WASM/WebGL2 smoke path works.
- Existing WAD Lab remains untouched by default.
