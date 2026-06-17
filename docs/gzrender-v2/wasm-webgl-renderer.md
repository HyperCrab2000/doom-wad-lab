# WASM / WebGL Renderer — Full Build Log & Architecture

![WebGL2](https://img.shields.io/badge/WebGL2-forward_renderer-990000?logo=webgl&logoColor=white)
![WASM](https://img.shields.io/badge/WASM-federated_host-654FF0?logo=webassembly&logoColor=white)
![GZSTATE](https://img.shields.io/badge/GZSTATE-v1_parity-2ea043)

This document is the **exhaustive record** of how the GZRender-V2 WASM / WebGL path was built, what each modular render section does, how the three browser backends relate, and where parity actually stands today. It matches the tone and structure of [rendering.md](../rendering.md) — tables, pipeline diagrams, file pointers, honest tradeoffs.

If you only read one GZRender doc besides the charter, read this one.

---

## What we were trying to build

The goal (from [project-charter.md](./project-charter.md)) is **not** “a WebGL level viewer that looks like Doom.” The goal is a **GZDoom-derived renderer pipeline** where:

1. GZDoom exports canonical **post-load** state (`GZSTATE`).
2. A renderer imports that state and draws a frame.
3. That frame **pixel-matches** a GZDoom reference capture.
4. NodeJS generates the **same** GZSTATE GZDoom would.
5. A **corpus** of all IWAD maps passes the same gates.
6. Only then: WASM in the browser, federated modules, performance work.

Final architecture target:

```txt
NodeJS WAD Lab Parser
  → GZSTATE
  → GZDoom-derived Renderer Core
  → Native parity
  → WASM browser renderer
  → WebGL2 backend
  → (future) WebGPU / raytracing backend
```

Everything in doom-wad-lab stays **opt-in**. Classic WebGL, path trace, music, voxels, game logic — untouched unless you pick a different backend in the UI.

---

## The three browser render backends

The Level Viewer exposes three backends via `RenderBackend` (`src/wad/renderer/renderBackend.ts`):

| Backend | URL | What it is | GZDoom clone? |
|---------|-----|------------|---------------|
| **`classic`** | default | Full WebGL2 forward HW pipeline (`drawScene.ts`) | Partial — same BSP *draw-order* model, different GPU technique |
| **`wasm-federated`** | `?renderer=wasm-federated` | GZSTATE export → WASM validates → **Classic `drawScene` draws** | No — WASM does not own the GPU path yet |
| **`pathtrace`** | `?renderer=pathtrace` | Experimental GPU/CPU ray tracer (`rtgl/`) | No — research backend, not the parity target |

**GZDoom itself** is the reference oracle (dump tools, `-dumpgzstate`, `-gzstate_refframe`), not something we ship in the browser.

Persistence: `sessionStorage['doom-render-backend']`. URL `?renderer=` wins on load.

---

## Chronology — every major step we actually took

This is the honest timeline, including where we **skipped** steps and had to retrace. See also [RETRACE.md](./RETRACE.md).

### Phase 0 — Bootstrap (GZRender-V2 pack)

- Installed GZRender-V2 Cursor pack: docs tree, ADR infra, `renderer-v2/`, `gzstate/`, `tools/gzrender-v2/`, `artifacts/gzrender-v2/`.
- Branch: `feature/gzrender-v2`.
- Confirmed repos: doom-wad-lab, gzdoom-project fork, IWADs in `public/wads/`.

### Phase 1 — GZDoom can dump state (Stage 1) ✅

| Item | Detail |
|------|--------|
| GZDoom hooks | `-dumpgzstate`, `-gzstate_refframe`, `-verifygzstate`, `-gzrender_only` in fork |
| Scripts | `build-gzdoom.sh`, `build-gzdoom-pk3.sh`, `dump-gzdoom-state.sh`, `capture-gzdoom-ref-frame.sh` |
| TypeScript | `gzstate/` reader, writer, diff |
| First fixture | `artifacts/gzrender-v2/gzdoom/E1M1.gzstate` + `E1M1.png` |
| Pain points fixed | Missing `gzdoom.pk3`, shader paths in pk3, wrong map warp (`+map MAP##` for Doom II), macOS `zipdir` recursion |

**Stage 1 status:** closed for E1M1 dump + reference capture.

### Phase 2 — Node GZSTATE export parity (Stage 4, done early) ✅

We jumped ahead of the charter here (Node export was supposed to follow import renderer), but the work is **real and closed**:

- Extracted export logic into `@hypercrab2000/doom-wad-core`.
- **68/68 maps** (DOOM 36 + DOOM2 32): Node `exportToGzstate` matches GZDoom dump on **20 sections** per map.
- Static WAD re-import path verified (`gzdoom-static.gzstate`).
- Corpus runner: `tools/gzrender-v2/corpus-parity.mts`.
- Test gate: `npm run test:corpus` with `GZRENDER_CORPUS_REQUIRED=1`.

Fixes that mattered: raw linedef flags, uint16 specials, `TrimLumpName` parity, empty texture strings, Doom II map loading.

### Phase 3 — Stage 2 skipped (frame parity) ❌ → restored ⚠️

**What should have happened:** import renderer loads GZSTATE, renders E1M1, PNG diff vs GZDoom.

**What happened:** we went straight to WASM UI and modular tests without a frame diff harness.

**Restored (2026-06-17):**

| Tool | Path |
|------|------|
| GZDoom capture | `tools/gzrender-v2/capture-gzdoom-ref-frame.sh` (`+vid_hidpi 0`, `-windowed`) |
| WAD Lab capture | `tools/gzrender-v2/capture-wadlab-ref-frame.mts` (Classic @ spawn, needs `npm run dev`) |
| Frame diff | `tools/gzrender-v2/diff-frame.ts` (playfield crop → normalize 320×168) |
| Test | `src/wad/parity/frame/e1m1FrameParity.test.ts` (`npm run test:frame`) |

**Measured baseline (E1M1 @ player spawn, 2026-06-17):**

```text
Playfield 320×168 normalized: 99.24% pixel mismatch vs GZDoom
meanAbsDelta 30.53 | maxChannelDelta 200
```

Stage 2 is **not closed**. The harness exists; parity does not.

### Phase 4 — WASM federated UI (premature) ⚠️

Built so the Level Viewer can select **WASM Federated (GZRender)** without console errors:

```txt
Map load
  → doom-wad-core exportToGzstate(wad, mapName)
  → WASM copy + validate_gzstate (magic GZST, version 1)
  → wasm.setCounts(vertices, sectors)
  → drawFederatedWebGl2Frame(params)  →  drawScene(params)   ← same as Classic
```

The WASM module today is **~278 bytes** WAT (`renderer-v2/federated/wasm/gzrender_federated.wat`): init, validate, counts, tick. No draw lists, no WebGL from WASM.

Build: `npm run build:wasm` (runs on `predev` / `prebuild`). Output: `public/wasm/gzrender_federated/gzrender_federated.wasm`.

Rust scaffold: `renderer-v2/gzrender-core/` — GZSTATE header reader only; full `wasm-pack` path reserved for when `cargo` is in CI.

### Phase 5 — Modular pipeline + parity tests ⚠️

Added **11 incremental render stages** (same order as GZDoom HW / `drawScene`), stage caps, snapshot recorder, and tests:

- `modularStageParity.test.ts` — 68 maps × 11 stages @ spawn, Classic vs WASM BSP hash.
- Passes today because **both backends call the same `drawScene`** — structural parity, not independent WASM render parity.

### Phase 6 — Browser regression (fixed)

Modular snapshot work imported `bspSnapshotHash.ts` (Node `crypto`) into `drawScene.ts`. That **broke the entire browser app** in headless Chrome:

```text
Module "node:crypto" has been externalized for browser compatibility
```

**Fix:** split `bspSnapshot.ts` (browser-safe snapshots + hash) from `bspSnapshotHash.ts` (SHA256 for golden fixtures, Node/tests only).

---

## Parity pyramid — what is actually proven

```text
                    ┌─────────────────────────┐
                    │ Frame pixels vs GZDoom  │  ~1%   harness only; 99.24% mismatch E1M1
                    ├─────────────────────────┤
                    │ Classic ↔ WASM render   │  ~5%   same drawScene path
                    ├─────────────────────────┤
                    │ Draw-state / BSP order  │  ~90%  heavily tested
                    ├─────────────────────────┤
                    │ GZSTATE load parity     │  100%  68/68 maps
                    └─────────────────────────┘
```

| Layer | Command | Maps | Status |
|-------|---------|------|--------|
| GZSTATE sections | `npm run test:corpus` | 68 | ✅ Pass (~18s) |
| BSP / vanilla invariants | `vanillaBspParity.test.ts` | 68 + 9000+ sector probes | ✅ Pass (~78s, parallel batches) |
| Modular stage BSP @ spawn | `npm run test:modular` | 68 × 11 stages | ✅ Pass (~3s, snapshot cache) |
| E1M1 frame pixels | `npm run test:frame` | 1 | ⚠️ Soft pass; 99.24% mismatch |
| WASM independent draw | — | 0 | ❌ Not started |

Hard frame gate: `GZFRAME_PARITY_REQUIRED=1 npm run test:frame`.

---

## Classic WebGL — how a frame is drawn

**Entry:** `renderGame.ts` game loop → `drawScene(sceneParams)`.

**Playfield:** `gameViewLayout.ts` — vanilla **320×168** 3D view inside a **320×200** frame (32px status bar slot letterboxed). WebGL viewport via `playfieldCamera.ts`.

### High-level frame order

Same as [rendering.md](../rendering.md), extended with modular debug stages:

```text
 1. clear          chromakey letterbox + depth clear
 2. visibilityWireframe   (debug) BSP linedef wireframe
 3. meshWireframe         (debug) mesh edge overlay
 4. sky            cylindrical skybox, depth = 1.0
 5. flatsUnlit     flat-shaded floors/ceilings (no texture sample)
 6. flats           textured flats (flat.frag, POM, liquid)
 7. wallsUnlit      flat-shaded walls
 8. wallsOpaque     textured opaque + masked mids (walls.frag)
 9. wallsTransparent  alpha-sorted transparent walls (back-to-front)
10. voxels          KVX mesh things
11. sprites         billboard things (back-to-front)
```

**Visibility core:** `buildGzdoomDrawState` (`src/wad/renderer/bsp/gzdoomDrawState.ts`) — subsector-BSP flat order, wall draw order, portal ∩ REJECT filtering. Production flats use **`flatSubsectorOrder` only** (GZDoom `DoSubsector` semantics).

**Wall bands:** `hwWallProcess.ts` / `hwFakeFlat.ts` — port of GZDoom `HWWall::Process`.

**Shaders:** `apl-easy-gl` programs — `flats`, `walls`, `things`, `voxelColor`, `skybox` (see rendering.md table).

---

## The eleven modular sections — exhaustive

Defined in `src/wad/renderer/modular/modularRenderStage.ts`. Order is **canonical** — caps and parity tests assume this sequence.

### Stage index

| # | Stage ID | UI label | Runs in Classic | Runs in WASM today | Primary files |
|---|----------|----------|-----------------|-------------------|---------------|
| 0 | `clear` | Clear viewport | ✅ | ✅ (via drawScene) | `drawScene.ts`, `playfieldCamera.ts` |
| 1 | `visibilityWireframe` | BSP visibility wireframe | ✅ (debug) | ✅ | `drawGzdoomVisibilityWireframe.ts` |
| 2 | `meshWireframe` | Mesh wireframe | ✅ (debug) | ✅ | `drawGzdoomMeshWireframe.ts`, `bspSegWireframe.ts` |
| 3 | `sky` | Skybox | ✅ | ✅ | `drawSkybox.ts`, `skyBox.frag` |
| 4 | `flatsUnlit` | Flats (unlit) | ✅ (cap range) | ✅ | `drawUnlitMesh.ts`, `drawScene.ts` |
| 5 | `flats` | Flats (textured) | ✅ | ✅ | `gzdoomRenderer.ts` → `renderGzdoomFlats` |
| 6 | `wallsUnlit` | Walls (unlit) | ✅ (cap range) | ✅ | `drawUnlitMesh.ts` |
| 7 | `wallsOpaque` | Walls (opaque) | ✅ | ✅ | `gzdoomRenderer.ts` → `renderGzdoomOpaqueWalls` |
| 8 | `wallsTransparent` | Walls (transparent) | ✅ | ✅ | `collectGzdoomTransparentWalls` |
| 9 | `voxels` | Voxels | ✅ | ✅ | `voxelThingMeshes.ts`, `voxelColor.frag` |
| 10 | `sprites` | Sprites (full) | ✅ | ✅ | `things.vert` / `things.frag` |

### Per-stage behavior

#### 0 — `clear`

- Clears full canvas to **chromakey magenta** (`clearPlayfieldChrome`).
- Binds letterboxed playfield viewport for subsequent draws.
- **Snapshot:** empty draw counts; BSP state from `buildGzdoomDrawState` already computed for the frame.

#### 1 — `visibilityWireframe`

- Draws **BSP-visible linedefs** as line primitives — proves angular clipper output without mesh baggage.
- Active when `?ptStage=` caps in wireframe debug range or Path Trace overlay requests it.
- **Does not** use portal-filtered mesh pool — raw visibility lists.

#### 2 — `meshWireframe`

- Draws edges of **pre-baked wall + flat meshes** for geometry in the current draw state.
- Shows the **portal-filtered HW submit pool** (mesh mode vs BSP mode in wireframe toggles).

#### 3 — `sky`

- Full-screen **cylindrical skybox** behind geometry (`drawSkybox`).
- Texture from episode/map rules (`selectSkyTexture.ts`).
- Writes `gl_FragDepth = 1.0` so world geometry occludes sky.
- Skipped when `shouldRenderFullscreenSkybox` false (indoor sectors without sky visibility).

#### 4 — `flatsUnlit`

- Draws floor/ceiling triangles with **flat sector color** only — no texture sample.
- Used in modular cap range between `flatsUnlit` and `flats` for incremental parity debugging.
- Path Trace backend can stop here for GPU surface mask = flats only.

#### 5 — `flats`

- **Production flat path:** only subsectors in `drawState.flatSubsectorOrder`.
- Textured via `flat.frag` — POM, liquid animation, dynamic lights, sector fog.
- `flatDrawMode` is `'subsector-bsp'` in production.

#### 6 — `wallsUnlit`

- Opaque wall quads, flat-shaded — proves wall **coverage** without texture/lighting variables.

#### 7 — `wallsOpaque`

- Textured walls from BSP `wallDrawOrder` — upper/mid/lower bands from `hwWallProcess`.
- Masked mid textures included in opaque pass when appropriate.

#### 8 — `wallsTransparent`

- Collects two-sided middle textures and similar, sorts **back-to-front**, alpha blend.
- Depth mask off during pass; restored after.

#### 9 — `voxels`

- Things with KVX definitions render as **meshes** (`voxelColor` shader).
- Things still loading voxel data increment `voxelThingsPending` (HUD counter).

#### 10 — `sprites`

- Remaining things → **camera-facing billboards** (`things` shader).
- Sorted by distance; `gl_FragDepth` from center column to reduce door jamb leaks.

---

## Stage caps vs layer toggles — two different knobs

Do not confuse them.

### Modular stage cap (`?modStage=` / Render layers panel)

- **Purpose:** run the HW pipeline **only up to stage N** — incremental parity, “what does this section contribute?”
- **Read:** `readRenderModularStageCap()` in `modularRenderStage.ts`.
- **Wired in:** `renderGame.ts` → `sceneParams.modularStageCap`.
- **Aliases:** `?modStage=flats`, `?modStage=walls`, `?modStage=full`, numeric index 0–10.
- **Recording:** when `?modParity=` or `modStage` set, `StageSnapshotRecorder` attaches to `drawScene`.

### Render layer toggles (checkboxes / wireframe radio)

- **Purpose:** Classic + Path Trace **feature** toggles — textures on/off, liquids, courtyard sky lips, wireframe *mode* (BSP vs mesh vs ray sight).
- **File:** `renderLayerToggles.ts` → `buildRenderLayerDrawPlan()`.
- **Storage:** `localStorage['doom-render-layers-v5']`.
- **Not 1:1 with modular stages** — e.g. you can disable `wallTextures` while still running `wallsOpaque` stage (unlit fallback paths).

Path Trace uses **`?ptStage=`** separately (`readModularStageCap()` default for PT backend) to cap GPU ray work vs hybrid overlay.

---

## Stage snapshot system — per-section state machine parity

Added for Classic ↔ WASM iteration **once WASM draws independently**. Today it still records useful data for Classic-only debugging.

### Types (`stageSnapshotTypes.ts`)

Each stage snapshot carries:

| Field | Meaning |
|-------|---------|
| `cameraSectorIndex` / `cameraSubsector` | Where the camera stands in BSP terms |
| `flatDrawMode` | e.g. `subsector-bsp` |
| `drawCounts` | walls, flats, transparentWalls, voxels, sprites, wallSkippedTex |
| `bsp` | frozen lists: flatSubsectorOrder, wallDrawOrder, visibleSectors, … |
| `bspHash` | fast hash of BSP snapshot (`bspSnapshot.ts`, browser-safe) |

Frame snapshot: map of stage → snapshot + `fullHash` over all stages.

### Recorder (`stageSnapshotCollector.ts`)

- Constructed per frame in `renderGame.ts` when `isModularParityMode()` or `modStage` is set.
- `drawScene.ts` calls `recordModularStageBoundary` after each major pass.
- Browser globals:
  - `window.__doomStageSnapshots` — latest frame
  - `window.__doomStageSnapshotHistory` — rolling 120 frames

### Compare (`compareStageSnapshots.ts`)

- Diffs two `ModularFrameSnapshot`s field-by-field.
- Used by `modularStageParity.test.ts` (Node harness @ spawn — no WebGL required).

### Spawn harness (`spawnStageSnapshotHarness.ts`)

- Runs `runProductionMeshDrawState` at player start for all 68 maps.
- Builds snapshots for `'classic-gl'` vs `'wasm-federated'` labels (same BSP today).

---

## WASM federated path — file-by-file

```txt
LevelViewer.tsx
  select renderer wasm-federated
    renderGame.ts
      ensureFederatedWasmModule()
      prewarmFederatedWasmMap(wad, mapName, map)
      drawFederatedWasmSyncFn(sceneParams)
        federatedWasmBackend.ts
          wasm.tick()
          webgl2Backend.ts → drawScene(params)    ← Classic GPU

Parallel load chain:
  stateLoader.ts     exportToGzstate via @hypercrab2000/doom-wad-core
  wasmHost.ts        fetch + instantiate WASM, copy bytes to linear memory
  loadFederatedWasmBackend.ts   lazy dynamic import for Vite chunk
```

### WASM exports (current WAT)

| Export | Role |
|--------|------|
| `init` | Returns 1 on success |
| `validate_gzstate(ptr, len)` | Checks `GZST` magic + version 1 |
| `set_counts(vertices, sectors)` | Stores map stats after validation |
| `clear_state` | Reset between map loads |
| `get_vertex_count` / `get_sector_count` | Debug HUD |
| `is_loaded` | 1 when counts set |
| `tick` | Per-frame hook (placeholder) |

### Planned ABI (from [browser-wasm-plan.md](./browser-wasm-plan.md))

Future Rust core should expose load_state, set_camera, apply_patches, render_frame, event buffer — **minimal JS/WASM boundary crossings**, persistent WASM memory, batched draw commands. WebGL2 backend receives **draw lists**, not per-wall JS calls.

### Federation model ([federation-model.md](./federation-model.md))

Renderer-W2 core renders + emits events. Gameplay AI, quests, audio, HUD stay **outside** WASM. Thing patches (`spawnThing`, `moveThing`, …) feed visual state without merging the whole game engine into the renderer crate.

---

## GZSTATE — the wire format both sides agree on

**Not** raw WAD lumps. Post-load, resolved, diffable. Spec: [gzstate-v1.md](./gzstate-v1.md).

### Parity sections (20)

`STRING_TABLE`, lump catalog, pnames, textureDefs, flat/sprite/music/sound names, patch/flat/sprite/texture rasters, vertices, sectors, sidedefs, linedefs, segs, subsectors, nodes, things.

### Who produces / consumes it

| Producer | Consumer (today) | Consumer (target) |
|----------|------------------|-------------------|
| GZDoom `-dumpgzstate` | corpus diff, fixtures | import renderer |
| Node `exportToGzstate` | corpus diff | WASM `validate_gzstate` → future parse |
| Static WAD re-import | static parity verify | — |

Corpus artifacts per map:

```txt
artifacts/gzrender-v2/corpus/{DOOM,DOOM2}/<MAP>/
  gzdoom.gzstate
  gzdoom-static.gzstate
  node.gzstate
  static.wad
  summary.json (per-IWAD rollup)
```

---

## Frame parity tooling

### Capture GZDoom reference

```bash
npm run capture:gzdoom-frame -- public/wads/DOOM.WAD E1M1
# → artifacts/gzrender-v2/gzdoom/E1M1.gzstate
# → artifacts/gzrender-v2/gzdoom/E1M1.png
```

Flags: `-windowed`, `+vid_fullscreen 0`, `+vid_defwidth 640`, `+vid_defheight 480`, `+vid_hidpi 0`. macOS may still screenshot Retina-sized PNGs — diff tool normalizes.

### Capture WAD Lab Classic

```bash
npm run dev                    # terminal 1 — localhost:5150
npm run capture:wadlab-frame E1M1
# → artifacts/gzrender-v2/wadlab/E1M1.png
```

Headless note: when `.level-viewer--playing` collapses chrome, the capture script forces viewport min-height so canvas is not 1px tall.

### Diff

```bash
npm run diff:frame \
  artifacts/gzrender-v2/gzdoom/E1M1.png \
  artifacts/gzrender-v2/wadlab/E1M1.png
```

Algorithm (`frameDiff.ts`):

1. Crop **playfield** from each image using `doomPlayfieldRegion` (same math as `gameViewLayout`).
2. Resize both crops to **320×168** (nearest).
3. Count per-pixel channel deltas; report mismatch ratio.

---

## Testing — the full matrix

| Suite | File / command | What it proves |
|-------|----------------|----------------|
| GZSTATE corpus | `npm run test:corpus` | 68 maps, 20 sections, static WAD |
| GZSTATE smoke | `parity.test.ts` | E1M1, MAP01 quick |
| Vanilla BSP | `vanillaBspParity.test.ts` | 9172 sector probes, spawn invariants |
| BSP golden | `bspGoldenSnapshots.test.ts` | frozen SHA256 BSP hashes |
| Modular stages | `npm run test:modular` | 68 × 11 Classic vs WASM @ spawn |
| Frame E1M1 | `npm run test:frame` | playfield diff (soft/hard gate) |
| Federated WASM | `federated.test.ts` | WASM load + validate E1M1 bytes |
| Courtyard visibility | `courtyardVisibility.test.ts` | sky island / window leaks |
| Browser smoke | `e1m1-browser-render.integration.test.ts` | canvas not black |

**Do not claim “100% tested clone”** until `GZFRAME_PARITY_REQUIRED=1` passes and WASM draws without delegating to `drawScene`.

**Parallelization & full command reference:** [../TESTING.md](../TESTING.md), [../../../docs/TESTING.md](../../../docs/TESTING.md).

---

## UI — how to use it

1. Open Level Viewer (`npm run dev` → http://localhost:5150/).
2. **Renderer** dropdown:
   - **Classic** — default HW pipeline.
   - **WASM Federated (GZRender)** — GZSTATE + WASM gate + same draw.
   - **Path Trace** — experimental rays.
3. **Render layers** panel:
   - Wireframe mode: off / BSP / mesh / ray sight.
   - Layer checkboxes: textures, liquids, sky, voxels, …
   - **Modular stage cap** radio: Full pipeline → Clear → … → Sprites (`?modStage=`).
4. URL cheatsheet:

| Param | Effect |
|-------|--------|
| `?renderer=wasm-federated` | WASM backend |
| `?renderer=pathtrace` | Path trace backend |
| `?modStage=flats` | Cap Classic/WASM pipeline at flats |
| `?modParity=1` | Enable stage snapshot recording |
| `?ptStage=walls` | Path trace stage cap |

5. DevTools: `window.__doomStageSnapshots`, `window.__doomDrawStats`.

---

## Repository map (renderer-relevant)

```txt
src/wad/renderer/
  renderGame/
    renderGame.ts          game loop, backend switch, snapshot recorder
    drawScene.ts           all 11 modular passes
    playfieldCamera.ts     letterbox viewport
    gameViewLayout.ts      320×168 layout math
  modular/
    modularRenderStage.ts  stage IDs, caps, aliases
    renderLayerToggles.ts  UI feature toggles (parallel model)
    stageSnapshot*.ts      parity snapshots
    spawnStageSnapshotHarness.ts
  gzrender-v2/federated/
    federatedWasmBackend.ts
    wasmHost.ts
    webgl2Backend.ts       → drawScene (temporary)
    stateLoader.ts
  bsp/
    gzdoomDrawState.ts     per-frame visibility + draw orders
    vanilla/bspSnapshot.ts browser-safe BSP snapshots
  renderBackend.ts         classic | pathtrace | wasm-federated

renderer-v2/
  federated/wasm/gzrender_federated.wat
  gzrender-core/            Rust GZSTATE header reader (stub)

tools/gzrender-v2/
  capture-gzdoom-ref-frame.sh
  capture-wadlab-ref-frame.mts
  diff-frame.ts
  corpus-parity.mts
  build-federated-wasm.mjs

docs/gzrender-v2/
  wasm-webgl-renderer.md   ← this file
  RETRACE.md
  parity-gap-tracker.md
  task-board.md
```

---

## What “done” looks like — strict gates

Do not skip again:

```text
Gate A ✅  Frame harness (diff + capture + test)
Gate B ⬜  E1M1 pixels: 99.24% → 0%  (GZFRAME_PARITY_REQUIRED=1)
Gate C ⬜  Frame corpus 68 maps
Gate D ⬜  WASM owns draw (no drawScene delegation)
Gate E ⬜  Modular Classic ↔ WASM parity meaningful
Gate F ⬜  Performance / federated crate split
```

---

## Honest status summary (June 2026)

| Claim | True? |
|-------|-------|
| All IWAD maps GZSTATE match GZDoom | ✅ Yes |
| BSP draw-order matches GZDoom semantics | ✅ Mostly — huge test surface |
| WASM Federated loads without errors | ✅ Yes |
| WASM renders independently | ❌ No — Classic draws |
| Classic pixel-matches GZDoom | ❌ No — 99.24% mismatch E1M1 |
| Modular sections toggleable & snapshotted | ✅ Yes |
| 100% GZDoom clone | ❌ **Not yet** — load-state yes, pixels no |

The fun part is ahead: iterate Gate B until the diff goes green, **then** port each modular section into Rust/WASM draw lists without breaking the stage snapshot tests.

---

## See also

- [rendering.md](../rendering.md) — Classic WebGL deep dive (walls, culling, shaders)
- [project-charter.md](./project-charter.md) — goals and constraints
- [RETRACE.md](./RETRACE.md) — where we diverged and recovery order
- [parity-gap-tracker.md](./parity-gap-tracker.md) — open GAP-* items
- [browser-wasm-plan.md](./browser-wasm-plan.md) — future WASM ABI
- [federation-model.md](./federation-model.md) — renderer vs gameplay split
