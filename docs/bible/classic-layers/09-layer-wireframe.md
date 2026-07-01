# Chapter 09 — Wireframe debug layers

## Table of contents

- [Layer ID](#layer-id)
- [Wireframe modes](#wireframe-modes)
- [Draw stages](#draw-stages)
- [Data sources](#data-sources)
- [URL debug caps](#url-debug-caps)
- [Using wireframe to isolate breaks](#using-wireframe-to-isolate-breaks)

---

## Layer ID

| ID | UI toggle | Draw plan |
|----|-----------|-----------|
| `wireframe-bsp` | Debug → **Wireframe** + mesh triangles | `wireframeMode`, `meshTriangles` |

Stages: `visibilityWireframe`, `meshWireframe`.

---

## Wireframe modes

`RenderLayerToggles.wireframeMode`:

| Value | Draws |
|-------|-------|
| `off` | Normal shaded view (default) |
| `bsp` | BSP visibility edges — subsector boundaries |
| `mesh` | Triangle mesh edges from geometry buffers |
| `sight` | Sight-line debug (when enabled in build) |

Optional **mesh triangles** checkbox fills triangles in wire pass for dense maps.

---

## Draw stages

When `wireframeMode !== 'off'` or URL `?modStage=` caps early pipeline:

```
visibilityWireframe → meshWireframe → (optional early return)
```

Implementation: [`drawScene.ts`](../../../src/wad/renderer/renderGame/drawScene.ts) — `drawGzdoomVisibilityWireframe`, `drawGzdoomMeshWireframe`.

If wireframe active and stage cap stops before sky, **textured passes never run** — intentional for debugging BSP vs mesh.

`window.__doomModularStage` publishes current cap.

---

## Data sources

| Module | Artifact |
|--------|----------|
| `bsp/buildGzdoomDrawState.ts` | Visible seg lists for BSP wire |
| `modular/wireframeDrawState.ts` | Portal-filtered mesh edges |
| `geometry/buildMapGeometryCpu.ts` | Source triangles for mesh wire |

Node sources listed in `CLASSIC_LAYER_DEFINITIONS` for `wireframe-bsp`.

---

## URL debug caps

Combine with query params:

| Param | Effect |
|-------|--------|
| `?modStage=meshWireframe` | Stop after mesh wire stage |
| `?modStage=sky` | Stop after sky — no walls/flats |
| `?mods=…` | Modular shader experiments |

See [`modularRenderStage.ts`](../../../src/wad/renderer/modular/modularRenderStage.ts).

---

## Using wireframe to isolate breaks

| If this looks wrong… | Enable… | Implicates… |
|---------------------|---------|-------------|
| Missing rooms in BSP wire | `wireframeMode=bsp` | BSP index / subsector build |
| BSP OK, shaded walls wrong | mesh wire vs textured walls | `mapToWalls` or textures |
| Flats wrong shape | mesh wire on flat buffers | `mapToFlats` |
| Everything wire OK, black shaded | layer toggles / shaders | draw plan or atlas |

Wireframe does **not** require map reload when toggled live.

**GZDoom note:** wireframe is Classic-debug only; WASM gold path uses `gl_texture 0` in argv for untextured parity captures — different mechanism, same isolation goal.

---

[← Lighting](./08-layer-lighting.md) · [Next: Parity matrix →](./10-gzdoom-parity-matrix.md)
