# GZRender-V2 Tools

CLI and harness scripts for GZRender-V2 parity work.

## GZDoom build (read errors here)

macOS `/bin/bash` is **3.2** — scripts here avoid bash 4 features.

```bash
# Full build with logs (never pipes through tail)
tools/gzrender-v2/build-gzdoom.sh

# Logs on failure:
#   artifacts/gzrender-v2/logs/build-gzdoom.log
#   artifacts/gzrender-v2/logs/build-gzdoom-pk3.log
```

`ninja gzdoom` alone is **not enough**. You also need pk3 archives beside the binary:

- `gzdoom.pk3` (must include `shaders/glsl/main.vp` — 692 files, not 41)
- `game_support.pk3`, etc.

The pk3 builder runs `zipdir -f` and verifies shader lumps exist.

## GZSTATE dump

```bash
tools/gzrender-v2/dump-gzdoom-state.sh public/wads/DOOM.WAD E1M1
```

Log: `artifacts/gzrender-v2/logs/dump-E1M1.log`

## Reference frame capture (state + PNG)

```bash
tools/gzrender-v2/capture-gzdoom-ref-frame.sh public/wads/DOOM.WAD E1M1
```

Outputs:

- `artifacts/gzrender-v2/gzdoom/E1M1.gzstate`
- `artifacts/gzrender-v2/gzdoom/E1M1.png`

Uses `-dumpgzstate` + `-gzstate_refframe` (runs game loop until first rendered frame).

Log: `artifacts/gzrender-v2/logs/capture-E1M1.log`

Map names:

- DOOM1: `E1M1` → `-warp 1 1`
- DOOM2: `MAP02` → `+map MAP02` (not `-warp 1 2`, which stays on MAP01)

## State diff / inspect

```bash
npx tsx tools/gzrender-v2/diff-gzstate.ts artifacts/gzrender-v2/gzdoom/E1M1.gzstate
npx tsx tools/gzrender-v2/diff-gzstate.ts left.gzstate right.gzstate
```

## Corpus parity (all maps)

Compare Node `@hypercrab2000/doom-wad-core` export vs GZDoom dump for every stock map.
With `--static`, also rebuilds IWAD bytes from Node and verifies GZDoom loads that file identically.

```bash
npm run corpus:parity -- public/wads/DOOM.WAD
npm run corpus:parity:static -- public/wads/DOOM.WAD
npm run corpus:parity -- public/wads/DOOM2.WAD
npx tsx tools/gzrender-v2/corpus-parity.mts public/wads/DOOM.WAD --maps E1M1,MAP01 --static
```

Reports: `artifacts/gzrender-v2/corpus/<WAD>/summary.json`

## WASM federated renderer (Level Viewer)

Build the federated WASM host module:

```bash
npm run build:wasm
```

Level Viewer → **Renderer** → **WASM Federated (GZRender)** or `?renderer=wasm-federated`

Module: `public/wasm/gzrender_federated/gzrender_federated.wasm`  
JS orchestration: `src/wad/renderer/gzrender-v2/federated/`

## GZDoom render-only / verify flags

| Flag | Purpose |
|------|---------|
| `-dumpgzstate <path>` | Dump post-load GZSTATE v1 at `P_SetupLevel` |
| `-verifygzstate <path>` | Build GZSTATE in memory and compare to reference (exit 0/1) |
| `-gzrender_only` | Skip gameplay tick (`P_Ticker`); render-only |
| `-gzstate_refframe <png>` | Capture reference frame after warmup |

Example: verify Node-exported state inside GZDoom:

```bash
gzdoom -batchout /dev/null -nosound -iwad DOOM.WAD -warp 1 1 \\
  -verifygzstate node-E1M1.gzstate
```

## Known GZDoom runtime failures (fixed in this repo's workflow)

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find gzdoom.pk3` | pk3 not beside binary | `build-gzdoom-pk3.sh` |
| `Unable to load shaders/glsl/main.vp` | pk3 built without subdirs (broken macOS zipdir) | patched zipdir + `-f` rebuild |
| `Could not find map E1M0` | bad `-warp` parsing (`E1M1` → episode M, map 0) | fixed in `dump-gzdoom-state.sh` |

## GZDoom patch locations (in gzdoom-project)

- `src/gzstate_dump.cpp` — GZSTATE exporter, `-dumpgzstate`, `-gzstate_refframe`
- `src/d_main.cpp` — CLI flags, `D_Display` ref-frame hook
- `tools/zipdir/zipdir.c` — macOS recursive directory scan fix

Mirror copies: `tools/gzrender-v2/gzdoom/`

## Testing

Vitest gates that consume these tools:

| Gate | Command |
|------|---------|
| 68-map GZSTATE | `npm run test:corpus` |
| Corpus generation | `npm run corpus:parity:all` |
| Frame capture | `npm run capture:gzdoom-frame` |

Full documentation: [../../docs/TESTING.md](../../docs/TESTING.md), [../../../docs/TESTING.md](../../../docs/TESTING.md).
