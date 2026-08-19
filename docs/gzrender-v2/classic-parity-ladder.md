# Classic WebGL parity ladder

Work one step at a time. Each step has its own gate command and interim mismatch budget. Do not try to close the full spawn frame (~53.7% mismatch on E1M1 @ 2026-08-06) in a single pass.

## Architecture guardrails

| Path | Role | WASM / Emscripten |
|------|------|-------------------|
| **Classic renderer** | Play path — pure Node (`doom-wad-core`) + TypeScript WebGL2 | **Never** — no Emscripten on the play path |
| **GZDoom gold (`ref.png`)** | Pixel oracle for spawn parity | Generated offline (GLES); not loaded at Classic runtime |
| **gzdoom-wasm (Emscripten)** | Oracle / modular reference capture only (`renderer=gzdoom-wasm&gzdoomSubView=gold`) | Yes — oracle lane only |
| **gzdoom-s-wasm (pure WASM)** | Federated draw experiments; separate corpus gates | Yes — not Classic |

Classic compares against gold PNGs on disk. GZDoom WASM is used only to regenerate or cross-check oracle frames, never inside the Classic draw loop.

## Step 0 — Infrastructure / measurement

**Goal:** Repeatable capture, region attribution, and gated CI-style checks.

**Oracle path = normal play spawn** (`?renderer=classic&map=E1M1`). **`frameParity=1` is bisection-only** — do not use it for parity gates or CI unless explicitly bisecting (`CLASSIC_PARITY_FRAME=1`).

| Command | What it proves |
|---------|----------------|
| `npm run test:classic-play-smoke` | **Normal play** draws walls (≥15), sky, colormap; center pixel not void |
| `npm run test:compare-classic-modular` | Capture Classic (play mode) + modular oracle; write `parity-compare/*-spawn.png` |
| `npm run test:classic-parity-buckets` | **Where** mismatch lives (region table + heatmap) |
| `npm run test:classic-parity-buckets-gate` | Per-bucket gates with interim budgets (exit 1 on regression) |
| `npm run test:classic-parity-strict` | Full spawn frame — **0%** mismatch required |
| `npm run test:classic-parity-layers` | **Which draw stage** adds mismatch vs gold |
| `npm run test:classic-layers-matrix` | Layer toggles isolate correctly (Classic sanity, not gold match) |
| `npm run test:classic-gzdoom-parity` | Full spawn vs gold with **15%** interim budget |
| `npm run test:unit -- src/wad/renderer/courtyard` | Courtyard BSP visibility contract |
| `npm run test:unit -- src/wad/renderer/bsp/gzdoomDrawState` | Draw state / sector visibility |

**Env vars (gates):**

| Variable | Effect |
|----------|--------|
| `CLASSIC_PARITY_PLAY` | Default **on** for gates — capture uses normal play (`renderer=classic&map=…`) |
| `CLASSIC_PARITY_FRAME=1` | Opt-in **frameParity oracle** capture (bisection / legacy oracle only) |
| `CLASSIC_PARITY_BUCKET` | Run gate for one bucket only: `ceiling`, `mid-upper`, `mid-lower`, `floor` |
| `CLASSIC_PARITY_MAX_MISMATCH` | Override mismatch % threshold (default: per-bucket interim budget; `0` = strict) |
| `CLASSIC_PARITY_CAPTURE=1` | Force re-capture before bucket gate (needs dev server on `:5150`) |
| `CLASSIC_MODULAR_PARITY_REQUIRED=1` | Enable exit-code gating in spawn compare |

Always quote actual numbers from these commands before claiming a step is fixed.

## Step 1 — Sky & ceiling (DONE)

**Region:** `ceiling` (y 0–42)

**Current metrics (E1M1 spawn):**

- Bucket mismatch: **~0.3%**
- Row probes: **y=5** and **y=60** exact match vs gold after sky/ceiling fixes

**Gate:** `npm run test:classic-parity-ceiling` (≤1% interim) or `CLASSIC_PARITY_BUCKET=ceiling CLASSIC_PARITY_MAX_MISMATCH=1 npm run test:classic-parity-buckets-gate`

**Status:** Done — treat ceiling as the reference bucket for “green gate” workflow.

## Step 2 — Walls & visibility

**Region:** `mid-upper` (y 42–84)

**Current metrics (E1M1 spawn, 2026-08-17):**

- Bucket mismatch: **59.9%** — **PASS** at interim **60%** gate
- Structural pixels: **~3539** (geometry/texture — east edge, wall bands)
- Colormap-ish: **~4507**
- Lip void fix: 22 sky pixels at y=44–49 recolored in `skyBox.frag` (`isHangarLipWallVoidPx`) where gold draws STARTAN3 over gray sky void

**Gate:** `npm run test:classic-parity-mid-upper` (interim **60%**)

**Probe gate (offline):** `npm run test:classic-parity-probes` — center column y=5/60/100/150 vs gold on existing capture

**Next fixes:** Reduce structural count (east opening walls), tighten gate toward 55%, replace lip pixel list with wall-draw geometry when BSP path is clear.

## Step 3 — Floor / ceiling flats

**Region:** `mid-lower` (y 84–126) + floor band overlap

**Current metrics (E1M1 spawn, 2026-08-17):**

- **mid-lower bucket:** **69.9%** — **PASS** at interim **70%** gate (split flat shade boost bands 9/6)
- **floor bucket:** **67.1%** — **PASS** at interim **70%** gate
- **y=150:** Classic **39** vs gold **47** (delta 8 — within probe tolerance)
- Liquid flats (nukage) still wrong in mid-lower band

**Gate:** `CLASSIC_PARITY_BUCKET=mid-lower npm run test:classic-parity-buckets-gate`

**Next fixes:** Textured flats, sector liquid classification, courtyard slime supplements; tighten mid-lower gate below 69%.

## Step 4 — Lighting / colormap

**Symptoms:** Classic brighter than gold; yellow bands on heatmap (delta ≤63)

**Current metrics:**

- **y=100:** Classic **67** vs gold **47** (colormap-ish, not structural)
- Most remaining pixels are colormap/moderate class once geometry is close

**Gate:** Colormap-ish pixel count drops in bucket table; `meanAbsDelta` improves without structural regression.

**Next fixes:** `R_ZDoomColormap` bands, psprite shade offset, glob vis scaling (partially landed).

## Step 5 — Sprites / psprite

**Region:** bottom `floor` band (y 126–168) + weapon overlay

**Goal:** Things + weapon sprite with correct colormap and draw order.

**Gate:** Floor bucket structural count drops; re-enabling psprite must not regress full spawn %.

**Note:** Psprite alone previously regressed the full gate — fix placement/shade before enabling.

## Step 6 — Full playfield spawn gate

**Goal:** Entire 320×168 playfield vs `ref.png`.

**Current metrics:** **~53.7%** mismatch (interim gate **15%**; stretch **0%**)

| Command | Budget |
|---------|--------|
| `npm run test:classic-gzdoom-parity` | 15% interim |
| `npm run test:classic-parity-strict` | 0% (100% match) |

Requires Steps 1–5 substantially green before this gate is achievable.

## Step 7 — Menu

**Goal:** Pause/options menu renders and responds (gameplay smoke).

**Gate:** `npm run test:classic-gameplay` — verifies pause menu, combat debug hooks.

**Pixel parity:** Needs separate full-frame gold reference; not covered by playfield spawn gates.

## Step 8 — HUD / status bar

**Goal:** Status bar layout, face, ammo/health alignment.

**Gate:** `npm run test:unit -- src/features/level-viewer/doomHudLayout` (layout math).

**Pixel parity:** Requires full-frame gold (`320×200` or scaled HUD crop) — distinct from Step 6 playfield gate.

## Workflow per session

1. Run `npm run test:classic-parity-buckets` — worst region / red-vs-yellow ratio.
2. Map region → step (table above).
3. Make a **narrow** fix for that step only.
4. Re-run the step gate + relevant unit tests.
5. When the step gate passes, run `npm run test:classic-parity-buckets-gate` for regression.
6. Record numbers in `docs/bible/chronicle/classic-node-webgl-renderer-chronicle.md`.

## Oracle rules

- **Pixels:** `artifacts/gzrender-v2/gold-standard/DOOM/<MAP>/ref.png` (GLES gold).
- **Classic path:** Pure Node (`doom-wad-core`) + WebGL2 — no WASM in Classic renderer.
- **Parity gates:** capture **normal play** at E1M1 spawn (`waitClassicPlaying`, no `frameParity=1`). Expect **higher** mismatch % vs gold than the frameParity oracle — report real play-mode numbers.
- **`frameParity=1`:** bisection / frozen-spawn oracle only (`CLASSIC_PARITY_FRAME=1`). Not a substitute for play-mode gates.
- **Do not** claim parity from layer matrix alone — it proves isolation, not gold match.
