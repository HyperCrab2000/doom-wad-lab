# 03 — Map Lumps

Map data in a Doom WAD is a contiguous group of named lumps following a map header (`E1M1`, `MAP01`, …). This chapter catalogs every map lump with **byte-accurate record layouts** for classic and extended (BEHAVIOR) formats, tied to extractors in `loadWad.ts`.

← [02 — Loading Phases](./02-loading-phases.md) | [TOC](./README.md) | Next: [04 — Patches & Textures](./04-graphics-patches-textures.md)

---

## Map lump overview

```mermaid
flowchart LR
  HDR[Map header E1M1] --> T[THINGS]
  T --> L[LINEDEFS]
  L --> SD[SIDEDEFS]
  SD --> V[VERTEXES]
  V --> SG[SEGS]
  SG --> SS[SSECTORS]
  SS --> N[NODES]
  N --> SC[SECTORS]
  SC --> RJ[REJECT]
  RJ --> BM[BLOCKMAP]
  BM --> BH[BEHAVIOR optional]
```

| Lump | Classic purpose | Parsed by doom-wad-core |
|------|-----------------|-------------------------|
| THINGS | Actor placements | `extractThings()` |
| LINEDEFS | Line segments + specials | `extractLinedefs()` |
| SIDEDEFS | Wall textures per side | `extractSidedefs()` |
| VERTEXES | 2D points | `extractVertexes()` |
| SEGS | BSP segments | `extractSegments()` |
| SSECTORS | BSP leaves | `extractSSectors()` |
| NODES | BSP tree | `extractNodes()` |
| SECTORS | Floor/ceiling volumes | `extractSectors()` |
| REJECT | Sector visibility matrix | raw (unused in parse switch) |
| BLOCKMAP | Spatial line index | `parseBlockmapFromArrayBuffer()` |
| BEHAVIOR | Hexen map format flag | sets global `isExtended` |

Stock Doom II maps use classic sizes and omit BEHAVIOR.

---

## VERTEXES — 4 bytes per vertex

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `x` |
| 2 | 2 | int16 | `y` |

Map units: 1 unit = 1/65536 of a full circle for angles elsewhere; positions are signed int16 (−32768…32767).

Record count: `lumpSize / 4`.

Extractor: `extractVertexes()` — reads until buffer exhausted.

```129:139:/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/parser/loadWad.ts
function extractVertexes(lumpDataReader: ByteReader) {
  const vertexes = new Array<Vertex>();
  while (lumpDataReader.hasMore()) {
    vertexes.push({
      x: lumpDataReader.readInt16(),
      y: lumpDataReader.readInt16(),
    });
  }
  return vertexes;
}
```

---

## LINEDEFS — 14 bytes (classic) / 16 bytes (extended)

### Classic format (Doom / Doom II)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `v1` — start vertex index |
| 2 | 2 | int16 | `v2` — end vertex index |
| 4 | 2 | uint16 | `flags` — bitfield (see [08](./08-switches-textures-linedefs.md)) |
| 6 | 2 | int16 | `special` — line special type (0 = none) |
| 8 | 2 | int16 | `tag` — sector tag for actions |
| 10 | 2 | int16 | `sidenum[0]` — front sidedef, or −1 |
| 12 | 2 | int16 | `sidenum[1]` — back sidedef, or −1 |

Record count: `lumpSize / 14`.

### Extended format (BEHAVIOR present in WAD)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `v1` |
| 2 | 2 | int16 | `v2` |
| 4 | 2 | uint16 | `flags` — includes activation bits |
| 6 | 1 | uint8 | `special` |
| 7 | 1 | uint8 | `arg1` |
| 8 | 1 | uint8 | `arg2` |
| 9 | 1 | uint8 | `arg3` |
| 10 | 1 | uint8 | `arg4` |
| 11 | 1 | uint8 | `arg5` |
| 12 | 2 | int16 | `sidenum[0]` |
| 14 | 2 | int16 | `sidenum[1]` |

Record count: `lumpSize / 16`.

Extended flags decode additional activation modes in `extractLinedefs()` (bits 9–15). See [08-linedef flags](./08-switches-textures-linedefs.md).

---

## SIDEDEFS — 30 bytes per sidedef

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `xOffset` — horizontal texture offset |
| 2 | 2 | int16 | `yOffset` — vertical texture offset |
| 4 | 8 | char[8] | `topTexture` — upper wall (``-`` = none) |
| 12 | 8 | char[8] | `bottomTexture` — lower wall |
| 20 | 8 | char[8] | `midTexture` — one-sided or pass-through |
| 28 | 2 | int16 | `sector` — index into SECTORS |

Record count: `lumpSize / 30`.

Texture names reference entries in TEXTURE1/2. The sentinel string `-` means no texture on that tier.

---

## SECTORS — 26 bytes per sector

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `floorheight` |
| 2 | 2 | int16 | `ceilingheight` |
| 4 | 8 | char[8] | `floorpic` — flat name |
| 12 | 8 | char[8] | `ceilingpic` — flat or `F_SKY` |
| 20 | 2 | int16 | `lightlevel` — 0…255 |
| 22 | 2 | int16 | `type` — sector special |
| 24 | 2 | int16 | `tag` — sector tag |

Record count: `lumpSize / 26`.

Parser also sets `lightIntensity = lightlevel / 255` for renderer heuristics.

Sector types (damage, secret, scroller) are documented in [10-sectors-things-bsp.md](./10-sectors-things-bsp.md).

---

## THINGS — 10 bytes (classic) / 20 bytes (extended)

### Classic

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `x` |
| 2 | 2 | int16 | `y` |
| 4 | 2 | int16 | `angle` — 0…359 degrees |
| 6 | 2 | int16 | `type` — thing type (Doom ednum) |
| 8 | 2 | uint16 | `flags` — spawn flags |

Record count: `lumpSize / 10`.

### Extended

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `thingId` (tid) |
| 2 | 2 | int16 | `x` |
| 4 | 2 | int16 | `y` |
| 6 | 2 | int16 | `startHeight` (z) |
| 8 | 2 | int16 | `angle` |
| 10 | 2 | int16 | `type` |
| 12 | 2 | uint16 | `flags` |
| 14 | 1 | uint8 | `action` |
| 15 | 1 | uint8 | `arg1` |
| 16 | 1 | uint8 | `arg2` |
| 17 | 1 | uint8 | `arg3` |
| 18 | 1 | uint8 | `arg4` |
| 19 | 1 | uint8 | `arg5` |

Record count: `lumpSize / 20`.

Thing flags parsing: `/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/parser/thingFlags.ts`.

---

## SEGS — 12 bytes per seg

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `v1` — start vertex |
| 2 | 2 | int16 | `v2` — end vertex |
| 4 | 2 | int16 | `angle` — BAM angle along line |
| 6 | 2 | int16 | `linedef` — parent linedef index |
| 8 | 2 | int16 | `side` — 0=front, 1=back |
| 10 | 2 | int16 | `offset` — distance along linedef |

Record count: `lumpSize / 12`.

Segs are precomputed subdivisions of linedefs for BSP rendering.

---

## SSECTORS — 4 bytes per subsector

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `numsegs` |
| 2 | 2 | int16 | `firstseg` — index into SEGS |

Record count: `lumpSize / 4`.

Subsectors are convex BSP leaves — the smallest drawable region.

---

## NODES — 28 bytes per node

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `x` — partition line origin |
| 2 | 2 | int16 | `y` |
| 4 | 2 | int16 | `dx` — partition direction |
| 6 | 2 | int16 | `dy` |
| 8 | 8 | int16[4] | `bbox[0]` — right child bounding box [top, bottom, left, right] |
| 16 | 8 | int16[4] | `bbox[1]` — left child bounding box |
| 24 | 2 | int16 | `children[0]` |
| 26 | 2 | int16 | `children[1]` |

Record count: `lumpSize / 28`.

### Child index encoding

| Raw value | Meaning |
|-----------|---------|
| 0…32767 | Index of child **node** |
| 32768…65535 | Subsector index = `raw & 0x7FFF` (high bit set) |

GZSTATE export widens the flag to `0x80000000` — see `nodeChildToGzstate()` in `encodeDoomFormats.ts`.

---

## REJECT — variable size matrix

Purpose: precomputed **sector-to-sector visibility** for AI line-of-sight optimization.

Size formula (classic):

```
numSectors = SECTORS lump size / 26
rejectBytes = ceil(numSectors² / 8)
```

Layout: row-major bit matrix. Bit (i,j) = 1 means sector i **cannot** see sector j (reject pass).

doom-wad-core does not parse REJECT into structures; raw bytes are kept on the map for GZSTATE export (`mapReject` section).

---

## BLOCKMAP — variable size grid

Purpose: uniform grid hashing linedefs for collision and item pickup queries.

### Header — 8 bytes

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | int16 | `x` — grid origin X |
| 2 | 2 | int16 | `y` — grid origin Y |
| 4 | 2 | int16 | `columns` |
| 6 | 2 | int16 | `rows` |

Followed by `columns × rows` uint16 **blocklist offsets** (indices into the blocklist, not byte offsets).

### Block lists

Each block is a uint16 array of linedef indices terminated by `0xFFFF`.

Parser: `/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/parser/parseBlockmap.ts`.

Grid cell world size: **128×128** map units (fixed in engine, not stored in lump).

---

## BEHAVIOR — extended map marker

When present as a map lump (and anywhere in WAD for the global flag):

- Sets `isExtended = true` for THINGS/LINEDEFS parsing.
- Payload contains Hexen-format behavior version and ACS data.

Stock 68-map corpus: **no BEHAVIOR lumps**.

---

## Record size summary table

| Lump | Bytes/record (classic) | Bytes/record (extended) |
|------|---------------------|------------------------|
| VERTEXES | 4 | 4 |
| LINEDEFS | 14 | 16 |
| SIDEDEFS | 30 | 30 |
| SECTORS | 26 | 26 |
| THINGS | 10 | 20 |
| SEGS | 12 | 12 |
| SSECTORS | 4 | 4 |
| NODES | 28 | 28 |
| REJECT | ⌈n²/8⌉ total | same |
| BLOCKMAP | variable | variable |

---

## Validation identities

For a well-formed classic map, these relationships should hold (GZDoom rebuild may differ slightly on nodes/segs but stock IWADs are self-consistent):

```
∀ linedef: sidenum[0] != -1  (every line has a front side)
∀ sidedef: 0 <= sector < numSectors
∀ seg: 0 <= linedef < numLinedefs
∀ ssector: firstseg + numsegs <= numSegs
```

doom-wad-core does not enforce these at parse time — downstream geometry code may throw or produce empty meshes.

---

## WadMap TypeScript shape

```typescript
// doom-wad-core/src/types/WadMap.ts
interface WadMap {
  THINGS: Thing[];
  VERTEXES: Vertex[];
  LINEDEFS: LineDef[];
  SIDEDEFS: SideDef[];
  SECTORS: Sector[];
  SEGS?: Segment[];
  SSECTORS?: SSector[];
  NODES?: Node[];
  REJECT?: ArrayBuffer;
  BLOCKMAP?: BlockMap;
  BLOCKMAP_RAW?: ArrayBuffer;
  BEHAVIOR?: ArrayBuffer;
}
```

---

## External references

| Resource | URL |
|----------|-----|
| Doom Wiki — Map lump | https://doomwiki.org/wiki/Map_lump |
| Unofficial Spec — Level format | https://doomwiki.org/wiki/Unofficial_Doom_Specification |
| SEGS/NODES | https://doomwiki.org/wiki/node |

---

## Code index

| File | Role |
|------|------|
| `doom-wad-core/src/parser/loadWad.ts` | All map extractors |
| `doom-wad-core/src/parser/parseBlockmap.ts` | BLOCKMAP parser |
| `doom-wad-core/src/parser/thingFlags.ts` | THINGS flag decode |
| `doom-wad-core/src/types/WadMap.ts` | Map interface |
| `doom-wad-core/src/export/buildMapSections.ts` | GZSTATE map export |

---

← [02 — Loading Phases](./02-loading-phases.md) | [TOC](./README.md) | Next: [04 — Patches & Textures](./04-graphics-patches-textures.md)
