# View probe grid

## Purpose

The view-probe grid defines **which cameras** GZDRAW corpus tests visit. Each probe is a `(map, viewX, viewY, yawDeg)` tuple with a stable **`probeId`**. Tier 2 GZDRAW dumps and Tier 3 PNG captures both key off the same grid.

See also: [GZDRAW v1 wire format](./gzdraw-v1.md), [four-step plan](./four-step-plan.md).

## Enumeration rules

### Probe 0 — player spawn (always)

- **Kind:** `spawn`
- **Position:** player 1 start thing (`type === 1`) from `THINGS` — same as `playerStartView()` in `vanillaBspHarness.ts`
- **Yaw:** thing `angle` field in **degrees** (Doom editor convention: 0 = east, 90 = north, 180 = west, 270 = south)
- **probeId:** `0` for every map
- Exactly **one** spawn probe per map (not multiplied by cardinal yaws)

### Sector probes — one per walkable sector × 4 cardinal yaws

- **Kind:** `sector`
- **Sectors:** every sector where `ceilingheight > floorheight` (walkable / non-degenerate volume)
- **Position:** centroid of linedef vertices bounding the sector — `sectorProbePoint()` / `enumerateSectorProbes()` in `vanillaBspHarness.ts` (mean of all sidedef vertex coords for that sector)
- **Yaws:** four **cardinal** headings only:

| yawDeg | Doom angle (°) | BAM (65536/360) | Facing |
|---|---|---|---|
| 0 | 0 | 0 | east |
| 90 | 90 | 16384 | north |
| 180 | 180 | 32768 | west |
| 270 | 270 | 49152 | south |

- **probeId:** monotonic `1…N-1` after spawn, assigned in stable order (see below)

### Stable probeId assignment

For a given map:

1. `probeId 0` → spawn
2. For `sectorIndex` ascending `0 … sectorCount-1`:
   - Skip non-walkable sectors (no probe point)
   - For each surviving sector, emit yaws in order: **0°, 90°, 180°, 270°**
   - Increment `probeId` after each `(sector, yaw)` pair

The same map + IWAD must always produce the same probe list and ids. Tools and tests depend on this ordering.

### Maps covered

- **IWADs:** `DOOM.WAD` (27 maps) + `DOOM2.WAD` (32 maps) = **68 maps**
- Per-map probe lists are independent; `probeId` resets at 0 for each map.

## Tooling

Generate probes with:

```bash
npx tsx tools/gzrender-v2/enumerate-view-probes.mts public/wads/DOOM.WAD --map E1M1
```

Output record shape:

```json
{
  "map": "E1M1",
  "sectorIndex": -1,
  "viewX": 1056,
  "viewY": -3616,
  "yawDeg": 90,
  "probeId": 0,
  "kind": "spawn"
}
```

| Field | spawn | sector |
|---|---|---|
| `sectorIndex` | `-1` | sector index |
| `kind` | `"spawn"` | `"sector"` |
| `yawDeg` | player start angle | 0, 90, 180, or 270 |

Use `--jsonl` for one JSON object per line; default output is a JSON array.

## Scale estimate (DOOM + DOOM2)

Measured with `enumerate-view-probes.mts` on both IWADs (68 maps):

| Metric | Count |
|---|---|
| Spawn probes | 68 |
| Sector × cardinal yaw probes | 36,688 |
| **Total view probes** | **36,756** |
| Walkable sector centroids (÷ 4) | ~9,172 |

Per-map counts vary widely (E1M1 = 329; small maps ≈ 40–120; large maps ≈ 400–700).

These probes feed:

- GZDRAW corpus diff (Tier 2) — one `.gzdraw` per probe
- Extended frame corpus (Tier 3) — optional PNG @ same probes once draw parity is green

## Relationship to existing BSP tests

`vanillaBspParity.test.ts` already exercises `enumerateSectorProbes()` × `CARDINAL_YAWS` against classic BSP trace and GZDoom draw-state invariants. The view-probe grid formalizes that enumeration for corpus artifacts and GZDRAW naming.

Spawn-only PNG gold (`ref.png` @ player start) remains the **Step 2 frame gate** until the multi-probe frame corpus is explicitly enabled.
