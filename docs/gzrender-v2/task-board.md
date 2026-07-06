# GZRender-V2 Task Board

**Last updated:** 2026-07-06 — scoreboard canonical in [RELEASES.md](../RELEASES.md)

## Active gate — Step 2 (GZDoom WASM ≡ gold)

**2c frame corpus:** **21/68 strict** (2026-06-24 recapture; see [phase-2c-breakdown.md](./phase-2c-breakdown.md))

| Sub | Maps | Target strict | Status |
|-----|------|---------------|--------|
| **2c-0** Infra | 68 | capture + eval | [x] Done |
| **2c-a** Micro colormap | 8 | 40/68 | [ ] Open |
| **2c-b** Edge pixels | 14 | 54/68 | [ ] Open |
| **2c-c** Horizon | 8 | 62/68 | [ ] Open |
| **2c-d** Outdoor | 6 | 68/68 | [ ] Open |
| **2c-z** Full gate | 68 | `gzdoom-wasm:corpus:all:strict` | [ ] Blocked |

- [x] **2d — GZDRAW spawn 68/68** — `gzdraw-corpus:spawn:eval`; full multi-probe grid optional
- [x] **2e — Level Viewer GZDoom WASM** — Play + Gold, MEMFS capture

## Done — Step 2 headless / oracle

- [x] GZDoom WASM build + pk3s (`npm run build:gzdoom-wasm`)
- [x] `gzdoom-oracle.html` + Puppeteer capture
- [x] `verify:gzdraw-wasm` (E1M1 spawn native ≡ WASM GZDRAW)
- [x] Gold-standard tree (68 × `gzdoom.gzstate` + `ref.png`)
- [x] Native import oracle 68/68

## Legacy (not Step 2 gates)

- [x] WASM Federated UI option — **debug only**; TS WebGL draw, not GZDoom WASM
- [x] Modular stage snapshots Classic↔WASM BSP (`npm run test:modular`) — compares TS paths, not gold

See [RETRACE.md](./RETRACE.md) for prompt order recovery.
