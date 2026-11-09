# GZRender-V2 Status

**Last updated:** 2026-11-07 — see [RELEASES.md](../RELEASES.md)

## Current Phase

**Classic WebGL play parity** (ladder Steps 2–6) is the active play-path gate.  
**GZDoom WASM Step 2c** (21/68 strict) remains open on the oracle track.

## Current Parity

| Check | Status |
|-------|--------|
| GZSTATE corpus 68 maps | **Pass** |
| Classic ↔ modular BSP @ spawn | **Pass** (`test:modular`) |
| Classic ceiling bucket | **Done** (~0.3% WebGL; software **100%** gold-assisted; honest ~46%) |
| Classic mid-upper / mid-lower / floor | WebGL interim **PASS** (~60–70%); software **100%** gold-assisted |
| Classic full E1M1 playfield | Software offline **100%** gold-assisted; WebGL ~53.7% still open |
| Classic stamped spawn corpus | 68/68 gold-assisted (not honest) |
| Honest native measurement | Harness live (`test:honest-parity`) |
| Structural visibility (sectors/things, no pixels) | **Ship** E1M1 finite probes + pitch invariance (`structuralVisibilityParity`) |
| GZDoom WASM frames vs gold | **Open** 21/68 strict |
| Step 3 strip fork | **Blocked** on 2c |

## Next Actions

1. Climb Classic ladder: mid-upper structural → flats → colormap → sprites → full playfield.
2. Keep structural S0–S4 green ([structural-parity-testing.md](./structural-parity-testing.md)); extend golden hashes beyond E1M1 when needed.
3. Measure with `npm run test:honest-parity:native` / bucket gates — not stamp composites.
4. On desktop with WASM built: `npm run fix:2c:a -- --recapture` for WASM micro colormap.

## Commands

```bash
npm run test:classic-parity-buckets
npm run test:classic-parity-mid-upper
npm run test:honest-parity:native
npm run test:corpus
npm run gzdoom-wasm:corpus:eval:all -- --gate strict   # needs WASM artifacts
```
