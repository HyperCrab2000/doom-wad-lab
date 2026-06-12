# Visual enhancements

![WebGL2](https://img.shields.io/badge/POM-parallax_occlusion-990000?logo=webgl&logoColor=white)
![GLSL](https://img.shields.io/badge/GLSL-300_es-5586A2?logo=opengl&logoColor=white)

Beyond faithful Doom geometry, the renderer adds **lighting heuristics**, **emissive liquids**, **height-map parallax**, **voxel models**, **dynamic lights**, and **classic transitions**.

## Sector lighting & fog

**Files:** `src/wad/renderer/renderGame/sectorLighting.ts`, `lightingHeuristics.ts`, `loadWad.ts`

On map load, each sector gets GPU uniforms derived from data + texture samples:

| Property | Source |
|----------|--------|
| `lightIntensity` | `sector.lightlevel / 255`; boosted for liquids |
| `visibilityDistance` | Brighter sectors → see farther (`MIN..MAX_VISIBILITY_DISTANCE`) |
| `ambientColor` | Sampled from floor flat canvas |
| `ambientColorFromWall` | Blended from adjacent wall texture colors |
| `fogColor` / `fogDensity` | Darker sectors → heavier fog |
| `skyLightTint` | Sectors with sky-visible windows get cool tint |

**Slime / liquid floors** (`classifyFlatLiquid`):

- NUKAGE, SLIME, SFALL, DBRAIN, lava, blood flats
- Higher `lightIntensity` multiplier (1.5×–2×)
- `liquidColor`, `liquidStrength`, `liquidEmissive` sent to `flat.frag`
- Animated pulse via `timeSeconds` uniform

## Slime glow & surface glow (walls)

**Files:** `flat.frag`, `walls.frag`, `sectorLighting.ts` — `getTextureSurfaceGlow()`

Floors:

```glsl
// flat.frag — liquid emissive pulse
litColor += liquidColor * liquidStrength * liquidEmissive * pulse;
```

Walls with fire/lava/blood/waterfall texture names get:

- `surfaceGlowColor`, `surfaceGlowStrength`, `surfaceGlowPulse`

## Parallax occlusion mapping (POM)

**Files:** `heightTextures.ts`, `voxelParallax.glsl`, `walls.frag`, `flat.frag`

### Height map sources (priority)

1. **Voxel Doom PNGs** — `public/voxel_heights/walls|flats/{NAME}.png`
2. **Procedural emboss** — luminance + noise from albedo canvas when PNG missing
3. **Fallback** — flat 1×1 texture (no parallax)

`createHeightTextureSet` runs at map load; animated texture families inherit height from donor names (`propagateWallHeightRelief`).

### Shader ray march

`ParallaxOcclusionMap` in `voxelParallax.glsl`:

- Builds TBN from normal + tangent
- 12–16 layer ray march with binary search refinement
- Strength scaled by `reliefStrength` (higher for authored voxel height maps)
- **Fades near camera** (48–160 units) to avoid swimming artifacts

Separate strengths: `getWallReliefStrength` / `getFlatReliefStrength`.

## Voxels in the world

**Files:** `voxelThingMeshes.ts`, `drawScene.ts`, `voxelColor.frag`

When a thing’s sprite has VOXELDEF entries:

- Colored **voxel mesh** replaces the flat sprite
- Position: `sector.floorheight + mesh.floorLift`
- Rotation: thing angle; pickups spin slowly
- Same fog and nearest point light as walls

While KVX loads asynchronously, the **sprite billboard** shows as fallback (no pop-in hole).

## Point lights from things

**Files:** `sectorLighting.ts` — `createThingPointLights`, `precomputedLights.ts`

Lit map things (torches, candles, barrels, etc.) become **point lights**:

- Up to 4 nearest lights per draw call (`computeNearestLightUniforms`)
- Dynamic light on things excludes self (`computeDynamicLightAt`)

## Doom level transition (melt wipe)

**File:** `src/features/level-viewer/DoomLevelTransition.tsx`

Classic **melt** effect on level change:

1. Show loading overlay (`P_SetupLevel` style)
2. Render the new level under the overlay
3. **Per-pixel vertical columns** drip downward at staggered speeds (~2.6s), revealing the level
4. Resume gameplay + music

The overlay copies the live WebGL frame each tick (with `readPixels` / `drawImage` fallback) so the dissolve always runs.

## Music visualizer

**File:** `src/features/level-viewer/music/MusicVisualizer.tsx`

Winamp-style mini canvas: green waveform + orange spectrum bars driven by `AnalyserNode` on the music bus.

## Automap polish

**File:** `src/wad/renderer/automap/automap.ts`

- Tab overlay
- `iddt` cheat: all lines → all things

## UI / presentation

**Files:** `index.css`, `LevelViewer.tsx`, `DoomHeaderLogo.tsx`

- Compact hero + toolbar layout
- Inline music controls + visualizer
- FPS / voxel counters (DOM overlays)

## Audit tooling

**File:** `scripts/audit-textures.ts`

Development script to compare WAD texture names against available height maps and relief coverage.

## Related constants

**File:** `src/wad/constants/RenderInfo.ts`

```typescript
MIN_VISIBILITY_DISTANCE = 640
MAX_VISIBILITY_DISTANCE = 3200
PORTAL_VISIBILITY_RADIUS = 4096
FRUSTUM_CULL_RADIUS = 160
WALL_FACING_CULL_DISTANCE = 96
```

Tune these to balance quality vs GPU load on large maps.
