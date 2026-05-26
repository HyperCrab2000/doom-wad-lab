# Doom WAD Lab — Documentation

Technical documentation for the browser-based Doom / Doom II level renderer and KVX voxel viewer.

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

## Guides

| Topic | What you will learn |
|-------|---------------------|
| [**WAD processing**](./wad-processing.md) | Fetching, validating, parsing IWADs in a worker, map lumps, geometry build, caches |
| [**MUS & music**](./mus-music.md) | Doom MUS format, MUS→MIDI conversion, pitch bends, SoundFont playback, OPL3 path |
| [**Voxels (KVX)**](./voxels.md) | Slab6 KVX format, Voxel Doom catalog, mesh extraction, in-game vs viewer |
| [**Rendering**](./rendering.md) | WebGL2 pipeline vs original Doom software renderer, culling, sky, draw order |
| [**Visual enhancements**](./visual-enhancements.md) | Sector lighting, slime glow, POM relief, voxels, point lights, transitions |
| [**Performance**](./performance.md) | Workers, React patterns, map/WAD caches, preload, level transitions |
| [**Project history**](./project-history.md) | Fork lineage, `.idea` local history, phased evolution Mar 2025 → present |
| [**Line specials**](./line-specials.md) | Doors, switches, lifts, floors — activation and runtime movers |

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
