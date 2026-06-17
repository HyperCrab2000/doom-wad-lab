# GZRender-V2 Knowledge Base

Durable discoveries only. Chat is temporary; this file is authoritative.

**Last updated:** 2026-06-16 (session 2)

## Known from planning (Cursor pack)

- Goal is **not** to port WAD parsing to WASM; NodeJS/WAD Lab keeps parsing.
- Renderer consumes GZDoom-equivalent **post-load** render state (GZSTATE), not raw lumps.
- GZDoom-generated state is dumped first and round-tripped into a stripped/import renderer **before** Node export.
- Renderer-V2 emits events for sound/music/HUD/world/thing actions but does **not** play audio.
- Enemy AI and Hexen quest logic are federated modules later.
- Sprites are first-class; voxels follow sprite parity using existing voxel parser where possible.
- Native OpenGL parity before WASM/WebGL2.
- WebGPU/raytracing future-proofed via backend abstraction, not built first.

## Known from WAD Lab repo (bootstrap recon)

### Repo layout

- **Parser:** `src/wad/parser/` — WAD lump parsing in worker
- **Existing renderer:** `src/wad/renderer/` — WebGL2 game renderer, BSP, GZDoom draw state emulation
- **GZDoom draw state:** `src/wad/renderer/bsp/gzdoomDrawState.ts` — existing TS port of GZDoom BSP draw ordering (not GZRender-V2)
- **BSP reference tooling:** `tools/bsp-ref/` — chocolate-doom cross-check, GZDoom hw_bsp references
- **IWADs (local, gitignored):** `public/wads/DOOM.WAD`, `DOOM2.WAD`, `test.wad`

### Test commands

```bash
npm run test:unit          # vitest unit project
npm run test:integration   # vitest integration (IWAD tests skip without WADs)
npm run build              # vite production build
```

### CI

- GitHub Actions on PR + main push
- Runner: `ubuntu-latest`, Node 22
- Gates: unit, ≥90% coverage, integration, build, Puppeteer smoke

### GZDoom build/runtime pitfalls (2026-06-16)

- **`ninja gzdoom` is insufficient** — pk3 archives must be built separately and copied beside `gzdoom.app/Contents/MacOS/gzdoom`.
- **macOS `/bin/bash` is 3.2** — no `declare -A`; pk3 script must use plain functions (was causing `gzdoom.pk3: syntax error`).
- **macOS zipdir was broken** — did not recurse subdirs; `gzdoom.pk3` had 41 top-level lumps only → `Unable to load shaders/glsl/main.vp`. Fixed in `gzdoom-project/tools/zipdir/zipdir.c`; full pk3 has **692** files.
- **Bad `-warp` parsing** — `E1M1` parsed as `-warp M 0` → `Could not find map E1M0`. Use regex: episode `${BASH_REMATCH[1]}`, map `${BASH_REMATCH[2]}`.
- **Build/dump logs** — `artifacts/gzrender-v2/logs/build-gzdoom.log`, `build-gzdoom-pk3.log`, `dump-E1M1.log`. Scripts never pipe through `tail`.
- **Commands:** `tools/gzrender-v2/build-gzdoom.sh`, `dump-gzdoom-state.sh`, `capture-gzdoom-ref-frame.sh`

### Bootstrap decisions (2026-06-16)

- Branch: `feature/gzrender-v2`
- First WAD/map: `public/wads/DOOM.WAD` / E1M1
- Corpus: `public/wads/`
- OpenGL 3.3 Core; browser: Chrome/Firefox/Safari latest
- API budget: balanced

### Protection rule

New work only in:

```txt
renderer-v2/
gzstate/
tools/gzrender-v2/
docs/gzrender-v2/
artifacts/gzrender-v2/
```

Do not replace or rewrite `src/wad/renderer/`, parser, or React app by default.

## Discovered during implementation

- GZDoom **E1M1 GZSTATE dump works** (78582 bytes, 537 vertices, 88 sectors, 486 lines) via `dump-gzdoom-state.sh`.
- **Reference frame capture:** `-gzstate_refframe <png>` defers exit until after `D_Display` renders the level; pairs with `-dumpgzstate` in `capture-gzdoom-ref-frame.sh`. Uses `M_ScreenShot` directly (not deferred `G_ScreenShot`).
- **Batchrun fix:** `GZState_HasPendingAutomation()` keeps game loop alive when ref frame pending (replaces `HasPendingDump`).
- Golden fixture test reads real `E1M1.gzstate` in `gzstate/gzstate.test.ts`.
- WAD Lab already has GZDoom BSP **draw-order** parity tooling (`tools/bsp-ref/`) — separate from GZSTATE post-load export.
- GZSTATE v1 TypeScript reader/writer/diff in `gzstate/` with unit tests passing.
- GZDoom exporter: `gzdoom-project/src/gzstate_dump.cpp` (`-dumpgzstate`, `-gzstate_refframe`, `dumpgzstate` CCMD).
- **Open issue:** `+vid_defwidth 640 +vid_defheight 480` may not pin screenshot size; E1M1.png is ~5.9 MB (likely retina/full window).
