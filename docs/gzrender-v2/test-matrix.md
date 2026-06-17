# Test Matrix

**Last updated:** 2026-06-16

## WAD Lab existing tests (must not regress)

| Layer | Purpose | Status | Command |
|-------|---------|--------|---------|
| Unit | Engine correctness | Passing (baseline) | `npm run test:unit` |
| Coverage | ≥90% on scoped code | Passing (baseline) | `npm run test:coverage` |
| Integration | IWAD + synthetic | Passing (baseline) | `npm run test:integration` |
| Build | Vite bundle | Passing (baseline) | `npm run build` |
| Smoke | App shell load | CI | `npm run test:console` |

## GZRender-V2 tests (not started)

| Test Layer | Purpose | Status | Command |
|------------|---------|--------|---------|
| Unit | GZSTATE reader/writer, diff tools | Not started | TBD (`tools/gzrender-v2/`) |
| Golden | Fixture stability | Not started | TBD |
| State parity | GZDoom GZSTATE vs Node GZSTATE | Not started | TBD |
| Render parity | reference frame vs imported render | Not started | TBD |
| Event parity | GZDoom-observed vs Renderer-V2 events | Not started | TBD |
| Corpus | all supported maps/WADs | Not started | TBD |
| WASM smoke | browser WebGL2/WASM basic path | Not started | TBD |
