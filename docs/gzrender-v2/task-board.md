# GZRender-V2 Task Board

**Last updated:** 2026-11-07 — scoreboard canonical in [RELEASES.md](../RELEASES.md)

## Active — Classic WebGL ladder (play path)

See [classic-parity-ladder.md](./classic-parity-ladder.md).

| Step | Region | Status |
|------|--------|--------|
| 0 Infra / measurement | buckets + honest capture | [x] Done |
| 1 Sky / ceiling | ceiling bucket | [x] Done (~0.3%) |
| 2 Walls / visibility | mid-upper | [ ] Interim PASS @ 60%; tighten |
| 3 Flats | mid-lower + floor | [ ] Interim PASS @ 70%; tighten |
| 4 Lighting / colormap | heatmap yellow | [ ] Open |
| 5 Sprites / psprite | floor band | [ ] Open |
| 6 Full playfield | 320×168 spawn | [ ] Open ~53.7% |
| 7 Menu | gameplay smoke | [x] Partial |
| 8 HUD | layout math | [x] Partial |

## Parallel — Step 2 (GZDoom WASM ≡ gold)

**2c frame corpus:** **21/68 strict** (2026-06-24)

| Sub | Status |
|-----|--------|
| 2c-0 Infra | [x] Done |
| 2c-a Micro colormap (8) | [ ] Open |
| 2c-b Edge pixels (14) | [ ] Open |
| 2c-c Horizon (8) | [ ] Open |
| 2c-d Outdoor (6) | [ ] Open |
| 2c-z Full gate 68/68 | [ ] Blocked |
| 2d GZDRAW spawn | [x] Done 68/68 |
| 2e Level Viewer gold host | [x] Done |

## Done — oracle / data

- [x] GZSTATE + WAD data 68/68
- [x] Native import oracle 68/68
- [x] Honest vs stamped capture separation (2026-08-21)
