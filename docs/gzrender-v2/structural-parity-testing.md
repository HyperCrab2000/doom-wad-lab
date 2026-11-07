# Structural parity testing (no screenshots)

**Last updated:** 2026-11-07

Pixel / PNG gates are necessary for Classic ladder Steps 2–6, but they are expensive, brittle, and a poor first oracle after line-for-line GZDoom ports failed. This doc defines the **declarative data** gate we trust for visibility: sorted sector / wall / thing sets from finite probes.

## Confidence model

| Layer | What we compare | Confidence | Gate |
|-------|-----------------|------------|------|
| **S0 — Topology** | REJECT PVS, portal flood-fill, camera sector | High | Existing REJECT + courtyard invariants |
| **S1 — BSP sets** | Sorted `visibleSectors`, wall linedefs, flat subsectors | High | `vanillaBspParity` + golden BSP hashes |
| **S2 — Draw cull** | Draw sectors ⊆ BSP ∩ REJECT | High | `checkDrawStateVsVanillaBsp` + structural suite |
| **S3 — Things** | Thing indices whose sector ∈ draw-visible | High for *candidates*; medium for on-screen sprites | `structuralVisibilityParity.test.ts` |
| **S4 — Pitch** | Same S1–S3 for look-up / level / look-down | High that BSP is pitch-invariant (classic 2.5D) | Same suite asserts equality across pitches |
| **P — Pixels** | Playfield buckets / PNG | Separate; not a substitute for S0–S4 | Classic ladder / honest-parity |

**Honest claim:** S0–S4 can say “from every walkable sector centroid, facing N/E/S/W, looking up and down, the engine nominates the same sectors and the same thing candidates.” They do **not** claim column raster, colormap, or sprite billboard pixel parity.

## Finite probes (not sub-pixels)

We deliberately avoid continuous XY sampling.

| Axis | Samples | Why enough |
|------|---------|------------|
| Position | Player spawn + **one centroid per walkable sector** | Covers every sector volume without ∞ points |
| Yaw | 4 cardinals (0° / 90° / 180° / 270°) | Matches [view-probe-grid.md](./view-probe-grid.md) |
| Pitch | −0.55 / 0 / +0.55 rad | Proves look-up/down leave structural sets unchanged |

E1M1 ≈ 80 walkable sectors × 4 yaws × 3 pitches ≈ **~1k structural samples** (seconds in Vitest). Full IWAD sector×yaw BSP already exists in `vanillaBspParity.test.ts` (~36k probes without pitch/things).

## Snapshot shape

```ts
{
  cameraSectorIndex, cameraSubsector,
  bspVisibleSectors: number[],   // sorted
  drawVisibleSectors: number[],  // sorted; ⊆ BSP ∩ REJECT
  bspWallLines: number[],        // sorted unique linedefs
  visibleThingIndices: number[], // THINGS in draw-visible sectors
  visibleThingTypes: number[]    // parallel Doom type ids
}
```

Equality and SHA256 prefixes lock regression without images. Golden keys today: E1M1 `spawn`, `window43-south`, `courtyard-center-n`.

## Pitch policy

Classic / GZDoom HW BSP traversal is **horizontal**. Pitch changes projection (pixels), not which subsectors `RenderBSP` visits. The structural suite therefore treats pitch as an **invariance proof**, not a third visibility axis. Raster look-up/down remains a Classic ladder / PNG concern.

## Things / items in other sectors

A thing is a structural candidate iff:

1. Not `hideInSingleplayer`
2. Its BSP subsector → sector is in `drawVisibleSectors`

So if sector B is draw-visible from a probe in sector A, every single-player thing in B appears in `visibleThingIndices`. Things outside the draw set must stay out. This is membership parity, not sprite clipping or occlusion by midtextures.

## What this replaces (and what it does not)

| Approach | Verdict |
|----------|---------|
| Copy GZDoom renderer line-for-line | Tried; failed as a parity strategy |
| Screenshot / PNG as the only gate | Too coarse and too expensive for “same sectors/things” |
| Finite structural snapshots + invariants | Primary confidence for visibility membership |
| Pixel buckets | Still required for lighting / walls / flats / sprites |

## Commands

```bash
npx vitest run src/wad/parity/structural/structuralVisibilityParity.test.ts
npx vitest run src/wad/renderer/bsp/vanilla/vanillaBspParity.test.ts
npx vitest run src/wad/renderer/bsp/vanilla/bspGoldenSnapshots.test.ts
```

## Source

- `src/wad/parity/structural/structuralViewSnapshot.ts`
- `src/wad/parity/structural/structuralVisibilityInvariants.ts`
- `src/wad/parity/structural/structuralVisibilityParity.test.ts`
