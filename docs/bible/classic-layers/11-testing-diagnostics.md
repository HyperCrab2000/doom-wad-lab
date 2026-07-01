# Chapter 11 — Testing & diagnostics

## Table of contents

- [Quick commands](#quick-commands)
- [Window diagnostics API](#window-diagnostics-api)
- [Puppeteer — Classic live layers](#puppeteer--classic-live-layers)
- [Puppeteer — preset matrix](#puppeteer--preset-matrix)
- [Puppeteer — GZDoom (s)](#puppeteer--gzdoom-s)
- [Screenshot corpus](#screenshot-corpus)
- [Unit tests](#unit-tests)
- [Which layer broke?](#which-layer-broke)

---

## Quick commands

```bash
npm run dev   # http://localhost:5150

# Single regression — walls off live
npx tsx tools/gzrender-v2/test-classic-layers.mts

# Multi-preset matrix — floors, ceilings, sky, walls isolation
npx tsx tools/gzrender-v2/test-classic-layers-matrix.mts

# GZDoom modular (s) live layers
npx tsx tools/gzrender-v2/test-gzdoom-s-layers.mts

# Regenerate E1M1 screenshot gallery
npx tsx tools/gzrender-v2/capture-classic-layer-screenshots.mts

# Mapping unit tests
npx vitest run src/wad/renderer/modular/classicLayerMapping.test.ts
```

---

## Window diagnostics API

Available in browser when `renderer=classic` and map is ready:

| Global | Type | Purpose |
|--------|------|---------|
| `__classicLayerDiagnostics` | `{ toggles, plan, activeStages, inactiveStages, layers[] }` | Per-layer active flags |
| `__doomDrawStats` | `{ walls, flats, layerPlan, inactiveLayers, … }` | Per-frame draw counts |
| `__applyClassicLayerPreset(id)` | `(string) => diagnostics \| null` | Puppeteer preset without DOM clicks |

Preset IDs: `all`, `walls-solid`, `floors`, `ceilings`, `sky`, `sprites`, `walls-off`.

DevTools example:

```javascript
__applyClassicLayerPreset('floors');
__classicLayerDiagnostics.layers.filter(l => l.active).map(l => l.id);
__doomDrawStats.walls; // expect 0 for floors-only
```

---

## Puppeteer — Classic live layers

`test-classic-layers.mts`

**Asserts:**

1. Map stays `data-map-load-state=ready` (no reload)
2. `walls-solid` in inactive list after unchecking Walls
3. `__doomDrawStats.walls` draw count drops
4. Frame signature changes (visible difference)
5. React root not wiped

---

## Puppeteer — preset matrix

`test-classic-layers-matrix.mts`

Uses `window.__applyClassicLayerPreset` for each case:

| Preset | Expect inactive | Expect active |
|--------|-----------------|---------------|
| `walls-off` | walls-solid, walls-texture | floors, ceilings |
| `walls-solid` | floors, ceilings, sky | walls-solid |
| `floors` | walls, ceilings, sky | floors |
| `ceilings` | walls, floors, sky | ceilings |
| `sky` | walls, floors | sky, ceilings |

Each case verifies map stays `ready` and minimum frame fill ratio.

---

## Puppeteer — GZDoom (s)

```bash
npx tsx tools/gzrender-v2/test-gzdoom-s-layers.mts
```

Same live-toggle contract — CVAR whitelist in `applyGzdoomLayerTogglesLive.ts`.

---

## Screenshot corpus

```bash
npx tsx tools/gzrender-v2/capture-classic-layer-screenshots.mts
```

Writes PNGs to `docs/bible/classic-layers/screenshots/e1m1-*.png`.

Embedded in chapters [04](./04-layer-walls.md)–[06](./06-layer-sky.md) and [README](./README.md).

---

## Unit tests

[`classicLayerMapping.test.ts`](../../../src/wad/renderer/modular/classicLayerMapping.test.ts):

- `walls-off` preset → inactive wall stages
- Default toggles → walls + flats active
- Every definition has node sources

---

## Which layer broke?

| Symptom | Layer ID | Node module |
|---------|----------|-------------|
| Black void, no geometry | `walls-solid`, `floors` | geometry worker |
| Untextured gray | `walls-texture`, `floor-textures` | PLAYPAL / atlas |
| Missing sky | `sky` | F_SKY, drawSkybox |
| No monsters | `sprites` | THINGS, S_* lumps |
| Flat wrong color | `sector-color` | SECTORS.lightlevel |
| Too bright / flat | `dynamic-light` | pointLights |
| Wrong room shape | `wireframe-bsp` | BSP index |

Use `inferParityFailureLayer` from display-mode corpus for GZDoom-side hints.

---

[← Parity matrix](./10-gzdoom-parity-matrix.md) · [Appendix →](./appendix-layer-catalog.md)
