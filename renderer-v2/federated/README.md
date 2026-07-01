# Federated GZRender (WASM)

Modular GZDoom-parity renderer path for doom-wad-lab.

## Layout

```txt
federated/
  wasm/gzrender_federated.wat   # WASM host (GZSTATE validate + stats)
  crates/                       # Future Rust modules (gzstate-load, draw-list, …)

src/wad/renderer/gzrender-v2/federated/
  stateLoader.ts              # GZSTATE export via @hypercrab2000/doom-wad-core
  wasmHost.ts                 # Loads /wasm/gzrender_federated/gzrender_federated.wasm
  webgl2Backend.ts              # WebGL2 draw (classic HW pipeline today)
  federatedWasmBackend.ts     # Orchestrates load + frame
  loadFederatedWasmBackend.ts # Lazy loader for Level Viewer
```

## Build WASM

```bash
npm run build:wasm
```

Output: `public/wasm/gzrender_federated/gzrender_federated.wasm`

When `cargo` + `wasm-pack` are installed, the build script prefers the Rust crate under `crates/gzrender-wasm`.

## UI

Level Viewer → **Renderer** → **WASM Federated (GZRender)**

URL: `?renderer=wasm-federated`

## Pipeline

1. Map load → export GZSTATE (`doom-wad-core`)
2. WASM validates magic/version, stores vertex/sector counts
3. WebGL2 backend draws the level (same HW path as Classic while render parity matures)
