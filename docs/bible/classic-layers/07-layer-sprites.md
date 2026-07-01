# Chapter 07 — Sprites & voxels

## Table of contents

- [Layer ID](#layer-id)
- [WAD → billboard](#wad--billboard)
- [Draw stages](#draw-stages)
- [Voxels (KVX)](#voxels-kvx)
- [Live toggle](#live-toggle)
- [Diagnostics](#diagnostics)
- [GZDoom parity](#gzdoom-parity)

---

## Layer ID

| ID | UI toggle | Draw plan | Stages |
|----|-----------|-----------|--------|
| `sprites` | Geometry → **Sprites** (`voxels` key) | `voxels`, `sprites` | `voxels`, `sprites` |

Note: the UI label says "Sprites" but the toggle key is `voxels` in `RenderLayerToggles` — it gates **both** voxel models and classic sprites.

---

## WAD → billboard

```mermaid
flowchart LR
  TH[THINGS] --> SP[Sprite index S_* lumps]
  SP --> BB[Billboard quads]
  BB --> ST[sprites stage]
```

| WAD | Classic processing |
|-----|-------------------|
| THINGS | Position, angle, type → pick sprite def |
| S_START…S_END | Patch frames `TROOA1`, rotation 1–8 |
| PLAYPAL + COLORMAP | Rasterize to sprite atlas |

See [WAD sprites](../wad/07-sprites-and-animations.md).

Things with KVX definitions may route to the **`voxels`** stage instead of flat billboards.

---

## Draw stages

Pipeline order: **after walls**, last opaque geometry before HUD overlays.

| Stage | Content |
|-------|---------|
| `voxels` | KVX mesh things (if present on map) |
| `sprites` | Standard Doom sprites |

Both require `runStage()` true and frustum / BSP visibility.

Stats: `__doomDrawStats` sprite counters (see drawScene publish block).

---

## Voxels (KVX)

| Module | Role |
|--------|------|
| `voxels/kvxMesh.ts` | Parse KVX → triangle mesh |
| `voxels` stage | Draw voxel things with things shader |

E1M1 stock Doom has no voxels — test on custom PWADs or voxel things.

---

## Live toggle

Uncheck **Sprites** → `voxels: false` → both stages skip.

```javascript
window.__applyClassicLayerPreset('sprites'); // walls + sprites on
window.__classicLayerDiagnostics.layers.find(l => l.id === 'sprites')?.active;
```

**Preset `sprites`** in [`classicLayerTestPreset`](../../../src/wad/renderer/modular/classicLayerMapping.ts) keeps walls for spatial context.

No map reload — same contract as walls/flats.

---

## Diagnostics

| Symptom | Likely cause |
|---------|--------------|
| Monsters invisible, geometry OK | `sprites` layer inactive |
| Pink squares | Missing `S_*` lump / bad atlas key |
| Sprites behind walls | draw order (expected) |
| Voxels only missing | `voxels` stage off or no KVX data |

Puppeteer: extend matrix with `sprites` preset when test map includes things in view (E1M1 has enemies after pickup — default camera may show few; use `MAP01` for density if needed).

---

## GZDoom parity

| Classic | GZDoom CVAR |
|---------|-------------|
| Sprites / voxels | `gl_render_things` |

Compare gold frame with things disabled in WASM layer panel vs Classic sprites off.

---

[← Sky](./06-layer-sky.md) · [Next: Lighting →](./08-layer-lighting.md)
