# 2026-07 — Pure WebGL renderer; pure WASM engine (no Emscripten play path)

## Decision

**Play** uses TypeScript/WebGL2 for all GPU pixels. **Game engine, menu, and BSP** may live in **pure WASM** (clang → wasm32, `WebAssembly.instantiate`) — **not** Emscripten.

Emscripten `gzdoom-wasm` remains a **frozen gold oracle** for Step 2 parity gates only.

## Context

Classic WebGL was a parallel reimplementation that diverged from GZDoom draw semantics (~80% spawn mismatch). GZDoom Emscripten gold and `(s)` modular WASM both run **C++ GLES inside WASM** — correct for oracle work, wrong for the stated goal of a **pure Node/WebGL renderer**.

The federated split already exists in code: `GzFederatedRuntime` (engine) + `drawScene` (TS WebGL). This decision makes that split the **product architecture** and forbids Emscripten on play/sim/menu/BSP paths.

## Rules

| Component | Play path | Forbidden on play |
|-----------|-----------|-------------------|
| Renderer | TS `drawScene` / WebGL2 | Emscripten GLES, `gzdoom-s` full engine draw |
| Engine tick | `doom-gzengine-core` pure WASM (or TS fallback) | Emscripten `createGzdoomModule` |
| Menu/HUD | TS canvas now; pure WASM menu slice later | Emscripten in-canvas GZDoom menu |
| BSP | TS now; pure WASM draw-list export later | — |
| Oracle | `gzdoom-wasm` Emscripten | — (allowed) |

## Related docs

- [pure-webgl-play-architecture.md](../../../gzrender-v2/pure-webgl-play-architecture.md)
- [game-engine-vs-renderer.md](../../../gzrender-v2/game-engine-vs-renderer.md)
- [2026-06 — GZDoom WASM as gold oracle](./2026-06-gzdoom-wasm-as-gold-oracle.md)

## Tests

| Test | Layer |
|------|-------|
| `npm run test:classic-gzdoom-parity` | Play renderer vs gold |
| `npm run test:corpus` | GZSTATE wire |
| `doom-gzengine-core npm test` | GZTICK codec (engine) |

---

[← Chronicle index](../README.md)
