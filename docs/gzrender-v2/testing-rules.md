# Testing Rules

## Philosophy

Every bug becomes a regression test. Run tests often. Do not build a large renderer branch that only gets tested at the end.

## Test Layers

1. Unit tests
2. Golden fixture tests
3. GZDoom-vs-Node state parity tests
4. Import/render frame parity tests
5. Event timeline parity tests
6. Corpus tests
7. WASM/WebGL2 smoke tests later

## Required Unit Coverage Areas

- GZSTATE reader/writer
- endian handling
- section offsets/counts
- checksums
- string table encoding
- texture/flat table encoding
- sector serialization
- side/line serialization
- seg/subsector/node serialization
- event stream encoding
- patch buffer encoding
- NodeJS adapter normalization
- diff tool field comparison

## Regression Policy

When fixing a mismatch:

1. Add or update a failing test that reproduces it.
2. Fix the code.
3. Confirm the test passes.
4. Run the nearest broader suite.
5. Update status and parity tracker.

## Stop-the-Line Regressions

Stop and fix immediately if:

- existing WAD Lab parser tests break
- existing renderer behavior changes unintentionally
- existing music/sound parser breaks
- existing voxel parser breaks
- GZSTATE changes without version bump
- golden fixtures change without explanation
- state/frame/event parity regresses on a previously passing map or script

## Test Cadence

- After serializer changes: unit + golden tests.
- After Node adapter changes: unit + state parity smoke.
- After GZDoom exporter changes: build + dump + `npm run test:corpus`.
- After importer changes: import/render smoke.
- After renderer changes: frame diff smoke (`npm run test:frame`).
- After event/state-machine changes: event timeline tests.
- Before ending a session: broadest safe working suite.

## Parallel execution (2026-06-17)

Heavy IWAD suites use three mechanisms documented in [TESTING.md](../TESTING.md):

1. **Vitest file pool** — `threads` pool, `maxWorkers = cpus - 1`, `fileParallelism: true` (~130 unit files in parallel).
2. **In-test `parallelMap`** — bounded concurrency across maps inside a single `it()` (`test/parallelMap.ts`).
3. **Snapshot cache** — modular parity avoids redundant Classic/WASM captures (`spawnStageSnapshotHarness.ts`).

Environment overrides:

```bash
VITEST_MAX_WORKERS=100% npm run test:unit
VITEST_IN_TEST_PARALLEL=8 npm run test:corpus
```

**Integration tests** stay on `forks` pool (max 4 workers) to avoid Puppeteer contention.

Do not use hundreds of `it.concurrent` cases in one file — prefer `parallelMap` or small batches (see `vanillaBspParity.test.ts`, batch size 4).
