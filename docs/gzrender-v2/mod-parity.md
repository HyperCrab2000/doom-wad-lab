# Mod and plugin parity — scope and limits

## Short answer

**No** — the WASM federated renderer does **not** have 100% parity with GZDoom’s plugin/mod system, and **no** practical harness can exhaustively prove parity against the full GZDoom ecosystem.

What we **can** prove with fixtures:

| Layer | Stock IWAD | PWAD `-file` stack | PK3 / ZScript / runtime plugins |
|-------|------------|-------------------|----------------------------------|
| GZSTATE load parity (68 maps) | ✅ Closed | ⚠️ Fixture-based | ❌ Not in dump |
| BSP / modular stage @ spawn | ✅ (delegated Classic) | ⚠️ Same path if WAD merges | ❌ Runtime-only |
| Frame / pixel parity | ❌ Open (~99% E1M1) | ❌ Not started | ❌ Required for RT/voxel |
| Independent WASM draw | ❌ Stub | ❌ | ❌ |

Raytracing and voxel mods are **rendering/runtime** features. GZDoom’s `-dumpgzstate` export is mostly **IWAD lump catalog + loaded map geometry** — it does **not** encode voxel models, RT lights, ZScript state, or ACS.

## GZDoom source of truth (what `-dumpgzstate` actually captures)

From `tools/gzrender-v2/gzdoom/gzstate_dump.cpp`:

- **Map sections** (vertices, sectors, linedefs, …) — from the **loaded level** after PWAD overrides.
- **Lump catalog, texture/flat/sprite rasters** — **IWAD lumps only** (`IsIwadLumpIndex`). PWAD/PK3 overrides are resolved at runtime but not re-exported as patch lumps in GZSTATE.

So comparing GZSTATE with **VoxelDoom.pk3** or **Lights.pk3** loaded often yields **the same bytes as stock IWAD** for asset sections; visual differences require **frame parity**, not GZSTATE alone.

## What GZDoom supports that we do not (and cannot mirror 1:1 in WASM yet)

- Full **PK3/ZIP** virtual filesystem (nested paths, TEXTMAP, MAPINFO, ZScript)
- **ZScript**, **ACS**, **DECORATE**, **MODELDEF**, **GLDEFS**, **ANIMDEFS**
- **Autoload**, **load order**, **compatibility flags**
- **Hardware RT** path (GZDoom RT mod / `vid_rt`)
- **Voxel Doom** PK3 pipeline (KVX + MODELDEF + thing replacement)
- **Dynamic** map edits, scripts, spawners, pickups

100% exhaustive testing of all community mods is **impossible** (unbounded search space).

## What we implemented (foundation)

### 1. WAD `-file` stack in `@hypercrab2000/doom-wad-core`

```typescript
mergeWads(iwad, ...patches)
loadWadStackFromArrayBuffers([iwadBuf, patchBuf, ...])
```

Last definition wins for named lumps — same merge model as GZDoom appending PWADs.

### 2. Browser loader

`fetchWadStack(iwadPath, patchPaths[])` in `src/wad/loader/fetchWadStack.ts`.

Use query params (see below) or call directly from UI code.

### 3. GZDoom dump with mods

`tools/gzrender-v2/dump-gzdoom-state.sh` reads **`GZDOOM_EXTRA_ARGS`**:

```bash
GZDOOM_EXTRA_ARGS="-file public/mods/foo.wad +viz_voxels 1" \
  tools/gzrender-v2/dump-gzdoom-state.sh public/wads/DOOM.WAD E1M1 out.gzstate
```

### 4. Mod corpus runner

`tools/gzrender-v2/mod-stacks.json` — fixture stacks  
`tools/gzrender-v2/mod-corpus-parity.mts` — Node export vs GZDoom dump per stack/map

```bash
npm run mod:parity              # stock baselines only (patches skip if missing)
MOD_CORPUS_REQUIRED=1 npm run mod:parity -- doom-voxel-mod
```

Place user mods at:

- `public/mods/VoxelDoom.pk3` (GZDoom `-file`; Node stack needs `.wad` until PK3 parser lands)
- `public/mods/Lights.pk3`

### 5. WASM federated path

WASM validates GZSTATE exported from the **merged WAD** in Node/browser — same as stock. No separate plugin VM in WASM.

## Recommended test matrix for voxel + RT mods

| Step | GZDoom | WASM / WAD Lab |
|------|--------|----------------|
| 1 | `-file VoxelDoom.pk3` + `-dumpgzstate` | `fetchWadStack` with PWAD equivalents |
| 2 | Compare GZSTATE (expect often **identical** to stock for asset sections) | Same |
| 3 | `-gzstate_refframe` @ spawn with mod | `capture:wadlab-frame` with `?mods=` |
| 4 | `diff:frame` normalized playfield | Target **0%** mismatch |

Until **Gate B** (E1M1 frame parity stock) is green, mod frame tests will not be meaningful.

## Voxel rendering (Classic + WASM federated)

Both **Classic WebGL** and **wasm-federated** draw voxels through the shared `drawScene` path at modular stage `voxels`. Sprites are skipped when a loaded KVX mesh exists for that thing's sprite.

KVX resolution order:

1. Merged WAD/PWAD lump (`SARGA`, etc.) from `-file` stack
2. `public/voxels/<name>.kvx`
3. `public/mods/voxels/` and paths derived from `?mods=` URLs

VOXELDEF merges bundled Voxel Doom defs with `VOXELDEF` lumps from the loaded WAD stack.

Browser example:

```
?renderer=wasm-federated&mods=/mods/VoxelDoom.pk3
```

Extract KVX files from the PK3 into `public/voxels/` or `public/mods/voxels/` until PK3-in-browser loading lands.


## PK3 status

**Not yet parsed in Node/browser.** GZDoom accepts PK3 via `-file` directly. For Node GZSTATE export of PK3-only content, either:

1. Convert PK3 → PWAD with external tool, or  
2. Wait for PK3 virtual-FS loader in doom-wad-core (planned phase 2).

## Definition of “done” for mod parity (realistic)

1. **Data mods** (PWAD map/texture replacements): GZSTATE parity on fixture stacks in `mod-stacks.json`.
2. **Visual mods** (voxel, RT): frame parity corpus with same `-file` stack on GZDoom and WAD Lab.
3. **Explicit non-goals** documented: ZScript runtime, arbitrary PK3, autoload parity.

## Commands

```bash
cd doom-wad-core && npm run build && npm test
cd doom-wad-lab && npm run test:corpus
npm run mod:parity
npm run test:mod-parity
```
