# Voxels (KVX)

![Three.js](https://img.shields.io/badge/Three.js-viewer-000000?logo=threedotjs&logoColor=white)
![WebGL2](https://img.shields.io/badge/WebGL2-in--game-990000?logo=webgl&logoColor=white)
![Voxel Doom](https://img.shields.io/badge/Voxel_Doom-VOXELDEF-E53935)

This project integrates **Voxel Doom**–style `.kvx` models: colored voxel meshes replace classic sprite billboards for supported things (monsters, items, decorations).

## Two surfaces

| Surface | Location | Engine |
|---------|----------|--------|
| **In-game** | Level viewer | WebGL2 `voxelColor` shader in `drawScene` |
| **Voxel Viewer tab** | `VoxelModelViewer.tsx` | Three.js preview + orthographic projections |

Both use the same **Slab6 KVX loader** and **surface mesh builder**.

## VOXELDEF catalog

**Files:** `src/wad/voxels/voxelCatalog.ts`, `voxel_doom/VoxelDoom_v2.4/VOXELDEF.txt`

At build time, Vite imports raw text:

- Doom 1 + Doom 2 `VOXELDEF.txt` — maps lump names to filenames  
  Example: `SARGA = "SARGA"` → sprite `SARG`, frame `A`
- ZScript animation sources (`CheelloMonstersDoom1.zc`, etc.) — **frame order** for walk/attack/death sequences

```typescript
export interface VoxelCatalogEntry {
  lumpName: string;   // e.g. SARGA
  fileName: string;   // e.g. SARGA (→ SARGA.kvx)
  sprite: string;     // first 4 chars: SARG
  frame: string;      // frame letter: A
}
```

`getVoxelAnimationEntriesForSprite('SARG')` returns ordered frames for animation.

## KVX file format (Slab6)

**File:** `src/wad/parser/kvxLoader.ts`

KVX is a **slab-based** voxel format (not dense 3D grid):

1. **Header** — `xsiz`, `ysiz`, `zsiz`, pivot offsets.
2. **Slab index** — `xstart[]`, `xyoffs[][]` point into voxel data.
3. **Three-pass visibility**:
   - Pass 1: mark occupied slabs in a bit-packed `vbit[]`
   - BFS from volume edges → mark exterior air
   - Pass 2: clear exterior slabs
   - Pass 3: read color indices into `KvxVoxel[]` with per-face visibility flags

4. **Palette** — 768 trailing bytes (RGB × 256).

### Coordinate remap

Slab6: **X** left/right, **Y** depth, **Z** down.

WebGL / Three.js: **X** right, **Y** up, **Z** depth (negated map Y).

`getVoxelFloorLift()` and `getVoxelSpanHeight()` align model feet to sector floor.

## Surface mesh extraction

**File:** `src/wad/voxels/kvxMesh.ts`

Greedy face emission: for each solid voxel, emit a quad on faces where no neighbor exists (visibility bitmask `1|2|4|8|16|32` = ±X, ±Y, ±Z).

- Output: `positions`, `colors` (from PLAYPAL-style palette, brightened), triangle `indices`
- `WeakMap<KvxModel, KvxSurfaceMesh>` avoids rebuilding identical frames

## In-game hydration

**Files:** `src/wad/renderer/renderGame/voxelThingMeshes.ts`, `src/wad/renderer/workers/kvxWorkerPool.ts`

On map load:

1. Scan `map.THINGS` → unique sprites with VOXELDEF entries.
2. Fetch `/voxels/{fileName}.kvx` (version query string for cache bust).
3. **`buildKvxMeshInPool`** — 2–4 worker threads parse KVX off main thread; transferable `ArrayBuffer`.
4. Store `RuntimeVoxelMesh` per sprite frame in `VoxelThingFrameMap`.

In `drawScene`:

- If voxel mesh ready → draw colored mesh with sector fog/light uniforms.
- Else → fall back to classic **sprite billboard** (same thing slot).

Things skipped: player, some specials, sprites without VOXELDEF.

## Voxel Viewer (Three.js)

**File:** `src/components/VoxelModelViewer.tsx`

- Dropdown of things with known KVX sets
- Auto-load frame set from catalog; animate at configurable FPS
- **Three.js** rotating preview + top/bottom/front/back/side projections
- Manual `.kvx` upload for testing

Assets live in `public/voxels/` (not bundled in git — copy from Voxel Doom pack).

## Legacy voxel renderer

**File:** `src/wad/renderer/voxelRenderer.ts`

Standalone WebGL2 path with parallax/normal/specular includes — used by older experiments. In-game rendering uses the lighter `voxelColor.vert/frag` pair.

## How we figured it out

1. **VOXELDEF** gave filename ↔ sprite frame mapping without running GZDoom.
2. **ZScript** imports provided animation order missing from static DEF files alone.
3. **Slab6 KVX** layout was reverse-engineered from community specs + hex inspection; exterior-slab cull matches in-game Voxel Doom look.
4. **Floor lift** tuned by comparing mesh bbox to Doom thing heights and sector floors.
5. **Worker pool** added after large models (e.g. Baron) blocked the main thread during parse.

## Tests

- `kvxLoader.test.ts`, `kvxVisibility.test.ts`, `kvxRealAssets.test.ts`
- `kvxLibrary.test.ts` — loads every public KVX under `public/voxels/`
- `voxelCatalog.test.ts` — DEF/ZScript parsing

## Asset checklist

```text
public/voxels/SARGA.kvx
public/voxels/SARGB.kvx
…
voxel_doom/VoxelDoom_v2.4/VOXELDEF.txt   (bundled metadata)
```

See root [README](../README.md#assets) for setup.
