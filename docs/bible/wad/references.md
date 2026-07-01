# References

External specifications, wiki articles, and a repository file index for the WAD Bible.

← [Appendix — Map Catalog](./appendix-map-catalog.md) | [TOC](./README.md)

---

## External specifications

### Primary format references

| Title | URL | Topics |
|-------|-----|--------|
| Unofficial Doom Specification | https://doomwiki.org/wiki/Unofficial_Doom_Specification | WAD header, map lumps, patches, sprites |
| Doom Wiki — WAD | https://doomwiki.org/wiki/WAD | Container overview, tools |
| Doom Wiki — Map lump | https://doomwiki.org/wiki/Map_lump | THINGS, LINEDEFS, … |
| Doom Wiki — Patch | https://doomwiki.org/wiki/Patch | Column post format |
| Doom Wiki — Flat | https://doomwiki.org/wiki/Flat | 64×64 flats |
| Doom Wiki — Sprite | https://doomwiki.org/wiki/Sprite | Naming, rotations |
| Doom Wiki — BSP | https://doomwiki.org/wiki/Binary_space_partitioning | Nodes, segs, subsectors |
| Doom Wiki — REJECT | https://doomwiki.org/wiki/REJECT | Sight matrix |
| Doom Wiki — BLOCKMAP | https://doomwiki.org/wiki/BLOCKMAP | Collision grid |
| Doom Wiki — PLAYPAL | https://doomwiki.org/wiki/PLAYPAL | Palette |
| Doom Wiki — COLORMAP | https://doomwiki.org/wiki/COLORMAP | Lighting bands |
| Doom Wiki — Line type | https://doomwiki.org/wiki/Line_type | Specials catalog |
| MUS format | https://doomwiki.org/wiki/MUS | Music lumps |
| Demo format | https://doomwiki.org/wiki/Demo_format | DEMO lumps |

### Historical / id software

| Title | URL |
|-------|-----|
| PWAD FAQ (Doomworld) | https://www.doomworld.com/classicdoom/info/pwadfaq.php |
| Doom source code (id) | https://github.com/id-Software/DOOM |

### ZDoom / GZDoom extensions

| Title | URL |
|-------|-----|
| ZDoom wiki — WAD | https://zdoom.org/wiki/WAD |
| UDMF spec | https://zdoom.org/wiki/UDMF |

---

## doom-wad-core file index

Base path: `/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/`

### Parser

| File | Description |
|------|-------------|
| `src/parser/loadWad.ts` | Main WAD loader, LoadMode, all extractors |
| `src/parser/parseBlockmap.ts` | BLOCKMAP lump parser |
| `src/parser/thingFlags.ts` | THINGS spawn flag decode |
| `src/byte/ByteReader.ts` | Little-endian binary reader, lump names |
| `src/constants/wadInfo.ts` | flatSize, sky names, animation maps |
| `src/types/Lump.ts` | LumpName enum |
| `src/types/WadMap.ts` | WadMap interface |
| `src/types/LineDef.ts` | LineDef + flags |
| `src/types/Wad.ts` | Top-level Wad object |

### Rasterization

| File | Description |
|------|-------------|
| `src/raster/rasterizePatch.ts` | Patch column → RGBA |
| `src/raster/rasterizeFlat.ts` | 64×64 flat → RGBA |
| `src/raster/rasterizeTexture.ts` | Composite texture → RGBA |

### GZSTATE export

| File | Description |
|------|-------------|
| `src/export/exportToGzstate.ts` | Wad → GzstateDocument |
| `src/export/buildMapSections.ts` | Map geometry sections |
| `src/export/buildAssetSections.ts` | Textures, flats, sprites, music, sounds |
| `src/export/buildRasterDigests.ts` | Asset RGBA hashes |
| `src/export/buildLumpCatalog.ts` | Full lump inventory |
| `src/gzstate/constants.ts` | Magic, section IDs |
| `src/formats/encodeDoomFormats.ts` | Flag encode, node child conversion |

### Catalog

| File | Description |
|------|-------------|
| `src/catalog/collectLumpNames.ts` | Marker range name collection |
| `src/catalog/categorizeLump.ts` | Lump category codes |

---

## doom-wad-lab file index

Base path: `/Users/williamfarmer/IdeaProjects/doom/doom-wad-lab/`

### Loader / parser host

| File | Description |
|------|-------------|
| `src/wad/loader/validateWadBuffer.ts` | Pre-parse WAD validation |
| `src/wad/loader/fetchWad.ts` | HTTP fetch IWAD |
| `src/wad/parser/wadParse.worker.ts` | Worker-side parse |
| `src/wad/parser/parseWadInWorker.ts` | Worker client API |

### Game logic

| File | Description |
|------|-------------|
| `src/wad/game/switchTextures.ts` | SW1↔SW2 texture flip |
| `src/wad/game/lineSpecialRegistry.ts` | LINE_SPECIAL_CATALOG |
| `src/wad/game/mapActionController.ts` | Line activation dispatch |
| `src/wad/constants/LineDefSpecials.ts` | Vanilla special comments |

### Geometry / rendering (classic WebGL)

| File | Description |
|------|-------------|
| `src/wad/renderer/geometry/mapToWalls.ts` | Wall mesh generation |
| `src/wad/renderer/geometry/mapToFlats.ts` | Floor/ceiling meshes |
| `src/wad/renderer/geometry/refreshMapGeometry.ts` | Runtime sector height updates |
| `src/wad/renderer/drawAssets/drawPatch.ts` | Canvas patch draw |
| `src/parser/wad/createSpriteFrame.ts` | Sprite index builder |

### Parity / corpus

| File | Description |
|------|-------------|
| `src/wad/parity/corpus.parity.test.ts` | 68-map GZSTATE gate |
| `src/wad/renderer/bsp/vanilla/bspGoldenSnapshots.json` | BSP draw-order gold |
| `src/wad/renderer/bsp/vanilla/bspGoldenSnapshots.test.ts` | BSP snapshot tests |
| `src/wad/parity/export/exportWadLabToGzstate.ts` | Lab GZSTATE export entry |

### Catalog / assets

| File | Description |
|------|-------------|
| `src/wad/catalog/wadAssetCatalog.ts` | Full WAD inventory builder |
| `src/wad/catalog/thingTypeIndex.ts` | Thing type names |

---

## Documentation cross-links

| Doc | Path |
|-----|------|
| WAD Bible TOC | `docs/bible/wad/README.md` |
| Parent bible index | `docs/bible/README.md` |
| Lab WAD pipeline | `docs/wad-processing.md` |
| Line specials runtime | `docs/line-specials.md` |
| GZSTATE v1 wire format | `docs/gzrender-v2/gzstate-v1.md` |
| Corpus testing | `docs/gzrender-v2/corpus-testing.md` |
| GZDoom WASM gold | `docs/gzrender-v2/wasm-gold-and-modular.md` |

---

## Test commands

| Command | Validates |
|---------|-----------|
| `npm run test:unit` | Parser units, BSP snapshots, game logic |
| `npm run test:corpus` | GZSTATE 68-map parity (needs IWADs + artifacts) |
| `npm run test:modular` | 11 render stages × 68 maps |
| `npm run gzdoom-wasm:corpus:all` | WASM frame vs ref.png |
| `npm run test:wad-data` | 4-tier WAD data parity |

---

## gzdoom-project (oracle)

Base path: `/Users/williamfarmer/IdeaProjects/doom/gzdoom-project/`

| File | Description |
|------|-------------|
| `src/gzstate_dump.cpp` | C++ GZSTATE dumper (parity authority) |
| `src/rendering/hwrenderer/` | Hardware renderer |
| `src/gles/` | GLES / WebGL2 backend |

---

← [Appendix — Map Catalog](./appendix-map-catalog.md) | [TOC](./README.md)
