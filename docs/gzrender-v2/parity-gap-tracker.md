# Parity Gap Tracker

| ID | WAD | Map | Failure Class | Description | Artifact Path | Status |
|---|---|---|---|---|---|---|
| GAP-0001 | DOOM | E1M1 | frame-only | GZDoom ref capture not pinned to 640×480 (macOS HiDPI → 2560×1387); diff normalizes playfield to 320×168 | `artifacts/gzrender-v2/gzdoom/E1M1.png` | Open — workaround in diff tool |
| GAP-0002 | DOOM | E1M1 | renderer dependency | Stage 2 open: **99.24%** playfield pixel mismatch vs GZDoom @ spawn (320×168 normalized) | `artifacts/gzrender-v2/wadlab/E1M1.png` | Open |
| GAP-0003 | ALL | ALL | renderer dependency | WASM federated delegates to Classic `drawScene`; not independent | `public/wasm/gzrender_federated/` | Open |
| GAP-0004 | DOOM+DOOM2 | 68 | — | GZSTATE load parity Node vs GZDoom | `artifacts/gzrender-v2/corpus/` | **Closed** |
| GAP-0005 | DOOM | E1M1+ | mod stack | PWAD/PK3 `-file` parity — WAD merge + mod corpus; PK3/ZScript/RT/voxel runtime not in GZSTATE | `docs/gzrender-v2/mod-parity.md` | Open |
| GAP-0006 | ALL | ALL | missing subsystem | **Game engine WASM** not built — only GZSTATE renderer + TS vanilla specials | `doom-gzengine-core/`, `docs/gzrender-v2/game-engine-vs-renderer.md` | Open |

## Closed (2026-06-17)

- **68/68 maps** — Node `exportToGzstate` matches GZDoom dump on all 20 GZSTATE sections (`npm run test:corpus`).
- **68/68 maps** — BSP draw-state @ spawn matches Classic vs WASM federated (`npm run test:modular`) — valid only while WASM delegates to Classic.

## Next gate

E1M1 playfield frame diff: `npm run capture:wadlab-frame` + `npm run diff:frame` + `GZFRAME_PARITY_REQUIRED=1 npm run test:frame`.
