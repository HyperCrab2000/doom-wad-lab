# Four-Step Plan — GZDoom Gold Standard → Modular Renderer

**Rule:** Never advance a step without the previous step’s gate green. Every split/modularization must re-run parity gates.

## Step 1 — 100% WAD lump/data parity (both IWADs)

**Status: CLOSED**

| Gate | Command |
|---|---|
| WAD data (5 tiers × 68 maps) | `WAD_DATA_PARITY_REQUIRED=1 npm run test:wad-data` |
| GZSTATE export vs GZDoom dump | `GZRENDER_CORPUS_REQUIRED=1 npm run test:corpus` |

Proves: parsed lump bytes, encode round-trip, GZSTATE export/wire round-trip incl. REJECT + BLOCKMAP.

## Step 2 — GZDoom AS-IS renderer ≡ browser WASM renderer (all levels)

**Status: IN PROGRESS**

Gold standard = **native GZDoom** frames + GZSTATE at spawn (`-gzrender_only`).

**Parity rule:** Every gate compares **browser output vs native GZDoom gold** (`ref.png`, `.gzdraw`, GZSTATE dump).  
Classic WebGL, Path Trace, and WASM Federated (TS draw) are **debug/legacy only** — never the pass/fail bar.

| Artifact | Path |
|---|---|
| Per-map GZSTATE + ref PNG | `artifacts/gzrender-v2/gold-standard/<IWAD>/<MAP>/` |
| GZDoom WASM binary | `public/wasm/gzdoom/gzdoom.wasm` + `gzdoom.js` |
| Headless oracle host | `gzdoom-oracle.html` (Puppeteer / CI capture) |
| **Level Viewer host (required)** | `LevelViewer` → **GZDoom WASM (gold)** — same `runGzdoomMap` path as oracle |

### Step 2 sub-phases

| Sub | Deliverable | Gate | Status |
|-----|-------------|------|--------|
| **2a** | Gold tree + native import oracle | `import-oracle:corpus:all`, `test:corpus` | **Closed** (68/68) |
| **2b** | Build + headless WASM capture | `build:gzdoom-wasm`, `test:gzdoom-wasm-prereqs` | **Closed** |
| **2c** | Headless frame corpus vs gold | [phase-2c-breakdown.md](./phase-2c-breakdown.md) | **Open — 32/68 strict** |
| **2c-0** | Capture + eval infra | `build:gzdoom-wasm`, `gzdoom-wasm:corpus:eval:all` | **Closed** |
| **2c-a** | Micro colormap (8 maps, 1–2 px) | `fix:2c:a` | **Open** → target 40/68 |
| **2c-b** | Edge pixels (14 maps, ≤32 px) | `fix:2c:b` | **Open** → target 54/68 |
| **2c-c** | Horizon (8 maps, 33–200 px) | `fix:2c:c` | **Open** → target 62/68 |
| **2c-d** | Outdoor vistas (6 maps, 200+ px) | `fix:2c:d` | **Open** → target 68/68 |
| **2c-z** | Full strict gate | `gzdoom-wasm:corpus:all:strict` | **Blocked** on a–d |
| **2d** | Tier 2 GZDRAW (view-probe grid) | `verify:gzdraw-wasm`, `gzdraw-corpus:spawn-all` | **Closed** (spawn probe 68/68); full multi-probe grid optional |
| **2e** | **Level Viewer uses real GZDoom WASM** | Play + Gold subviews, MEMFS ref frame | **Closed** |

**Why 2e was missing from the written plan:** Step 2 automation was scoped to `gzdoom-oracle.html` + npm/Puppeteer gates early in the retrace (2026-06). In parallel, Phase 4–5 work added **WASM Federated** to the Level Viewer — a GZSTATE-validating stub + Classic TS WebGL draw — so the UI had a “WASM” option before real `gzdoom.wasm` pixels were wired. That path was documented as *prep*, but the plan never added an explicit **“replace Level Viewer WASM with GZDoom gold renderer”** sub-step, which is why the dropdown still shows broken TS draw while oracle gates pass.

| Gate | Command |
|---|---|
| Native import oracle (68 maps) | `npm run import-oracle:corpus:all` |
| Materialize gold-standard tree | `npm run gold-standard:materialize` |
| Build GZDoom WASM | `npm run build:gzdoom-wasm` |
| WASM vs gold frame (headless) | `npm run test:gzdoom-wasm-frame` |
| WASM frame corpus (68 maps) | `npm run gzdoom-wasm:corpus:all` |
| WASM frame corpus (strict native only) | `npm run gzdoom-wasm:corpus:all:strict` |
| WASM prerequisites only | `npm run test:gzdoom-wasm-prereqs` |
| Tier 2 GZDRAW spawn smoke | `npm run verify:gzdraw-wasm` |
| Tier 2 GZDRAW spawn (68 maps) | `npm run gzdraw-corpus:spawn-all` |
| Tier 2 GZDRAW full probe grid | `npm run gzdraw-corpus -- --wasm` |
| **Level Viewer GZDoom WASM (2e)** | TBD — `?renderer=gzdoom-wasm` + on-load diff vs gold |

**Tier 2 gate (Wave 1 spec):** For each probe in the [view-probe grid](./view-probe-grid.md), native GZDoom `-gzdraw_dump` ≡ browser GZDoom WASM at 0 byte diff on every [GZDRAW v1](./gzdraw-v1.md) section.

**Target:** For every map in DOOM.WAD + DOOM2.WAD, browser GZDoom WASM frame ≡ gold-standard `ref.png` at 0% playfield diff — in **CI and in the Level Viewer**.

**Not the gate:** hand-ported Classic WebGL / federated TS draw path — label as legacy in UI until 2e ships.

## Step 3 — Fork stripped renderer; never drift from gold standard

**Status: BLOCKED on Step 2**

1. Fork `gzdoom-project` renderer path (HW draw + gzstate import) into `gzrender-oracle/` or keep in fork with `-DGZRENDER_STRIP=ON`.
2. Strip: gameplay tick, network, ZScript runtime, audio backends, GTK/Cocoa, Vulkan.
3. Keep: WAD/PK3 load, `P_SetupLevel`, gzstate dump/import, HW renderer, `-gzrender_only`.
4. **Every strip commit** must pass Step 2 gate (WASM frame ≡ gold standard).

| Gate | Command |
|---|---|
| Strip diff vs full GZDoom | `npm run test:gzdoom-strip-parity` (TBD) |

## Step 4 — Iterative modularization (parity-preserving)

**Status: PARTIAL infrastructure only**

Modularize only after Step 3 strip is stable. Each module boundary gets its own parity gate.

| Phase | Split | Gate |
|---|---|---|
| 4a | GZSTATE wire read/write (`gzrender-core`) | Step 1 wire tier |
| 4b | Map setup / lump rebuild | Step 1 tier 3–4 |
| 4c | BSP + draw list generation | Step 2 spawn snapshot |
| 4d | HW / WebGL submit | Step 2 frame diff |
| 4e | Game engine (tick, actors, scripts) | Separate `doom-gzengine-core` — **not** renderer gate |

Existing modular stages (`modularRenderStage.ts`, 11 stages) remain useful for **debugging** Classic WebGL until GZDoom WASM replaces it.

**Hard rule:** `GZRENDER_MODULAR_PARITY_REQUIRED=1 npm run test:modular` must stay green after each 4c/4d split.

## Execution order (never skip)

```
Step 1 WAD data → Step 2 GZDoom WASM frames → Step 3 strip fork → Step 4 modular splits
                      ↑__________________________________________|
                           re-run after every change
```
