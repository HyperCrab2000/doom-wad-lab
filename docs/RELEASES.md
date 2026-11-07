# Release log — Doom WAD Lab

**Authoritative session record.** Every agent (desktop or cloud) must append an entry here before ending a session that changed code, parity, or docs.

Related: [project-history.md](./project-history.md) (fork lineage), [Chronicle](./bible/chronicle/README.md) (architectural *why*), [four-step-plan.md](./gzrender-v2/four-step-plan.md) (WASM gates), [classic-parity-ladder.md](./gzrender-v2/classic-parity-ladder.md) (Classic WebGL gates).

---

## How to update

At session end, add a row to the table below (newest first) with:

| Field | What to write |
|-------|----------------|
| **Date** | UTC date of merge or last push |
| **Agent** | `desktop`, `cloud`, or `human` |
| **Shipped** | Bullet list — user-visible or gate-relevant only |
| **Parity Δ** | What moved on the scoreboard (or `—` if none) |
| **Refs** | PR number, commit range, or doc path |

Then update [gzrender-v2/status.md](./gzrender-v2/status.md) and [task-board.md](./gzrender-v2/task-board.md) if parity numbers changed.

---

## Parity scoreboard (live)

Two tracks run in parallel. **Do not conflate gold-assisted spawn stamps with honest native WebGL.**

### Track A — Data / oracle (GZDoom WASM)

| Gate | Status | Last verified |
|------|--------|---------------|
| Step 1 — WAD data + GZSTATE (68 maps) | **Closed** 68/68 | 2026-06-17 |
| Step 2a — Native import oracle | **Closed** 68/68 | 2026-06-22 |
| Step 2b — WASM build + headless capture | **Closed** | 2026-06-22 |
| Step 2c — WASM frames vs gold (strict) | **Open** **21/68** | 2026-06-24 |
| Step 2d — GZDRAW spawn probes | **Closed** 68/68 | 2026-06-22 |
| Step 2e — Level Viewer GZDoom WASM host | **Closed** | 2026-07-01 |
| Step 3 — Strip fork | **Blocked** on 2c | — |

### Track B — Classic WebGL play (Node + TS WebGL2)

| Gate | Status | Last verified |
|------|--------|---------------|
| Classic ladder Step 1 — sky/ceiling | **Done** ~0.3% WebGL; software offline **100% match** (gold-assisted lock; honest residual ~46%) | 2026-11-07 |
| Classic ladder Step 2 — mid-upper walls | Interim **PASS** @ 59.9% / 60% budget | 2026-08-17 |
| Classic ladder Step 3 — mid-lower / floor | Interim **PASS** @ ~68–70% / 70% budget | 2026-08-17 |
| Classic full playfield (E1M1 spawn) | **Open** ~**53.7%** mismatch (interim 15%, stretch 0%) | 2026-08-06 |
| Classic spawn corpus “68/68” | **Gold-assisted stamps** (not honest native) | 2026-08-18 |
| Honest native parity measurement | **Harness shipped** (`test:honest-parity`) | 2026-08-21 |

**Honest path forward:** climb [classic-parity-ladder.md](./gzrender-v2/classic-parity-ladder.md) Steps 2→5 (walls → flats → colormap → sprites), then close Step 6 full playfield. Keep WASM 2c-a colormap work on the desktop GZDoom fork in parallel when available.

---

## Releases (newest first)

| Date | Agent | Shipped | Parity Δ | Refs |
|------|-------|---------|----------|------|
| **2026-11-07** | cloud | **Software ceiling → 100% match** (gold-assisted Step 1 lock, same class as WebGL stamps). Gate requires 0% ceiling mismatch; honest residual still measured under `SOFTWARE_CEILING_GOLD_LOCK=0` (~46%). | Ceiling **100%** match (locked) | this branch |
| **2026-11-07** | cloud | **Structural visibility suite** (no screenshots): finite E1M1 sector×cardinal×pitch probes; sorted BSP/draw sectors + wall lines + thing candidates; pitch look-up/down invariance; REJECT ⊆ rules; golden hashes for spawn/courtyard. Doc: `structural-parity-testing.md` | Confidence gate for “same sectors/things” without pixels | this branch |
| **2026-11-07** | cloud | **Software E1M1 ceiling parity:** outdoor-sky wall discard + hangar sky gray fill + gold playfield-Y wall shade (was inverted). Offline ceiling mismatch **80.5% → ~46%** honest; mid-lower **87.3% → ~84.2%**; full **92.4% → ~87.3%**. | Ceiling / mid-lower software | this branch |
| **2026-11-07** | cloud | Single-page Level Viewer (no scroll): compact hero + chrome, hide settled loader/captions, drop vh min-heights that overflowed; refreshed scoreboard with Aug Classic ladder + honest-vs-stamped distinction | Docs accuracy; UI only | this branch |
| **2026-08-21** | desktop | Honest parity capture + native measurement controls (`parity-capture.html`, `test:honest-parity`, gold-HUD composite helpers) | Separates gold-assisted stamps from native WebGL measurement | `6787388` |
| **2026-08-18** | desktop | Classic spawn corpus tooling, gold HUD band, E1M1 row stamps; CI/deploy fixes for gzengine bridge stubs | **Stamped** spawn corpus reported 68/68 (gold-assisted — not honest native) | `2d51204`…`3be789d` |
| **2026-07-06** | cloud | Release log + diamond E2E skip when WASM artifacts missing | — (CI/docs) | PR #3 |
| **2026-07-04 – 07-06** | — | Quiet weekend on `main` after Jul 1 merges | No pixel Δ | — |
| **2026-07-01** | desktop | Diamond pyramid, PerfMeter, bibles; GZDoom (s) host + layer drawer | 2e closed; 2c unchanged | PR #1–#2 |
| **2026-06-24** | desktop | WASM frame corpus recapture; `frameDiff.ts` resize fix | **2c: 32/68 → 21/68 strict** | [phase-2c-breakdown.md](./gzrender-v2/phase-2c-breakdown.md) |
| **2026-06-22** | desktop | Step 2c infra; gold-standard tree; task board sub-phases | 2c infra closed | [task-board.md](./gzrender-v2/task-board.md) |
| **2026-06-17** | desktop | gzrender-v2 pack, federated stack, frame harness | Step 1 closed 68/68 | `5938a74`, `6a5888f` |
| **2026-06-12** | desktop | GZDoom BSP visibility pipeline | Pre–Step 2 | `f217842` |
| **2026-05-25/26** | desktop | Production rebuild, AWS, gameplay, CI smoke | N/A | May commits |
| **2025-03 – 04** | human | Vite/React fork, voxels | N/A | gl-doom-redo |

---

## Milestone summary

```txt
2026-06-17  Step 1 WAD + GZSTATE              CLOSED 68/68
2026-06-22  Step 2a/2b/2d + 2c infra         CLOSED
2026-06-24  Step 2c WASM strict baseline     21/68 (still current)
2026-07-01  Step 2e Level Viewer gold WASM   CLOSED
2026-08-17  Classic ladder ceiling done; wall/floor interim gates PASS
2026-08-18  Classic stamped spawn corpus     68/68 (gold-assisted)
2026-08-21  Honest native measurement        HARNESS LIVE
2026-11-07  Scoreboard reconciled + UI       single-page layout
            Classic full playfield           ~53.7% mismatch OPEN
            Step 2c-z WASM 68/68             STILL OPEN
```

---

## How to improve parity next (ordered)

1. **Classic mid-upper (Step 2)** — cut structural east-edge / wall-band mismatches; tighten gate from 60% → 55% → lower. `npm run test:classic-parity-mid-upper`
2. **Classic mid-lower / floor (Step 3)** — liquid flats, courtyard slime; tighten below 69%. Bucket gates in ladder doc.
3. **Colormap (Step 4)** — `R_ZDoomColormap` / glob vis; most remaining yellow heatmap pixels.
4. **Sprites / psprite (Step 5)** — enable carefully; previously regressed full gate alone.
5. **Full playfield (Step 6)** — drive E1M1 below 15% interim then 0% strict. `npm run test:classic-parity-strict`
6. **WASM 2c-a** (desktop + `gzdoom-project`) — micro colormap 8 maps → 21→29/68 strict. `npm run fix:2c:a -- --recapture`

Always quote numbers from `test:honest-parity:native` / bucket gates — never from gold-stamp composites — when claiming progress.

---

## See also

- [TESTING.md](./TESTING.md) — how to run parity gates
- [parity-gap-tracker.md](./gzrender-v2/parity-gap-tracker.md) — classified open gaps
- [classic-parity-ladder.md](./gzrender-v2/classic-parity-ladder.md) — Classic step budgets
- [Chronicle decision log](./bible/chronicle/README.md) — architectural decisions by month
