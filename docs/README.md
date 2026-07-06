# Doom WAD Lab — Documentation

Technical documentation for the browser-based Doom / Doom II level renderer and KVX voxel viewer.

This project is **Doom only**. Yserbius / Twinion work lives in `yserbius_twinion_web` (separate repo).

## Stack at a glance

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-3-6E9F18?logo=vitest&logoColor=white)
![WebGL2](https://img.shields.io/badge/WebGL2-GPU-990000?logo=webgl&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r175-000000?logo=threedotjs&logoColor=white)
![gl-matrix](https://img.shields.io/badge/gl--matrix-3.4-5C4EE5)
![earcut](https://img.shields.io/badge/earcut-3.0-4CAF50)
![SpessaSynth](https://img.shields.io/badge/spessasynth__core-4.3-8B5CF6)
![apl--easy--gl](https://img.shields.io/badge/apl--easy--gl-0.4-FF6B35)

## Complete technical bibles

| Bible | What you will learn |
|-------|---------------------|
| [**Master index — bible/**](./bible/README.md) | Hub for all bibles, gold-standard definition, repo map |
| [**WAD Bible**](./bible/wad/README.md) | IWAD container, every map lump, graphics, palettes, sprites, switches, BSP, GZSTATE export, **68-map catalog** |
| [**GZDoom Renderer Bible**](./bible/gzdoom/README.md) | GZDoom HW/GLES pipeline: level load → BSP → walls/flats/sky/lights/sprites → WASM gold gates |
| [**Classic Layer Bible**](./bible/classic-layers/README.md) | Layers → Node geometry → WebGL2 stages, live toggles, Puppeteer tests, screenshots |
| [**Project Chronicle**](./bible/chronicle/README.md) | Decision diary, 68-map deep dives, architectural *why* |

## Guides

| Topic | What you will learn |
|-------|---------------------|
| [**WAD processing**](./wad-processing.md) | Fetching, validating, parsing IWADs in a worker, map lumps, geometry build, caches |
| [**MUS & music**](./mus-music.md) | Doom MUS format, MUS→MIDI conversion, pitch bends, SoundFont playback, OPL3 path |
| [**Voxels (KVX)**](./voxels.md) | Slab6 KVX format, Voxel Doom catalog, mesh extraction, in-game vs viewer |
| [**Rendering**](./rendering.md) | WebGL2 pipeline vs original Doom software renderer, culling, sky, draw order |
| [**Visual enhancements**](./visual-enhancements.md) | Sector lighting, slime glow, POM relief, voxels, point lights, transitions |
| [**Performance**](./performance.md) | Workers, React patterns, map/WAD caches, preload, level transitions |
| [**Release log**](./RELEASES.md) | Dated shipped work, agent sessions, parity scoreboard (update every session) |
| [**Project history**](./project-history.md) | Fork lineage, `.idea` local history, phased evolution Mar 2025 → present |
| [**Line specials**](./line-specials.md) | Doors, switches, lifts, crushers, teleports, exits — activation and tests |
| [**Game content**](./game-content.md) | Sounds, music, sprites, story text, thing catalog, WAD audit script |
| [**CI/CD**](./ci.md) | GitHub Actions gates, smoke test, IWAD vs synthetic integration |
| [**Testing**](./TESTING.md) | Vitest projects, parity commands, parallelization, env vars |
| [**GZRender-V2**](./gzrender-v2/README.md) | Opt-in GZDoom-derived renderer pipeline (native parity → WASM) |

## Repository layout (high level)

```
src/
  features/level-viewer/   # React UI, WAD loader, music, level transition
  wad/
    loader/              # fetch + validate
    parser/              # WAD lump parsing (worker)
    renderer/            # WebGL game renderer, shaders, geometry
    voxels/              # VOXELDEF catalog + KVX mesh helpers
  components/            # VoxelModelViewer (Three.js)
public/
  wads/                  # IWADs (DOOM.WAD, DOOM2.WAD, test.wad)
  voxels/                # .kvx model files from Voxel Doom
  voxel_heights/         # Optional height maps for POM relief
voxel_doom/              # Bundled Voxel Doom metadata (VOXELDEF, ZScript)
```

## Related

- [Root README](../README.md) — run, deploy, assets
- [Infrastructure](../infra/README.md) — S3, CloudFront, GitHub Actions OIDC
