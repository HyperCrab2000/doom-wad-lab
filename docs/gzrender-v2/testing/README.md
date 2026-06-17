# Testing Documentation

**Last updated:** 2026-06-17

## Canonical references

| Document | Scope |
|----------|-------|
| [../TESTING.md](../TESTING.md) | **Exhaustive** doom-wad-lab test reference |
| [../../../docs/TESTING.md](../../../docs/TESTING.md) | Cross-repo workspace guide |
| [testing-rules.md](../testing-rules.md) | Regression policy |
| [test-matrix.md](../test-matrix.md) | Layer commands and status |

## Test layers

1. **Unit** — parsers, GZSTATE codec, geometry, music, collision (~130 files, Vitest `threads` pool)
2. **Golden** — fixture byte stability
3. **State parity** — GZDoom GZSTATE vs Node (`test:corpus`, 68 maps)
4. **Draw-state** — BSP invariants, modular stages (`test:modular`, `vanillaBspParity`)
5. **Frame parity** — reference vs WAD Lab PNG (`test:frame`)
6. **Event parity** — scripted input timelines (planned)
7. **Corpus** — IWAD + mod stacks
8. **WASM smoke** — federated browser path

## Parallelization (2026-06-17)

| Mechanism | Location |
|-----------|----------|
| Vitest `threads` + `maxWorkers` | `vitest.config.ts` |
| `parallelMap` / `batchItems` | `test/parallelMap.ts` |
| Modular snapshot cache | `spawnStageSnapshotHarness.ts` |

Heavy suite timings (local): modular ~3s, corpus ~18s, vanilla BSP ~78s.

## Quick commands

```bash
npm run test:unit              # ~130 files parallel
npm run test:unit:fast         # all CPU cores
npm run test:corpus            # 68-map GZSTATE (needs IWADs + artifacts)
npm run test:modular           # 11 stages × 68 maps
npm run test:integration       # canvas integration
npm run test:coverage          # ≥90% gate
```

## WAD Lab baseline (must not regress)

```bash
npm run test:unit
npm run test:integration
npm run build
```

GZRender-V2 tools: `tools/gzrender-v2/`, `renderer-v2/`, `artifacts/gzrender-v2/`.
