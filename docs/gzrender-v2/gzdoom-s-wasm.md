# GZDoom (s) WASM — modular pure-WASM fork

**GZDoom (s)** = **S**tripped modular fork. Separate artifact from the **gold** `gzdoom-wasm` oracle. See [wasm-gold-and-modular.md](./wasm-gold-and-modular.md) for the full split.

## Non‑negotiables

1. **No Emscripten** — (s) is `clang -target wasm32` (or WASI) + `WebAssembly.instantiate`. No `gzdoom.js`, no `createGzdoomModule`, no `EMSCRIPTEN_KEEPALIVE` glue.
2. **No fallback to gold** — if `public/wasm/gzdoom-s/gzdoom.wasm` is missing, fail loudly. Gold (`public/wasm/gzdoom/`) stays untouched.
3. **No JS rendering** — host mounts lumps/GZSTATE and passes argv; pixels come from GZDoom GLES inside the `.wasm` module.
4. **Node parses first** — map geometry via `-loadgzstate`; lump archive via `NODE_LUMPS.WAD` for `R_Init` textures/sprites.

## Goals

1. **Modular GLES sections** — toggle walls / flats / things / textures / portals / fog via `+cvar` argv (see wasm-gold-and-modular.md table) to bisect Classic WebGL parity gaps.
2. **Keep renderer + game engine** — full `-gzrender_play` sim until stripped away intentionally.
3. **Strip incrementally** — menus, network, ZScript, unused backends removed one cut at a time on `feature/gzdoom-s-stripped`.

## Two binaries (summary)

| | Gold oracle | Modular (s) |
|---|-------------|-------------|
| Backend id | `gzdoom-wasm` | `gzdoom-s-wasm` |
| Toolchain | Emscripten (`emcc`) | clang → pure `.wasm` |
| Output | `public/wasm/gzdoom/` | `public/wasm/gzdoom-s/` |
| WAD lumps | Raw IWAD — engine parses | Node → NODE_LUMPS.WAD + GZSTATE |
| Build | `build-gzdoom-wasm.sh` | `build-gzdoom-s-pure-wasm.sh` |

## Node injection path

```text
fetch IWAD
  → loadWadFromArrayBuffer (doom-wad-core)
  → exportToGzstate(wad, mapName) → /wad/{map}.gzstate
  → re-encode lumps → NODE_LUMPS.WAD (not the raw disk file)
  → pure WASM host mounts files → _main(argv)
  → P_SetupLevel via P_OpenMapDataFromGzstate
```

## Pure WASM host ABI (target)

Exports (WASM names, no Emscripten mangling policy TBD):

- `_main` — argv in linear memory or host call convention
- `_gzr_is_ready`, `_gzr_set_view`, `_gzr_gametic`, … — same hosted play ABI as gold

Imports (browser shims in `gzdoomPureWasmHost.ts`):

- WASI preview1 or minimal custom: `fd_write`, `fd_read`, `path_open`, …
- WebGL: `gz_get_proc_address(name)` → `gl.getExtension` / `gl[name]`
- Optional: `gz_sleep_ms` for frame yield (replaces ASYNCIFY)

## Build status

`npm run build:gzdoom-s-wasm` runs `build-gzdoom-s-pure-wasm.sh`. Until the clang CMake profile lands in `gzdoom-project`, the script documents requirements and exits non‑zero.

Legacy Emscripten (s) build (deprecated, do not use): `tools/gzrender-v2/build-gzdoom-s-wasm-emscripten-legacy.sh`

## Commands

```bash
npm run build:gzdoom-wasm          # gold — Emscripten, raw IWAD
npm run build:gzdoom-s-wasm        # modular — pure WASM (when implemented)

# UI
?renderer=gzdoom-s-wasm
```
