# Testing Documentation

See [testing-rules.md](../testing-rules.md) and [test-matrix.md](../test-matrix.md) for policy and status.

## Test layers

1. Unit — GZSTATE reader/writer, diff tools, adapters
2. Golden — fixture stability
3. State parity — GZDoom GZSTATE vs Node GZSTATE
4. Frame parity — reference vs imported render
5. Event parity — scripted input timelines
6. Corpus — all supported maps in configured WAD fixtures
7. WASM smoke — browser WebGL2 path (later)

## WAD Lab existing tests (must not regress)

```bash
npm run test:unit
npm run test:integration
npm run build
```

GZRender-V2 tests will live under `tools/gzrender-v2/` and `renderer-v2/` once harnesses exist.
