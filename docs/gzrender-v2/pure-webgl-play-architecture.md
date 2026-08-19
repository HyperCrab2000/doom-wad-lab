# Pure WebGL play path — renderer vs engine split

**Play target:** pixels come from **Node-parsed data + TypeScript WebGL2** (`drawScene` / `executeHwDrawPipeline`).  
**WASM (no Emscripten):** game simulation, menu, and optionally BSP — **never** GLES draw inside WASM for play.

Emscripten GZDoom (`gzdoom-wasm`) stays a **frozen parity oracle only** — not the shipped browser renderer.

---

## Layers

| Layer | Play implementation | Toolchain | Notes |
|-------|---------------------|-----------|-------|
| **WAD / GZSTATE parse** | `doom-wad-core` (Node / worker) | TypeScript | Shared wire with GZDoom dumps |
| **Renderer (GPU)** | `src/wad/renderer/renderGame/drawScene.ts` | TypeScript + WebGL2 | All playfield pixels |
| **BSP / visibility** | TS today (`bspVisibility`, `gzdoomDrawState`) | TypeScript | May move to **pure WASM** (clang → wasm32) exporting draw lists |
| **Game engine (tick)** | TS fallback + `@hypercrab2000/doom-gzengine-core` | **Pure WASM** when built | GZTICK + patch stream → renderer |
| **Menu / HUD** | TS canvas today (`DoomHud`, `ClassicPatchMenu`) | TypeScript | May move to **pure WASM** menu slice from GZDoom fork |
| **Audio** | Web Audio (`useLevelSfx`, `useLevelMusic`) | TypeScript | Decoupled from engine WASM |
| **Gold oracle** | `gzdoom-wasm` Emscripten | Emscripten | **Oracle only** — Step 2 gate, not play |

---

## Hard rules

1. **No Emscripten on the play path** — engine, menu, and BSP WASM use `clang --target=wasm32` + `WebAssembly.instantiate` (same class as `gzdoom-s-wasm` host), not `emcc` / `createGzdoomModule`.
2. **No GLES inside play WASM** — stripped GZDoom forks must not link HW renderer for engine/menu/BSP modules.
3. **Renderer stays in TS/WebGL** — mirror GZDoom draw *behavior* from the bible (`hw_walls.cpp`, `hw_draw2d.cpp`, …), not a second C++ GLES binary.
4. **Oracle backends are not play** — `?renderer=gzdoom-wasm` and `?renderer=gzdoom-s-wasm` exist for gold diff and bisection only.

---

## Browser wiring (today)

```text
useDoomLoader → doom-wad-core parse
renderGame.load → WebGL buffers (mapToWalls / mapToFlats)
GzFederatedRuntime → engine tick (?engine=typescript | ?engine=wasm)
each frame:
  advanceFrame → GZTICK patches → mapActions / sector refresh
  drawScene / executeHwDrawPipeline → WebGL2 canvas
DoomHud + ClassicPatchMenu → 2D canvas overlays (TS; WASM menu later)
```

**URL params (play):**

```
?renderer=classic              # default play — pure WebGL
?engine=typescript             # TS MapActionController (default)
?engine=wasm                   # gzengine pure WASM when built; falls back to TS
?renderer=wasm-federated       # same WebGL draw; map geometry from GZSTATE wire
?frameParity=1                 # spawn lock + parity capture (Classic vs gold)
```

**URL params (oracle — not play):**

```
?renderer=gzdoom-wasm&gzdoomSubView=gold
?renderer=gzdoom-s-wasm
```

---

## Parity strategy

| Compare | Purpose |
|---------|---------|
| Classic WebGL vs `gzdoom-wasm` gold | Close the ~79% spawn gap by porting GZDoom draw semantics into TS |
| `gzdoom-s-wasm` vs gold | Bisect which C++ subsystem differs (oracle) |
| GZTICK WASM vs GZDoom `-dumpgztick` | Engine tick parity (`doom-gzengine-core`) |

Step 2 **gold gate** (68/68 Emscripten) remains the photograph of correct GZDoom pixels. The **play gate** is Classic WebGL → gold ≤15% (E1M1 spawn) and grows from there.

---

## WASM extraction order (no Emscripten)

```text
1. gzengine-core.wasm     — P_Ticker, thinkers, specials (doom-gzengine-core)
2. gzmenu-core.wasm       — list menu / pause (strip from gzdoom-s fork)
3. gzbsp-core.wasm        — RenderBSP → wall/flat draw lists → TS consumer
```

Each module: clang wasm32, WASI/browser shims, `WebAssembly.instantiate`. No `gzdoom.js`, no MEMFS Emscripten host.

---

## See also

- [game-engine-vs-renderer.md](./game-engine-vs-renderer.md)
- [wasm-gold-and-modular.md](./wasm-gold-and-modular.md) — oracle vs (s) fork
- [../bible/chronicle/decisions/2026-07-pure-webgl-renderer-pure-wasm-engine.md](../bible/chronicle/decisions/2026-07-pure-webgl-renderer-pure-wasm-engine.md)
