# GZRender-V2 Status

**Last updated:** 2026-07-06 (release log added — see [RELEASES.md](../RELEASES.md))

## Current Phase

**Stage 2 — Import renderer + frame parity (restored after retrace).**

Stage 1 and Stage 4 (GZSTATE corpus) are closed. We skipped Stage 2 and jumped to WASM/modular work; recovery is underway.

## Where we failed

1. **Stage 2 never closed** — no frame diff harness, no WAD Lab capture, no E1M1 pixel gate.
2. **WASM built too early** — 278-byte stub delegates all drawing to Classic WebGL.
3. **Browser regression** — modular snapshot work imported `node:crypto` into `drawScene` (fixed 2026-06-17).

## Current Parity

| Check | Status |
|-------|--------|
| GZSTATE read (E1M1 counts) | Pass |
| GZSTATE corpus 68 maps | Pass (`npm run test:corpus`) |
| Classic ↔ WASM BSP @ spawn | Pass (`npm run test:modular`) — trivial while WASM delegates |
| E1M1 frame harness | Pass (soft test) |
| E1M1 frame pixels vs GZDoom | **Open** — run `npm run diff:frame` |
| WASM independent render | Not started |

## Next Actions

1. Drive E1M1 frame mismatch to zero (or classify gaps in parity-gap-tracker).
2. Scaffold native import renderer in `renderer-v2/`.
3. Do **not** expand WASM until Classic frame parity closes on E1M1.

## Commands

```bash
npm run test:corpus      # 68-map GZSTATE parity
npm run test:modular     # BSP stage parity (delegated WASM)
npm run test:frame       # E1M1 frame diff (soft)
npm run capture:gzdoom-frame
npm run dev              # then: npm run capture:wadlab-frame E1M1
npm run diff:frame artifacts/gzrender-v2/gzdoom/E1M1.png artifacts/gzrender-v2/wadlab/E1M1.png
```
