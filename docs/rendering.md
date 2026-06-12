# Rendering

![WebGL2](https://img.shields.io/badge/WebGL2-forward_renderer-990000?logo=webgl&logoColor=white)
![apl--easy--gl](https://img.shields.io/badge/apl--easy--gl-shaders-FF6B35)
![gl-matrix](https://img.shields.io/badge/gl--matrix-camera-5C4EE5)

The level viewer is a **WebGL2 forward renderer**: triangulated sectors, extruded walls, billboards, and optional voxel meshes. It is **not** a port of Doom’s original column software rasterizer.

## Original Doom vs this renderer

| Aspect | Original Doom (1993) | Doom WAD Lab |
|--------|----------------------|--------------|
| **Output** | 320×200 8-bit framebuffer | WebGL2 RGBA canvas (any resolution) |
| **Visibility** | BSP traverse + angular clipper (`RenderBSP` / `AddLine` / `DoSubsector`) | Same BSP path via `buildGzdoomDrawState` — walls by visible linedef **and sidedef**, flats by visible **subsector** |
| **Walls** | `HWWall::Process` per visible seg (upper/mid/lower bands) | Same band logic in `hwWallProcess.ts`; quads built at load via `mapToWalls`, drawn for the BSP-visible sidedef only |
| **Floors/ceilings** | Flat **spans** per subsector (`HWFlat::ProcessSector`) | Triangulated **meshes** per sector (`mapToFlats.ts`), drawn for BSP-visible sectors |
| **Sky** | Floor/ceiling **F_SKY** holes + wall height | Full-screen **cylindrical skybox** + no F_SKY flats |
| **Sprites** | Drawn in BSP order (approximate depth) | Back-to-front sorted billboards + depth override for centers |
| **Lighting** | Sector light level → **colormap** bands | Per-sector uniforms: ambient, fog, dynamic lights |
| **Perspective** | Fixed camera | Full 6-DOF view (pitch + yaw) |

### Why we chose 3D meshes

- **GPU hardware** — modern GPUs excel at textured triangles, not CPU column drawing.
- **Effects** — parallax occlusion mapping, fog, emissive liquids, and multi-light need fragment shaders.
- **Maintainability** — one pipeline for walls, flats, sprites, voxels, sky.

Tradeoffs:

- BSP clipper occlusion drives draw culling (`src/wad/renderer/bsp/`). Portal flood-fill is no longer used in `drawScene`.
- Sprite depth can differ slightly from vanilla (we use center-depth for billboards to fix door jamb leaks).
- Sky is a **panorama** behind geometry, not per-sector sky planes (`mapToSkys.ts` exists but is not wired to the main pass).

## Frame pipeline

**File:** `src/wad/renderer/renderGame/drawScene.ts`

Order each frame:

```text
1. clear color + depth
2. drawSkybox (depth = 1.0, LEQUAL)
3. flats — floors then ceilings (sorted by height)
4. opaque walls
5. transparent walls (back-to-front)
6. voxel things (meshes)
7. sprite billboards (back-to-front, alpha blend)
```

**Camera:** `src/wad/renderer/renderGame/camera.ts` — perspective matrix, Doom-style yaw/pitch from `playerView`.

## Shaders

| Program | Files | Purpose |
|---------|-------|---------|
| `flats` | `flat.vert`, `flat.frag` | Floors/ceilings + liquid glow + POM |
| `walls` | `walls.vert`, `walls.frag` | Wall quads + transparency + POM |
| `things` | `things.vert`, `things.frag` | Billboards; `gl_FragDepth` from center |
| `voxelColor` | `voxelColor.vert`, `voxelColor.frag` | KVX mesh colors |
| `skybox` | `skyBox.vert`, `skyBox.frag` | Cylindrical scrolling sky |

Shared include: `voxelParallax.glsl` — TBN, parallax ray march.

Built with **`apl-easy-gl`** `createProgram` + GLSL 300 es.

## Culling layers

### 1. Sector portal visibility

**File:** `src/wad/renderer/utils/sectorVisibility.ts`

Precomputed index:

- `sectorAdjacency` — two-sided linedefs (excluding `blockAll`)
- `sectorBounds` — AABB per sector (from lines + triangle enrichment)

At draw time, **BFS** from camera sector:

- Radius limit (`PORTAL_VISIBILITY_RADIUS`)
- Depth limit (`MAX_PORTAL_TRAVERSAL_DEPTH`)
- **Indoor camera rule:** from a non-sky sector, only traverse into **F_SKY** outdoor sectors (and sky-to-sky), not distant **indoor** sectors — fixes E1M1 window leaks.

### 2. Distance culling

Per-sector `visibilityDistance` derived from `lightlevel` (darker = shorter fog distance).

### 3. Frustum culling

**File:** `src/wad/renderer/utils/frustumCull.ts` — sphere vs six clip planes.

### 4. Wall facing cull

Opaque walls behind the camera plane culled beyond `WALL_FACING_CULL_DISTANCE` unless camera is very close.

## Wall geometry (`HWWall::Process`)

**Files:** `src/wad/renderer/bsp/hwWallProcess.ts`, `src/wad/renderer/bsp/hwFakeFlat.ts`, `src/wad/renderer/geometry/mapToWalls.ts`

At map load, each linedef side runs a port of GZDoom `HWWall::Process`:

- **`hw_FakeFlat`** — resolves stacked-sector planes (identity for classic WADs).
- **One-sided** — mid, then bottom, then top texture over full sector height.
- **Two-sided upper** — skipped when both ceilings are sky; floor obstruction clamps back ceiling (`ffh > bch`).
- **Two-sided lower** — ceiling obstruction clamps back floor (`fch < bfh`); only when back floor is above front floor.
- **Two-sided mid** — `DoMidTexture` span with pegging (`ML_DONTPEGBOTTOM`).

BSP visibility (`buildGzdoomDrawState`) decides **which** linedefs/sectors to draw each frame; band heights come from this Process path and refresh when doors move ceilings (`refreshMapGeometry.ts`).

## Sky rendering

**Files:** `drawSkybox.ts`, `skyBox.frag`, `selectSkyTexture.ts`

- Full-screen quad at NDC far plane (`gl_Position = vec4(xy, 1, 1)`).
- Texture UV scroll from camera **yaw**; **pitch** shifts horizon (`horizonShift`).
- Writes **`gl_FragDepth = 1.0`** so nearer geometry occludes sky correctly.
- Map name selects SKY1–SKY4 (episode/game rules).

F_SKY ceiling/floor **flats are not drawn**; sky shows through window openings where no wall exists.

## Sprites vs voxels

- **Billboard:** camera-facing quad, alpha test, sorted by distance.
- **Voxel:** actual mesh; same fog/light as sector; no alpha sort between faces (painter’s order less critical).

`hasVoxelDefinitionForSprite` chooses path per thing.

## Automap

**File:** `src/wad/renderer/automap/automap.ts`

Separate 2D canvas overlay (Tab toggle, `iddt` cheat levels) — vector line drawing, not part of the 3D pipeline.

## Entry points

| File | Role |
|------|------|
| `renderGame.ts` | Canvas bind, game loop, input, `load()` |
| `drawScene.ts` | All draw passes |
| `loadWad.ts` | Map GPU setup |
| `doomPlayerControls.ts` | Movement, collision |
| `doorSystem.ts` / `useLines.ts` | Interactive lines |

## Tests

- `sectorVisibility.test.ts`, `frustumCull.test.ts`, `playerView.test.ts`
- `selectSkyTexture.test.ts`, `mapToWalls.test.ts`, `hwWallProcess.test.ts`, `bspVisibility.test.ts`

See also: [Visual enhancements](./visual-enhancements.md), [Performance](./performance.md).
