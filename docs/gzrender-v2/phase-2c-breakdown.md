# Phase 2c — Frame Corpus Breakdown

**Parent:** Step 2 in [four-step-plan.md](./four-step-plan.md)  
**Gate (final):** `npm run gzdoom-wasm:corpus:all:strict` → **68/68 maps, 0 px** vs native `ref.png`  
**Current:** **21/68 strict** (2026-06-24 recapture on latest WASM; was **32/68** before `frameDiff.ts` nearest-neighbor resize fix inflated the count)

Phase 2c is split into **infrastructure (done)** plus **four fix waves (open)**, ordered easy → hard. Each wave has its own map list, fix location, verify command, and strict-count target.

---

## Scoreboard

| Sub-phase | Maps | Strict target | Status |
|-----------|------|---------------|--------|
| **2c-0** Infra | 68 | capture + eval works | **Done** |
| **2c-a** Micro colormap | 8 | 21 → **29**/68 | **Open** (T1 **2/8** after colormap + depth-clamp batch) |
| **2c-b** Edge pixels | 14 | 40 → **54**/68 | **Open** (blocked on 2c-a likely) |
| **2c-c** Horizon | 8 | 54 → **62**/68 | **Open** |
| **2c-d** Outdoor vistas | 6 | 62 → **68**/68 | **Open** (hardest) |
| **2c-z** Full gate | 68 | CI strict green | **Blocked** on a–d |

Eval only (no recapture): `npm run gzdoom-wasm:corpus:eval:all -- --gate strict`

---

## 2c-0 — Infrastructure (done)

**Proves:** headless WASM can capture every map and diff against gold on disk.

| Item | Command / path |
|------|----------------|
| WASM build | `npm run build:gzdoom-wasm` |
| Per-map capture | `tools/gzrender-v2/capture-gzdoom-wasm-frame.mts` |
| Corpus on disk | `artifacts/gzrender-v2/gzdoom-wasm-corpus/<IWAD>/<MAP>/wasm.png` |
| Gold refs | `artifacts/gzrender-v2/gold-standard/<IWAD>/<MAP>/ref.png` |
| Fast eval | `npm run gzdoom-wasm:corpus:eval:all` |
| Tier batch fix | `npm run fix:2c:t1` … `fix:2c:t4` |
| MEMFS / stdio tolerance | `src/gzdoom-oracle/gzdoomWasmHost.ts` |

**Baseline strict pass (21 maps):** DOOM 9/36 + DOOM2 12/32 — `E1M2 E1M8 E2M3 E2M4 E2M5 E3M4 E3M6 E4M1 E4M4` / `MAP02 MAP04 MAP07 MAP08 MAP10 MAP12 MAP14 MAP16 MAP18 MAP22 MAP24 MAP28`. Use **E1M2**, **MAP02** as zero-diff references when debugging wasmGl.

---

## 2c-a — Micro colormap speck (T1)

**Gap:** 1–2 mismatched pixels; typical Δ8 gray (`ref 19,19,19` vs `wasm 11,11,11`).  
**Root cause:** wasmGl colormap band in `gzdoom-project` (`gles_shader.cpp`, `gles_colormap_lut.cpp`) — not capture timing, not viewer.  
**Fix in:** `gzdoom-project` → rebuild WASM → recapture.

### Maps (8)

| Map | Δpx (2026-06-24 recapture) |
|-----|-----------------|
| E2M1 | 8 |
| E2M3 | **0** ✓ |
| E2M4 | **0** ✓ |
| E2M6 | 2 |
| E3M3 | 6 |
| MAP03 | 3 |
| MAP17 | 4 |
| MAP32 | 9 |

### Verify

```bash
npm run build:gzdoom-wasm
npm run fix:2c:a -- --recapture   # alias: fix:2c:t1
```

**Done when:** 8/8 strict (0 px). Strict total **40/68**.

### Debug hint

```bash
npx tsx tools/gzrender-v2/list-mismatch-pixels.mts \
  artifacts/gzrender-v2/gold-standard/DOOM/E2M1/ref.png \
  artifacts/gzrender-v2/gzdoom-wasm-corpus/DOOM/E2M1/wasm.png
```

Compare probe output on **E1M2** (pass) vs **E2M1** (fail) using `-gzrender_probe` in oracle capture.

---

## 2c-b — Edge pixels (T2)

**Gap:** 3–32 px; weapon columns, horizon specks, similar colormap family to T1.  
**Likely fix:** same wasmGl work as 2c-a; re-eval after 2c-a before deep per-map tuning.

### Maps (14)

| Map | Δpx |
|-----|-----|
| E1M1 | 16 |
| E1M3 | 13 |
| E1M7 | 25 |
| E2M2 | 20 |
| E2M9 | 24 |
| E3M1 | 12 |
| E3M2 | 15 |
| E3M9 | 12 |
| E4M5 | 30 |
| E4M7 | 23 |
| MAP01 | 22 |
| MAP05 | 3 |
| MAP09 | 26 |
| MAP31 | 32 |

### Verify

```bash
npm run fix:2c:b -- --recapture   # alias: fix:2c:t2
```

**Done when:** 14/14 strict. Strict total **54/68**.

---

## 2c-c — Horizon / medium outdoor (T3)

**Gap:** 33–200 px; horizon row (~y≈98), medium vistas.  
**Fix in:** wasmGl fog/horizon shaders, viewport letterbox, ref-frame warmup (keep at **3** frames — 16 broke MAP32).

### Maps (8)

| Map | Δpx |
|-----|-----|
| E2M8 | 97 |
| E4M2 | 91 |
| E4M8 | 152 |
| E4M9 | 168 |
| MAP21 | 191 |
| MAP23 | 40 |
| MAP25 | 124 |
| MAP26 | 160 |

### Verify

```bash
npm run fix:2c:c -- --recapture   # alias: fix:2c:t3
```

**Done when:** 8/8 strict. Strict total **62/68**.

---

## 2c-d — Large outdoor vistas (T4)

**Gap:** 200+ px; browser WebGL2 outdoor fog/colormap ≠ native GLES gold.  
**Hardest wave.** May require multiple shader iterations or a **documented exception** if native parity is provably unreachable in browser GL (wasm-gold bandaid is **not** a substitute for closing 2c-z unless explicitly accepted).

### Maps (6)

| Map | Δpx |
|-----|-----|
| E1M6 | 885 |
| E3M5 | 250 |
| E4M3 | 218 |
| MAP19 | 259 |
| MAP20 | 219 |
| MAP30 | 346 |

### Verify

```bash
npm run fix:2c:d -- --recapture   # alias: fix:2c:t4
```

**Done when:** 6/6 strict **or** explicit decision recorded in [task-board.md](./task-board.md) if a map is permanently browser-GL-limited (with `ref-wasm.png` + native gap note).

---

## 2c-z — Close the gate

**Single exit criterion for Step 2c:**

```bash
npm run gzdoom-wasm:corpus:all:strict
# → DOOM 36/36 + DOOM2 32/32 strict, exit 0
```

Then update `four-step-plan.md` and `task-board.md`: **2c Closed (68/68 strict)**.

**Not part of 2c:** Classic WebGL Play, WASM Federated, Path Trace — debug/legacy only ([four-step-plan.md](./four-step-plan.md)).

---

## Quick reference — npm scripts

| Script | Wave |
|--------|------|
| `npm run fix:2c:a` / `fix:2c:t1` | 2c-a |
| `npm run fix:2c:b` / `fix:2c:t2` | 2c-b |
| `npm run fix:2c:c` / `fix:2c:t3` | 2c-c |
| `npm run fix:2c:d` / `fix:2c:t4` | 2c-d |
| `npm run gzdoom-wasm:corpus:eval:all -- --gate strict` | Full eval |
| `npm run gzdoom-wasm:corpus:all:strict` | 2c-z gate |

Add `--recapture` to any `fix:2c:*` to refresh `wasm.png` from oracle before diff.
