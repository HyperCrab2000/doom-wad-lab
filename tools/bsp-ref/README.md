# BSP reference harness

Third-party ground truth for `buildBspVisibleSet` / `traceClassicBsp`.

## Proof chain (100% confidence target)

```text
id r_bsp.c / GZDoom hw_bsp.cpp
        ↓ port
buildBspVisibleSet  ←——→  traceClassicBsp   (dual TS, must agree)
        ↓
bspGoldenSnapshots.json   (68 spawn + E1M1 courtyard hashes)
        ↓
buildGzdoomDrawState (subsector-bsp mode when subsectorFlats present)
        ↓
renderGzdoomFlats (subsector meshes only — matches DoSubsector visits)
```

## Automated tests

| Test file | What it proves |
|-----------|----------------|
| `vanillaBspParity.test.ts` | Trace ≡ visible at every spawn; trace ≡ visible at **every sector × 4 yaws** (~20k checks); draw ⊆ BSP |
| `bspGoldenSnapshots.test.ts` | SHA-256 regression lock on full BSP output for all 68 IWAD spawns + 5 E1M1 views |
| `courtyardVisibility.test.ts` | Production subsector draw ⊆ BSP flat visits; connectivity topology rules |

## Regenerate golden snapshots

After an intentional BSP change:

```bash
npx tsx scripts/generate-bsp-golden-snapshots.ts
```

## Native C reference (optional)

`chocolate-doom/` is vendored for manual cross-check against vanilla `r_bsp.c`.
Build when needed:

```bash
cd tools/bsp-ref/chocolate-doom
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

A dedicated `bsp-dump` binary is not wired into CI yet; the dual TypeScript trace + golden hashes are the authoritative automated gate.

## Draw modes

- **`subsector-bsp`** (production): flats/sprites use sectors from `flatSubsectorOrder` only — same rule as GZDoom `DoSubsector` before `HWFlat::ProcessSector`.
- **`sector-connectivity`** (legacy fallback when no subsector meshes): `BSP ∩ portal BFS ∩ REJECT` because full-sector flat polygons leak through pass walls.
