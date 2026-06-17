# Test Matrix

**Last updated:** 2026-06-17

Full reference: [../TESTING.md](../TESTING.md) and [../../docs/TESTING.md](../../docs/TESTING.md).

## WAD Lab — baseline (CI)

| Layer | Purpose | Status | Command | ~Time |
|-------|---------|--------|---------|-------|
| Unit | Engine correctness (~130 files, parallel) | Passing | `npm run test:unit` | 1–3 min |
| Unit (max cores) | Same, all CPUs | Passing | `npm run test:unit:fast` | 1–2 min |
| Coverage | ≥90% on scoped code | Passing | `npm run test:coverage` | 2–4 min |
| Integration | IWAD + synthetic canvas | Passing | `npm run test:integration` | 1–3 min |
| Build | Vite bundle + WASM | Passing | `npm run build` | ~30s |
| Smoke | App shell load | CI | `npm run test:console` | ~30s |

## GZRender-V2 — parity gates

| Test layer | Purpose | Status | Command | ~Time |
|------------|---------|--------|---------|-------|
| GZSTATE smoke | E1M1 / MAP01 fixtures | Passing | `parity.test.ts` (in `test:unit`) | seconds |
| GZSTATE corpus | 68 maps Node vs GZDoom | **Closed** | `npm run test:corpus` | ~18s |
| Vanilla BSP | 68 maps + 9000+ sector probes | **Closed** | `vanillaBspParity.test.ts` | ~78s |
| Modular stages | 68 × 11 stages @ spawn | **Closed*** | `npm run test:modular` | ~3s |
| Mod stack | PWAD merge GZSTATE | Open | `npm run test:mod-parity` | varies |
| Frame parity | E1M1 PNG vs GZDoom | Open (~99% mismatch) | `npm run test:frame` | varies |
| Frame (hard gate) | Fail on mismatch | Open | `GZFRAME_PARITY_REQUIRED=1 npm run test:frame` | — |
| Mod corpus runner | CLI batch | Open | `npm run mod:parity` | varies |
| WASM federated | Browser draw path | Partial | `npm run build:wasm` + manual | — |
| Event parity | Scripted timelines | Not started | TBD | — |
| Engine tick (GZTICK) | doom-gzengine-core | Not started | `doom-gzengine-core npm test` | — |

\*Modular gate valid while WASM delegates to Classic `drawScene` (GAP-0003).

## doom-wad-core

| Layer | Status | Command |
|-------|--------|---------|
| Unit + fixture parity | Passing | `npm test` |
| 68-map corpus | Via doom-wad-lab | `npm run test:corpus` |

## doom-gzengine-core

| Layer | Status | Command |
|-------|--------|---------|
| GZTICK codec / types | Scaffold | `npm test` |
| Tick corpus | Not started | `corpus:tick` (planned) |

## Parallelization summary

| Mechanism | Config / code |
|-----------|----------------|
| Vitest file pool | `threads`, `maxWorkers = cpus-1`, `fileParallelism` |
| In-test map parallelism | `test/parallelMap.ts` |
| Modular snapshot cache | `spawnStageSnapshotHarness.ts` |
| BSP batch size | 4 maps per `it.concurrent` in `vanillaBspParity.test.ts` |

See [TESTING.md](../TESTING.md#parallelization).

## Pre-merge checklist (parity PRs)

```bash
npm run corpus:parity:all    # if GZDoom exporter changed
npm run test:corpus
npm run test:modular
npx vitest run --project unit src/wad/renderer/bsp/vanilla/vanillaBspParity.test.ts
cd ../doom-wad-core && npm test
npm run build
```
