# Chapter 00 — Introduction

## Purpose

The **Classic Layer Bible** documents how the doom-wad-lab **TypeScript WebGL2** renderer implements the same **Layers panel** as GZDoom Modular (s), but through:

1. **Node.js** WAD parse + geometry workers (not GZDoom `W_Init`)
2. **`buildRenderLayerDrawPlan()`** (not `gl_render_*` CVARs)
3. **`drawScene.ts`** stage gates (not `HWDrawInfo::AddLine`)

When a layer breaks, this bible tells you **which Node module**, **which draw stage**, and **which test** to run.

---

## Live toggles (no reload)

Classic applies toggles **every frame** via `renderLayerToggles` passed into `drawScene`. Changing a checkbox:

1. Updates React state → `applyClassicLayerTogglesLive(game, toggles)`
2. Calls `game.setRenderLayerToggles(toggles)` 
3. Next animation frame uses new `layerPlan` in `runStage()`

**No map reload.** Same contract as GZDoom (s) `_gzr_exec_cmd`.

---

## Runtime diagnostics

Open DevTools on Classic play:

```javascript
window.__classicLayerDiagnostics  // toggles, plan, activeStages, layers[]
window.__doomDrawStats            // walls/flats drawn, inactiveLayers, BSP stats
```

HUD line (bottom): `BSP · sector N · … · drawn wX fY · off: walls-solid, …`

---

## Tests

| Script | What it verifies |
|--------|------------------|
| `npx tsx tools/gzrender-v2/test-classic-layers.mts` | Walls off live, frame changes, no reload |
| `npx tsx tools/gzrender-v2/test-classic-layers-matrix.mts` | 5 presets — walls/floors/ceilings/sky isolation |
| `npx tsx tools/gzrender-v2/test-gzdoom-s-layers.mts` | GZDoom (s) parity |
| `npx tsx tools/gzrender-v2/capture-classic-layer-screenshots.mts` | E1M1 PNG gallery for docs |
| `npx vitest run src/wad/renderer/modular/classicLayerMapping.test.ts` | Preset → stage mapping |

## Puppeteer preset API

When `renderer=classic` and the map is playing:

```javascript
window.__applyClassicLayerPreset('floors');  // no DOM clicks
window.__classicLayerDiagnostics.layers.filter(l => l.active);
```

Preset IDs match [`classicLayerTestPreset()`](../../../src/wad/renderer/modular/classicLayerMapping.ts).

## Reading order

```mermaid
flowchart LR
  A[00 Intro] --> B[01 UI toggles]
  B --> C[02 Stages]
  C --> D[03 Node geometry]
  D --> E[04–09 Per layer]
  E --> F[10 GZDoom parity]
  F --> G[11 Testing]
```

Visual reference: [screenshots gallery](./screenshots/README.md)

[Next: UI → draw plan →](./01-ui-to-draw-plan.md)
