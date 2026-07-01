# GZRender-V2 Retrace Log

**Last updated:** 2026-06-17

This document records where the project diverged from the charter pipeline and the order of recovery.

## Canonical pipeline (project charter)

```txt
1. GZDoom exports post-load GZSTATE          ✅ DONE
2. Import renderer loads GZSTATE + renders   ⚠️ IN PROGRESS (Stage 2)
3. Frame diff vs GZDoom reference            ⚠️ IN PROGRESS (harness built)
4. NodeJS exporter matches GZSTATE           ✅ DONE (68/68 maps)
5. Corpus state parity                       ✅ DONE
6. WASM browser renderer (native first)      ❌ SKIPPED AHEAD — stub only
7. Full modular render parity Classic↔WASM   ❌ PREMATURE — same draw path
```

## Where we lost track

| Step | Prompt / intent | What happened | Status now |
|------|-----------------|---------------|------------|
| **Stage 1** | GZSTATE dump + E1M1 ref PNG | Completed; GZDoom fork works | ✅ Closed |
| **Stage 2** | Import renderer + frame parity | **Skipped** — no diff tool, no WAD Lab capture, ref PNG wrong resolution | ⚠️ Harness restored this session |
| **Stage 4** (early) | 100% WAD lump export parity | Completed in `@hypercrab2000/doom-wad-core`; 68-map corpus | ✅ Closed |
| **Stage 5** (early) | WASM federated UI | Built 278-byte WASM stub; draws via Classic `drawScene` | ⚠️ UI works; not independent |
| **Stage 6** (early) | Modular WASM clone + massive tests | Added stage snapshots + BSP parity tests; not pixel parity | ⚠️ Partial |

**Root cause:** Stage 2 (frame parity gate on E1M1) was never closed. Later prompts (WASM clone, modular parity) were implemented on top of Classic WebGL without an independent render path, so "100% parity" claims were structurally impossible.

## Recovery order (strict)

Work prompts in this order; do not skip ahead until the gate passes:

### Gate A — Stage 2 frame parity harness (this session)

- [x] Fix `capture-gzdoom-ref-frame.sh` (`+vid_hidpi 0`, `-windowed`)
- [x] `tools/gzrender-v2/diff-frame.ts` — playfield diff normalized to 320×168
- [x] `tools/gzrender-v2/capture-wadlab-ref-frame.mts` — Classic WebGL capture
- [x] `src/wad/parity/frame/e1m1FrameParity.test.ts`
- [ ] Capture WAD Lab E1M1 frame + run diff (baseline mismatch % recorded)
- [ ] Close E1M1 pixel gap OR document failure class in parity-gap-tracker

### Gate B — E1M1 frame parity (hard)

```bash
npm run dev   # terminal 1
npm run capture:wadlab-frame E1M1
npm run diff:frame artifacts/gzrender-v2/gzdoom/E1M1.png artifacts/gzrender-v2/wadlab/E1M1.png
GZFRAME_PARITY_REQUIRED=1 npm run test:frame
```

### Gate C — Frame corpus (68 maps)

Only after Gate B is green on E1M1.

### Gate D — WASM independent draw

Only after Classic achieves frame parity vs GZDoom. WASM must not call `drawScene()`.

### Gate E — Classic ↔ WASM modular parity (meaningful)

Only after Gate D; current tests prove shared BSP state, not independent renderers.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test:corpus` | GZSTATE 68-map state parity |
| `npm run test:modular` | Classic vs WASM BSP @ spawn (delegated draw) |
| `npm run test:frame` | E1M1 frame diff (soft unless `GZFRAME_PARITY_REQUIRED=1`) |
| `npm run capture:gzdoom-frame` | GZDoom reference PNG + gzstate |
| `npm run capture:wadlab-frame` | WAD Lab Classic capture (needs dev server) |
| `npm run diff:frame` | Compare two PNGs |
