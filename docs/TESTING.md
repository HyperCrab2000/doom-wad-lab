# doom-wad-lab — testing reference

**Last updated:** 2026-06-17

Exhaustive test documentation for this repo. Cross-repo overview: [../../docs/TESTING.md](../../docs/TESTING.md) (doom workspace root).

## Vitest projects

Configured in [`vitest.config.ts`](../vitest.config.ts).

| Project | Include | Pool | Workers | Timeout |
|---------|---------|------|---------|---------|
| `unit` | `src/**/*.test.ts`, `gzstate/**/*.test.ts` | `threads` | `cpus - 1` | 60s |
| `integration` | `test/integration/**/*.integration.test.ts` | `forks` | `min(4, cpus-1)` | 180s |

Setup: [`test/setupWebGL.ts`](../test/setupWebGL.ts) (unit), [`test/setup/integrationCanvas.ts`](../test/setup/integrationCanvas.ts) (integration).

### npm scripts

| Script | What it runs |
|--------|----------------|
| `npm test` | All Vitest projects |
| `npm run test:unit` | Unit project only (~130 files) |
| `npm run test:unit:fast` | Unit with `VITEST_MAX_WORKERS=100%` |
| `npm run test:integration` | Integration project |
| `npm run test:coverage` | Unit + v8 coverage (≥90% thresholds on scoped paths) |
| `npm run test:corpus` | `corpus.parity.test.ts` — 68-map GZSTATE (`GZRENDER_CORPUS_REQUIRED=1`) |
| `npm run test:modular` | `modularStageParity.test.ts` — 11 stages × 68 maps @ spawn |
| `npm run test:mod-parity` | `modStackParity.test.ts` — PWAD merge stacks |
| `npm run test:frame` | `e1m1FrameParity.test.ts` — PNG diff vs GZDoom |
| `npm run test:browser` | Single E1M1 browser render integration |
| `npm run test:console` | Puppeteer app-shell smoke (needs preview server) |

### Corpus artifact generation

| Script | Purpose |
|--------|---------|
| `npm run corpus:parity` | Interactive corpus runner |
| `npm run corpus:parity:static` | Static GZSTATE verify per WAD arg |
| `npm run corpus:parity:all` | DOOM.WAD + DOOM2.WAD full static corpus |
| `npm run mod:parity` | Mod stack corpus (`tools/gzrender-v2/mod-corpus-parity.mts`) |

### Frame capture

| Script | Purpose |
|--------|---------|
| `npm run capture:gzdoom-frame` | GZDoom reference PNG |
| `npm run capture:wadlab-frame` | WAD Lab capture |
| `npm run diff:frame` | Normalized playfield diff |

---

## Parallelization (this repo)

### File-level

~130 unit test files run in parallel via Vitest `threads` pool. Override:

```bash
VITEST_MAX_WORKERS=100% npm run test:unit
VITEST_MAX_WORKERS=4 npm run test:unit   # throttle
```

### In-test (`test/parallelMap.ts`)

```typescript
import { parallelMap, batchItems, defaultInTestParallelism } from '../../test/parallelMap';
```

| Helper | Use |
|--------|-----|
| `parallelMap(items, fn, concurrency?)` | Parallel async work inside one `it()` |
| `batchItems(items, size)` | Split 68-map loops into Vitest cases |
| `defaultInTestParallelism()` | `min(16, cpus)`; env `VITEST_IN_TEST_PARALLEL` |

### Snapshot cache (modular parity)

[`spawnStageSnapshotHarness.ts`](../src/wad/renderer/modular/spawnStageSnapshotHarness.ts):

- `captureSpawnModularFrameSnapshot(map, backend)` — memoized per `(wad, map, backend)`.
- `clearModularSnapshotCache()` — call in `afterAll` if needed.

[`modularStageParity.test.ts`](../src/wad/renderer/modular/modularStageParity.test.ts) pre-warms cache in `beforeAll`; per-stage tests use `describe.concurrent`.

### Heavy suites (timings, local)

| Test file | Strategy | ~Wall time |
|-----------|----------|------------|
| `modularStageParity.test.ts` | Cache + concurrent stages | 3s |
| `corpus.parity.test.ts` | `parallelMap` per IWAD | 18s |
| `vanillaBspParity.test.ts` | 4-map batches + `parallelMap` + `it.concurrent` | 78s |
| Full `test:unit` | File parallelism | 1–3 min |

**Note:** Use `threads` pool for unit tests. Fork pool caused `onTaskUpdate` RPC timeouts on 60s+ BSP batches.

---

## Parity test files (GZRender-V2)

| File | Layer | Requires |
|------|-------|----------|
| `src/wad/parity/corpus.parity.test.ts` | GZSTATE 68 maps | IWADs + `artifacts/gzrender-v2/corpus/` |
| `src/wad/parity/parity.test.ts` | GZSTATE smoke (E1M1, MAP01) | Fixtures in repo / IWAD |
| `src/wad/renderer/modular/modularStageParity.test.ts` | Draw-state stages | IWADs in `public/wads/` |
| `src/wad/renderer/bsp/vanilla/vanillaBspParity.test.ts` | BSP invariants | IWADs |
| `src/wad/parity/frame/e1m1FrameParity.test.ts` | Frame pixels | Capture artifacts |
| `src/wad/mod/modStackParity.test.ts` | Mod WAD merge | Mod fixtures optional |
| `gzstate/**/*.test.ts` | GZSTATE codec | — |

Module docs: [`src/wad/parity/README.md`](../src/wad/parity/README.md).

---

## Environment variables

| Variable | Effect |
|----------|--------|
| `GZRENDER_CORPUS_REQUIRED=1` | Hard-fail if IWAD or corpus artifacts missing |
| `GZFRAME_PARITY_REQUIRED=1` | Hard-fail frame diff (else soft skip) |
| `VITEST_MAX_WORKERS` | Vitest file pool size (`100%` = all CPUs) |
| `VITEST_IN_TEST_PARALLEL` | `parallelMap` concurrency inside tests |
| `TEST_URL` | Base URL for `test:console` smoke |

---

## Prerequisites

```text
public/wads/DOOM.WAD      # commercial IWAD (gitignored)
public/wads/DOOM2.WAD
public/wads/test.wad      # bundled smoke WAD
artifacts/gzrender-v2/corpus/   # generated; see corpus:parity:all
```

GZDoom binary: build `../gzdoom-project`, use `tools/gzrender-v2/dump-gzdoom-state.sh`.

---

## CI

GitHub Actions: [docs/ci.md](./ci.md).

Default CI runs `test:unit`, `test:coverage`, `test:integration`, `build`, smoke. **Does not** run full 68-map corpus (needs IWADs + artifacts on runner).

Parity PR checklist:

```bash
npm run corpus:parity:all   # if exporter changed
npm run test:corpus
npm run test:modular
npx vitest run --project unit src/wad/renderer/bsp/vanilla/vanillaBspParity.test.ts
npm run build
```

---

## Coverage scope

[`vitest.config.ts`](../vitest.config.ts) `coverageInclude` — parsers, parity, geometry, music decode, collision, etc. Thresholds: 90% lines/statements, 82% branches.

Excluded: WebGL draw glue, monster AI simulators, worker entrypoints, constants tables.

---

## Related

| Doc | Topic |
|-----|-------|
| [gzrender-v2/test-matrix.md](./gzrender-v2/test-matrix.md) | Layer status table |
| [gzrender-v2/corpus-testing.md](./gzrender-v2/corpus-testing.md) | Corpus runner spec |
| [gzrender-v2/testing-rules.md](./gzrender-v2/testing-rules.md) | Regression policy |
| [gzrender-v2/parity-gap-tracker.md](./gzrender-v2/parity-gap-tracker.md) | Open/closed gates |
| [ci.md](./ci.md) | GitHub Actions |
