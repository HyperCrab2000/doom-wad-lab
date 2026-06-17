# WAD Parity Module

Modular boundary for **WAD Lab parser ↔ GZDoom** lump, map, and palette-raster parity.

Designed to be extractable as a standalone library later; lives under `src/wad/parity/` for now.

## Responsibilities

- Export WAD Lab parsed state to GZSTATE v1 (`exportWadLabToGzstate`)
- Compare against GZDoom `-dumpgzstate` output (`runFullParity`)
- Headless PLAYPAL rasterization for patches, flats, sprites, and composed wall textures
- Encode Doom classic map formats for deterministic diffing

## Sections compared

| Section | Source |
|---------|--------|
| LUMP_CATALOG | Unique IWAD lumps (first directory entry): name, size, CRC32, category |
| PNAMES / TEXTURE_DEFS | Texture tables (TEXTURE1 + TEXTURE2) |
| FLAT / SPRITE / MUSIC / SOUND names | Marker-range and category inventories |
| PATCH / FLAT / SPRITE / TEXTURE rasters | CRC32 of RGBA8888 after PLAYPAL decode |
| Map geometry | Raw map lumps (vertices → things) |

## Usage

```typescript
import { exportWadLabToGzstate, runFullParity } from '@/wad/parity';
import { readGzstate } from '../../gzstate';

const wadLabDoc = exportWadLabToGzstate(wad, 'E1M1');
const gzdoomDoc = readGzstate(gzdoomBytes);
const result = runFullParity(wadLabDoc, gzdoomDoc);
```

## Tests

- `src/wad/parity/parity.test.ts` — DOOM.WAD/E1M1 and DOOM2.WAD/MAP01 integration vs GZDoom fixtures
- `src/wad/parity/corpus.parity.test.ts` — **68 maps** (`npm run test:corpus`)
- `src/wad/parity/raster/raster.test.ts` — palette raster unit tests
- `src/wad/renderer/modular/modularStageParity.test.ts` — modular stages (`npm run test:modular`)
- `src/wad/renderer/bsp/vanilla/vanillaBspParity.test.ts` — BSP invariants

Full reference: [docs/TESTING.md](../../docs/TESTING.md)

Regenerate GZDoom fixtures after changing `gzdoom-project/src/gzstate_dump.cpp`:

```bash
tools/gzrender-v2/dump-gzdoom-state.sh public/wads/DOOM.WAD E1M1
tools/gzrender-v2/dump-gzdoom-state.sh public/wads/DOOM2.WAD MAP01
```
