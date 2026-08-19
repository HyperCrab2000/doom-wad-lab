# Doom WAD Lab

Browser **WebGL2** renderer for classic Doom / Doom II **IWAD** maps, plus a **KVX voxel viewer** for Voxel Doom models.

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/tests-128_passing-6E9F18?logo=vitest&logoColor=white)
![WebGL2](https://img.shields.io/badge/WebGL2-renderer-990000?logo=webgl&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

## Live demo

Production (after infra deploy):

- https://wadlab.computingandtooting.com
- https://wadlab.tootingandcomputing.com

## Quick start

```sh
npm install
npm run dev
```

Open the dev server URL. Two modes:

| Mode | Description |
|------|-------------|
| **Level Viewer** | Load a WAD, pick a map, walk around in WebGL2 |
| **Voxel Viewer** | Preview Voxel Doom `.kvx` models (Three.js) |

## Release packages

Versioned release archives are built from `package.json`:

```sh
npm run package:release
```

The command runs the production build, writes `dist/release.json`, and creates
`releases/doom-wad-lab-v<version>+<sha>.tgz` with a matching `.sha256` file.
GitHub Actions publishes a real GitHub Release with generated notes and those
assets on `v*` tags. GitLab CI publishes a GitLab Release for tags and attaches
the same archive/checksum plus deployment notes.

### Release documentation

Detailed per-version notes live in [**docs/releases/**](./docs/releases/README.md).
Regenerate them any time with:

```sh
npm run release:backfill
```

Before tagging a new version, append an entry to
`tools/release/version-manifest.json`, regenerate docs, then push `vX.Y.Z`.
See `.cursor/rules/release-documentation.mdc` for the full checklist.

## Documentation

**Full technical docs:** [**docs/README.md**](./docs/README.md)

### Complete technical bibles (gold standard)

| Bible | What it covers |
|-------|----------------|
| [**📖 Master index — docs/bible/**](./docs/bible/README.md) | Hub linking both bibles, end-to-end data flow |
| [**WAD Bible**](./docs/bible/wad/README.md) | Every lump: container format, map records, palettes, sprites, switches, line specials, **all 68 stock maps by episode** |
| [**Classic Layer Bible**](./docs/bible/classic-layers/README.md) | Layers panel → Node WebGL2 pipeline, live toggles, per-layer tests |
| [**GZDoom Renderer Bible**](./docs/bible/gzdoom/README.md) | Vertices → BSP → walls → flats → sky → lights → sprites → GLES/WASM gold corpus |
| [**Classic Node/WebGL Renderer Chronicle**](./docs/bible/chronicle/classic-node-webgl-renderer-chronicle.md) | Dated progress log for the difficult pure Classic renderer conversion: verified wins, failed attempts, and remaining gaps |

| Guide | Topic |
|-------|--------|
| [**Testing**](./docs/TESTING.md) | Vitest, parity suites, parallelization, CI checklist |
| [WAD processing](./docs/wad-processing.md) | Parse pipeline, workers, geometry, caches |
| [MUS & music](./docs/mus-music.md) | MUS decode, MIDI conversion, SoundFont playback |
| [Voxels](./docs/voxels.md) | KVX format, VOXELDEF, in-game meshes |
| [Rendering](./docs/rendering.md) | WebGL2 vs original Doom, culling, sky |
| [Visual enhancements](./docs/visual-enhancements.md) | Lighting, slime glow, POM, transitions |
| [Performance](./docs/performance.md) | Workers, React, caching, preload |
| [Project history](./docs/project-history.md) | How the app evolved from gl-doom-redo to production |

## Stack

![Three.js](https://img.shields.io/badge/Three.js-r175-000000?logo=threedotjs&logoColor=white)
![gl-matrix](https://img.shields.io/badge/gl--matrix-3.4-5C4EE5)
![earcut](https://img.shields.io/badge/earcut-3.0-4CAF50)
![SpessaSynth](https://img.shields.io/badge/spessasynth__core-4.3-8B5CF6)
![apl--easy--gl](https://img.shields.io/badge/apl--easy--gl-0.4-FF6B35)
![Matter.js](https://img.shields.io/badge/Matter.js-0.20-FF5722)

| Package | Role |
|---------|------|
| [React 19](https://react.dev/) | UI — level viewer, loaders, transitions |
| [Vite 6](https://vitejs.dev/) | Dev server & production build |
| [apl-easy-gl](https://www.npmjs.com/package/apl-easy-gl) | WebGL2 helpers & shader programs |
| [gl-matrix](https://glmatrix.net/) | Matrices & camera |
| [three](https://threejs.org/) | Voxel Viewer 3D preview |
| [spessasynth_core](https://www.npmjs.com/package/spessasynth_core) | MIDI + SoundFont synthesis |
| [earcut](https://github.com/mapbox/earcut) | Polygon triangulation |
| [Vitest](https://vitest.dev/) | Unit tests |

## Assets

Place files under `public/`:

```text
public/wads/DOOM.WAD
public/wads/DOOM2.WAD
public/wads/test.wad          # bundled smoke-test WAD
public/voxels/SARGA.kvx       # Voxel Doom models (optional)
public/soundfont/TimGM6mb.sf2 # General MIDI SoundFont
```

Voxel metadata is bundled under `voxel_doom/` (VOXELDEF + ZScript). Actual `.kvx` binaries are not in git — copy from a Voxel Doom install.

## Controls (level viewer)

- **WASD** — move
- **Mouse** — look (click to capture)
- **Tab** — automap
- **E / Click** — use
- **Esc** — release mouse

## Deploy

Hosting uses **S3 + CloudFront + WAF** with **GitHub Actions OIDC**. See [infra/README.md](./infra/README.md).

## Checks

```sh
npm run build
npm run test:unit
# Parity (needs IWADs + corpus artifacts):
npm run test:corpus && npm run test:modular
```

See [docs/TESTING.md](./docs/TESTING.md) for the full command reference.

## License

MIT — see [LICENSE](./LICENSE) if present.
