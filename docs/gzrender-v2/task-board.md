# GZRender-V2 Task Board

**Last updated:** 2026-06-17 (retrace session)

## Active gate — Stage 2 frame parity (E1M1)

- [x] Frame diff tool (`tools/gzrender-v2/diff-frame.ts`)
- [x] WAD Lab capture script (`capture-wadlab-ref-frame.mts`)
- [x] E1M1 frame parity test (soft gate; `GZFRAME_PARITY_REQUIRED=1` for hard)
- [x] Fix browser break: `node:crypto` leak via `drawScene` → split `bspSnapshot.ts`
- [ ] E1M1 playfield pixels match GZDoom reference (currently **open** — run `npm run diff:frame`)
- [ ] Import renderer harness in `renderer-v2/` (native OpenGL; charter order)

## Done — Stage 1

- [x] GZSTATE v1 reader/writer/diff + tests
- [x] GZDoom `-dumpgzstate` + `-gzstate_refframe`
- [x] Build/dump/capture scripts with error logs
- [x] E1M1 GZSTATE + reference PNG artifacts

## Done — Stage 4 (completed ahead of Stage 2)

- [x] `@hypercrab2000/doom-wad-core` GZSTATE export
- [x] **68/68 maps** Node vs GZDoom state parity (`npm run test:corpus`)
- [x] Corpus runner + static WAD verify

## Done — prep for Stage 5 (premature until Stage 2 closes)

- [x] WASM federated UI option (loads; validates GZSTATE)
- [x] Modular stage snapshots + Classic↔WASM BSP tests (`npm run test:modular`)
- [ ] WASM **independent** draw path (must not call Classic `drawScene`)

## Not started

- Stage 3 — strip renderer deps
- Event parity harness
- Frame parity corpus (68 maps)
- Native OpenGL import renderer

## Blocked

- **Stage 5 meaningful parity** blocked on Stage 2 frame gate + independent WASM draw
- **100% clone claim** blocked on frame parity corpus

See [RETRACE.md](./RETRACE.md) for prompt order recovery.
