# Chapter 03 — Node geometry pipeline

## Table of contents

- [End-to-end flow](#end-to-end-flow)
- [Phase 1 — WAD parse (Node)](#phase-1--wad-parse-node)
- [Phase 2 — Geometry worker](#phase-2--geometry-worker)
- [Phase 3 — GPU upload](#phase-3--gpu-upload)
- [Phase 4 — BSP draw state](#phase-4--bsp-draw-state)
- [Diagnostics when geometry fails](#diagnostics-when-geometry-fails)
- [Related chapters](#related-chapters)

---

## End-to-end flow

```mermaid
flowchart TB
  subgraph node [Node / doom-wad-core]
    WAD[IWAD ArrayBuffer] --> LW[loadWadFromArrayBuffer]
    LW --> MAP[WadMap — VERTEXES LINEDEFS SECTORS …]
  end

  subgraph worker [Web Worker — geometry.worker.ts]
    MAP --> CPU[buildMapGeometryCpu]
    CPU --> WALLS[mapToWalls → WallObject[]]
    CPU --> FLATS[mapToFlats → FlatObject[]]
    CPU --> SPR[sprite billboards / KVX]
  end

  subgraph gpu [Main thread — renderGame]
    WALLS --> BUF[GPU VBO / IBO upload]
    FLATS --> BUF
    SPR --> BUF
    BUF --> BSP[buildGzdoomDrawState]
    BSP --> DRAW[drawScene executeHwDrawPipeline]
  end
```

| Stage | Runs where | Output artifact |
|-------|------------|-----------------|
| `loadWad.ts` | Node / browser main | `Wad`, `WadMap`, texture index |
| `buildMapGeometryCpu.ts` | Worker | Combined CPU geometry bundle |
| `mapToWalls.ts` | Worker | Extruded wall quads + UVs |
| `mapToFlats.ts` | Worker | Floor/ceiling triangle soup |
| `buildGzdoomDrawState.ts` | Main (after BSP index) | Per-frame visible wall/flat lists |
| `drawScene.ts` | Main rAF loop | WebGL2 draw calls |

**Code entry:** [`geometryWorkerClient.ts`](../../../src/wad/renderer/workers/geometryWorkerClient.ts) — `buildMapGeometryInWorker()`.

---

## Phase 1 — WAD parse (Node)

Classic renderer consumes the same parsed structures documented in the [WAD Bible](../wad/03-map-lumps.md).

| Lump | Classic use | TypeScript interface |
|------|-------------|----------------------|
| VERTEXES | Wall endpoints, flat polygon corners | `Vertex` |
| LINEDEFS | Wall segments, specials | `LineDef` |
| SIDEDEFS | Upper/mid/lower textures | `SideDef` |
| SECTORS | Floor/ceiling heights, flats, light | `Sector` |
| THINGS | Sprites, lights, player starts | `Thing` |
| SSECTORS / SEGS / NODES | BSP visibility | `Subsector`, `Seg`, `Node` |

Parser authority: `doom-wad-core/src/parser/loadWad.ts`.

Lab hydration: [`renderGame/loadWad.ts`](../../../src/wad/renderer/renderGame/loadWad.ts) rasterizes PLAYPAL patches into GPU-ready RGBA atlases.

---

## Phase 2 — Geometry worker

The worker keeps heavy CPU tessellation off the UI thread.

```
main thread                          geometry.worker
     │ buildMapGeometryInWorker(map) ──► buildMapGeometryCpu(map)
     │◄── postMessage(geometryBundle) ─── mapToWalls + mapToFlats + sprites
```

| Module | Input | Output |
|--------|-------|--------|
| [`mapToWalls.ts`](../../../src/wad/renderer/geometry/mapToWalls.ts) | LINEDEFS + SIDEDEFS + SECTORS | `WallObject[]` with positions, UVs, normals |
| [`mapToFlats.ts`](../../../src/wad/renderer/geometry/mapToFlats.ts) | Subsector polygons / sector loops | `FlatObject[]` floor + ceiling meshes |
| [`buildMapGeometryCpu.ts`](../../../src/wad/renderer/geometry/buildMapGeometryCpu.ts) | Full map | Single transferable bundle |

**Layer coupling:** Geometry is built **once per map load**. Layer toggles do **not** rebuild geometry — they only gate draw passes (see [Chapter 02](./02-draw-plan-to-stages.md)).

---

## Phase 3 — GPU upload

After the worker returns, `renderGame.load()` uploads buffers and builds shader uniforms:

- Wall VBOs keyed by texture / light batch
- Flat VBOs with flat atlas UVs
- Sky cylinder mesh (static)
- Sprite atlas from `S_*` lumps

If upload succeeds but a layer is black, suspect **draw plan gates** or **texture atlas**, not the worker.

---

## Phase 4 — BSP draw state

Each frame, [`buildGzdoomDrawState.ts`](../../../src/wad/renderer/bsp/buildGzdoomDrawState.ts) walks BSP from the camera subsector and produces:

- Visible wall segments (with portal filtering)
- Visible flat batches
- Courtyard sky subsector set (for `courtyardSky` toggle)

This mirrors GZDoom's HW traversal conceptually; see [GZDoom BSP](../gzdoom/04-bsp-traversal.md).

Wireframe debug layers read the same draw state — [Chapter 09](./09-layer-wireframe.md).

---

## Diagnostics when geometry fails

| Symptom | Likely break point | Check |
|---------|-------------------|-------|
| Infinite loading | Worker throw / timeout | Browser console, worker `onerror` |
| Map ready, all layers black | GPU init / shader link | `webglInitError` in LevelViewer |
| Walls missing, flats OK | `mapToWalls` or wall upload | `__doomDrawStats.walls === 0` with walls toggle on |
| Holes in floors | `mapToFlats` tessellation | Compare E1M1 vs problematic map |
| Sprites absent | THINGS or missing `S_*` lump | Layer `sprites` inactive vs parse failure |

**Puppeteer:** `npx tsx tools/gzrender-v2/test-classic-layers-matrix.mts` — isolates which layer ID fails without reloading the map.

---

## Related chapters

| Next | Topic |
|------|-------|
| [04 — Walls](./04-layer-walls.md) | LINEDEFS → quads |
| [05 — Flats](./05-layer-flats.md) | SECTORS → triangles |
| [06 — Sky](./06-layer-sky.md) | F_SKY handling |

---

[← Stages](./02-draw-plan-to-stages.md) · [Next: Walls →](./04-layer-walls.md)
