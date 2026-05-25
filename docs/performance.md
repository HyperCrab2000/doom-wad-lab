# Performance & optimizations

![Vite](https://img.shields.io/badge/Vite-HMR_+_build-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19-concurrent-61DAFB?logo=react&logoColor=white)
![Web Workers](https://img.shields.io/badge/Workers-3_pools-512BD4?logo=webassembly&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-128_tests-6E9F18?logo=vitest&logoColor=white)

The app targets **smooth map loads** and **steady 60 FPS** in browser on large Doom II maps. Optimizations span **Node/build**, **Web Workers**, **GPU caching**, and **React lifecycle** design.

## Architecture overview

```mermaid
flowchart TB
  subgraph main [Main thread]
    R[React UI]
    GL[WebGL drawScene]
    RC[Runtime game state]
  end
  subgraph workers [Web Workers]
    WP[wadParse.worker]
    GW[geometry.worker]
    KW[kvx.worker pool]
  end
  R -->|fetch WAD| WP
  WP -->|Wad| R
  R -->|map select| GW
  GW -->|CPU buffers| GL
  R -->|background| KW
  KW -->|mesh| GL
```

## Node.js & build toolchain

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

| Tool | Role |
|------|------|
| **Vite 6** | Dev server, ESM bundling, `?raw` imports for VOXELDEF/ZScript |
| **vite-plugin-string** | Inline GLSL as strings |
| **TypeScript 5.8** | Path aliases `@/`, strict types for WAD structures |
| **Vitest** | Unit tests under `src/` (128+ tests) |
| **tsx / Puppeteer** | Optional browser scripts in `scripts/` |

### Build outputs

- Workers emitted as separate chunks (`wadParse.worker`, `geometry.worker`, `kvx.worker`)
- Single main bundle (~1.3 MB) — consider code-splitting for future optimization

### CI

**File:** `.github/workflows/ci.yml`

`npm test` + `npm run build` on push/PR.

## Web Workers (never block the UI)

### 1. WAD parse worker

**Files:** `wadParse.worker.ts`, `parseWadInWorker.ts`

- Entire IWAD parse off main thread
- Transferable `ArrayBuffer` ownership

### 2. Geometry worker

**Files:** `geometry.worker.ts`, `geometryWorkerClient.ts`

- `mapToFlats` + `mapToWalls` + sector triangulation
- Main thread only uploads buffers to GPU (`uploadCpuGeometry`)

### 3. KVX worker pool

**Files:** `kvxWorkerPool.ts`, `kvx.worker.ts`

- 2–4 parallel workers
- Job queue with transferable KVX buffers
- Main-thread fallback if pool saturated

## Caching strategy

### WAD cache

**File:** `src/features/level-viewer/wadCache.ts`

```typescript
// In-memory: path → { wad, loadedAt }
```

Switching back to a previously loaded IWAD skips network + parse.

### Map geometry cache

**File:** `src/wad/renderer/renderGame/mapLoadCache.ts`

Key: `` `${wadPath ?? 'memory'}::${mapName}` ``

Cached once per map:

- WebGL textures (walls, flats, things, sky, height maps)
- GPU buffers (walls, flats, things)
- Sector triangle hash + visibility index
- Sprite frame maps

Per load (cheap):

- `structuredClone(map)` for mutable game state
- Relink sector refs, lighting, thing positions

**Revisit MAP17** after first visit: skips ~900ms geometry rebuild.

Failed promises evicted from cache.

### WAD assets cache

**File:** `src/wad/renderer/drawAssets/wadAssetsCache.ts`

Rasterized PLAYPAL patches for a map — avoids re-decoding lumps.

### Height URL miss cache

**File:** `heightTextures.ts` — `clearHeightUrlMissCache()`

Remembers missing `voxel_heights/*.png` URLs to avoid repeated 404 fetches.

### Music MIDI cache

**File:** `musicPreload.ts`

MUS→MIDI conversion cached by `wadPath + lumpName`. Synth preload deferred until Play (expensive).

## React patterns

### `useDoomLoader`

**File:** `src/features/level-viewer/useDoomLoader.ts`

- **Split concerns:** WAD fetch effect vs map load effect
- **Cache hit** short-circuit for WAD
- **Cancellation** flags on async map load
- **Non-blocking music:** soundfont warm-start in parallel; map load does not `await` music
- **`clearCache()`** cascades all subsystem caches

### `useLevelMusic`

- Preloads MIDI on map change
- `playing` flag separate from `enabled` (visualizer only when audio runs)
- Stops track on map/WAD change before starting new preload

### Level transition phases

**File:** `LevelViewer.tsx`

```text
loading → wiping → playing
```

- No 3D render during minimum loading screen (`MIN_LOADING_SCREEN_MS`)
- Single snapshot for melt wipe (no per-frame full-scene re-render)
- `game.setPresentationVisible(false)` during wipe overlay

### Memoization

- `useMemo` for map name lists
- `useCallback` for game loop handlers, automap, cheats
- Refs for cheat buffer, load timestamps (avoid stale closures)

## GPU / draw call optimizations

**File:** `drawScene.ts`

- **Sorted flats** — floors before ceilings (`geometryCache.buildSortedFlats`)
- **Opaque vs transparent wall lists** — pre-split at buffer build
- **Back-to-front** transparent pass only when needed
- **Sector + frustum + distance** cull before draw
- **Portal visibility** reduces overdraw on indoor maps
- **WeakMap** geometry caches for KVX / height generation

## Runtime geometry refresh

**File:** `refreshMapGeometry.ts`

Doors/platforms update only affected sectors — not full map reload.

## Preload & lazy work

| What | When |
|------|------|
| MUS→MIDI | Map selected (background) |
| SoundFont | App start (best-effort) |
| KVX meshes | After map playable (`hydrateVoxelThingMeshes`) |
| Height PNGs | Map load (parallel with buffers) |

## Development scripts

| Script | Purpose |
|--------|---------|
| `scripts/audit-textures.ts` | Texture / height map coverage |
| `scripts/capture-console-errors.ts` | Headless console capture |
| `scripts/test-music-browser.ts` | Music smoke test |
| `scripts/test-door-browser.ts` | Door interaction test |

## Clear cache (user action)

**Clear Cache** button in UI calls:

```typescript
clearWadCache();
clearMapLoadCache();
clearWadAssetsCache();
clearHeightUrlMissCache();
clearMusicPreloadCache();
resetSoundfontEngine(); // if applicable
```

Use after asset updates or music parser fixes.

## Future optimization ideas

- Code-split Three.js (voxel viewer only)
- `OffscreenCanvas` for worker-side GL upload (experimental)
- BSP-based visibility instead of portal flood-fill
- Instanced wall draws for fewer draw calls

See also: [WAD processing](./wad-processing.md), [Rendering](./rendering.md).
