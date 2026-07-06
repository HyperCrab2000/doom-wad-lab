# Release log — Doom WAD Lab

**Authoritative session record.** Every agent (desktop or cloud) must append an entry here before ending a session that changed code, parity, or docs.

Related: [project-history.md](./project-history.md) (fork lineage), [Chronicle](./bible/chronicle/README.md) (architectural *why*), [four-step-plan.md](./gzrender-v2/four-step-plan.md) (parity gates).

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

Step 2 gate = **browser GZDoom WASM frame ≡ native gold `ref.png`** (`npm run gzdoom-wasm:corpus:all:strict`).

| Gate | Command | Status | Last verified |
|------|---------|--------|---------------|
| Step 1 — WAD data (5 tiers × 68) | `WAD_DATA_PARITY_REQUIRED=1 npm run test:wad-data` | **Closed** 68/68 | 2026-06-17 |
| Step 1 — GZSTATE export | `GZRENDER_CORPUS_REQUIRED=1 npm run test:corpus` | **Closed** 68/68 | 2026-06-17 |
| Step 2a — Native import oracle | `npm run import-oracle:corpus:all` | **Closed** 68/68 | 2026-06-22 |
| Step 2b — WASM build + headless capture | `npm run test:gzdoom-wasm-prereqs` | **Closed** | 2026-06-22 |
| Step 2c — WASM frames vs gold (strict) | `npm run gzdoom-wasm:corpus:all:strict` | **Open** **21/68** | 2026-06-24 |
| Step 2d — GZDRAW spawn probes | `npm run gzdraw-corpus:spawn-all` | **Closed** 68/68 | 2026-06-22 |
| Step 2e — Level Viewer GZDoom WASM host | Play + Gold subviews | **Closed** | 2026-07-01 |
| Classic WebGL E1M1 frame | `GZFRAME_PARITY_REQUIRED=1 npm run test:frame` | **Open** ~99% mismatch | 2026-06-17 |
| Step 3 — Strip fork | blocked on 2c | **Blocked** | — |

**2c sub-waves (all open):** 2c-a micro colormap (8 maps) → 2c-b edge pixels (14) → 2c-c horizon (8) → 2c-d outdoor vistas (6) → 2c-z full gate 68/68. See [phase-2c-breakdown.md](./gzrender-v2/phase-2c-breakdown.md).

---

## Releases (newest first)

| Date | Agent | Shipped | Parity Δ | Refs |
|------|-------|---------|----------|------|
| **2026-07-06** | cloud | Fixed diamond E2E CI: skip GZDoom scenarios when WASM artifacts missing (IWAD alone is insufficient); updated `docs/ci.md` | — (CI/docs) | PR #3 |
| **2026-07-06** | cloud | Added this release log; backfilled entries through Jul 1; linked from docs hub | — (docs only) | `docs/RELEASES.md` |
| **2026-07-04 – 07-06** | — | **No commits pushed.** Desktop agent sessions (if any) did not land on `origin/main`. | **No change** — still **21/68 strict** | — |
| **2026-07-01** | desktop | **PR #2 merged:** Diamond test pyramid (unit + integration + E2E gold/modular/classic/audio/playability); PerfMeter DOM overlay (fps/ms sparkline); 214-file bible expansion (WAD, Classic Layers, GZDoom, Chronicle, per-map deep dives); CI hardening (doom-wad-core clone, coverage gates, Puppeteer/Chrome fixes, optional diamond E2E without commercial IWAD) | Infra/docs/tests only — **2c unchanged** | PR #2, `8599873`…`8c11bdb` |
| **2026-07-01** | desktop | **PR #1 merged:** GZDoom **(s)** modular host; layer drawer UI; gameplay sim parity restored; gzrender-v2 branch integration | **2e closed** (Level Viewer gold WASM host). **2c still open** | PR #1, `950e041`…`28eda72` |
| **2026-06-24** | desktop | Recaptured WASM frame corpus; fixed `frameDiff.ts` nearest-neighbor resize (corrected inflated strict count) | **2c: 32/68 → 21/68 strict** (honest baseline) | [phase-2c-breakdown.md](./gzrender-v2/phase-2c-breakdown.md) |
| **2026-06-22** | desktop | Step 2c infra closed; gold-standard tree materialized; corpus eval scripts; task board sub-phases 2c-a…2c-d defined | **2c: 32/68 strict** (pre-resize-fix count; superseded 2026-06-24) | [task-board.md](./gzrender-v2/task-board.md) |
| **2026-06-17** | desktop | gzrender-v2 pack: federated WAD/mod stack, engine hooks, parity tooling (`corpus-parity`, frame diff harness, `diff-frame.ts`); browser `node:crypto` regression fixed | **Step 1 closed** 68/68; **Stage 2 harness restored**; Classic E1M1 frame baseline **~99% mismatch** recorded | `5938a74`, `6a5888f`, [RETRACE.md](./gzrender-v2/RETRACE.md) |
| **2026-06-12** | desktop | GZDoom BSP visibility pipeline; renderer debug tooling | Pre–Step 2 gates | `f217842` |
| **2026-05-26** | desktop | Gameplay systems, renderer perf, CI smoke test fixes on GHA | N/A (Classic product) | `99c4736`, `d2c5e6f` |
| **2026-05-25** | desktop | Production rebuild: AWS S3 + CloudFront deploy, automap, POM relief, line specials/doors/sky sealing, comprehensive `docs/`, unit + integration tests, deploy gated on console smoke test | N/A | `9088dc7`…`cde8251`, [project-history.md](./project-history.md) |
| **2025-04-21** | human | Voxels work in separate viewer; sprite integration still open (gl-doom-redo pause) | N/A | gl-doom-redo |
| **2025-03-16 – 03-18** | human | Fork Andrew Lowndes doom WebGL → Vite + React 19 + TS; `useDoomLoader` hook; `src/wad/` module layout | N/A | [Chronicle 2025-03-16](./bible/chronicle/decisions/2025-03-16-fork-andrew-lowndes-doom-webgl.md) |

---

## Milestone summary (parity-focused)

```txt
2026-06-17  Step 1 WAD + GZSTATE corpus     CLOSED 68/68
2026-06-22  Step 2a/2b/2d + 2c infra       CLOSED
2026-06-24  Step 2c strict baseline        21/68 (current)
2026-07-01  Step 2e Level Viewer gold WASM CLOSED
2026-07-01  Diamond pyramid + bibles       SHIPPED (no pixel delta)
2026-07-04  Weekend                        NO PUSH
            Step 2c-z (68/68 strict)       STILL OPEN
```

---

## Next expected release (when desktop agent resumes 2c)

Target entry when **2c-a** (micro colormap, 8 maps) closes:

- Rebuild `gzdoom-project` WASM (`gles_shader.cpp`, colormap LUT)
- `npm run fix:2c:a -- --recapture`
- Strict count **21 → 29/68** (per [phase-2c-breakdown.md](./gzrender-v2/phase-2c-breakdown.md))

Verify before logging:

```bash
npm run gzdoom-wasm:corpus:eval:all -- --gate strict
```

---

## See also

- [TESTING.md](./TESTING.md) — how to run parity gates
- [parity-gap-tracker.md](./gzrender-v2/parity-gap-tracker.md) — classified open gaps
- [Chronicle decision log](./bible/chronicle/README.md) — architectural decisions by month
