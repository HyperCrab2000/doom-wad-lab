# GZDRAW v1 — HW draw-list wire format

## Purpose

GZDRAW is a **Tier 2 parity oracle**: a binary snapshot of what the GZDoom HW renderer would draw at a fixed camera, after BSP visibility and draw-list construction. It complements **Tier 1 GZSTATE** (post-load map data) and **Tier 3 frame PNGs** (pixels).

GZDRAW is:

- deterministic and diffable section-by-section
- versioned and little-endian
- index-based (no raw pointers)
- keyed to a [view probe](./view-probe-grid.md) (`probeId`, map name, camera pose)
- suitable for corpus-scale native ↔ WASM ↔ federated validation

**Not in scope for v1:** GPU buffer handles, shader uniforms, texture atlas coordinates, or framebuffer pixels.

## Relationship to GZSTATE

| Tier | Artifact | Proves |
|---|---|---|
| 1 | GZSTATE | Post-load WAD/map data parity |
| 2 | GZDRAW | BSP visibility + HW draw-list parity at a probe |
| 3 | PNG frame | Final raster parity |

A GZDRAW dump is always taken **after** GZSTATE import / level setup, at a camera defined by the view-probe grid.

## File layout (mirrors GZSTATE)

```
┌─────────────────────────────────────────┐
│ Header (64 bytes, fixed)                │
├─────────────────────────────────────────┤
│ Section directory (16 bytes × N)        │
├─────────────────────────────────────────┤
│ Section payloads (concatenated)         │
└─────────────────────────────────────────┘
```

### Header (64 bytes, little-endian)

| Offset | Type | Field | Value / notes |
|---|---|---|---|
| 0 | u32 | magic | `0x52445247` (`'GZDR'`) |
| 4 | u32 | version | `1` |
| 8 | u32 | flags | bit0 = payloads include per-section CRC32 in directory (always set in v1 writers) |
| 12 | u32 | headerSize | `64` |
| 16 | u32 | sectionCount | number of section directory entries |
| 20 | u32 | sectionDirectoryOffset | always `64` in v1 |
| 24 | u8[32] | mapName | NUL-padded ASCII (e.g. `E1M1`) |
| 56 | u32 | probeId | view-probe id from [view-probe-grid](./view-probe-grid.md) |
| 60 | u32 | reserved | `0` |

### Section directory entry (16 bytes each)

| Offset | Type | Field |
|---|---|---|
| 0 | u32 | sectionId |
| 4 | u32 | offset | byte offset from start of file |
| 8 | u32 | byteSize | payload length |
| 12 | u32 | crc32 | CRC32/IEEE of payload bytes (`0` if flags bit0 clear) |

Sections appear in **ascending `sectionId` order** in the directory. Payloads are stored contiguously after the directory.

## Section IDs

| ID | Name | Required | Description |
|---|---|---|---|
| 1 | `CAMERA` | yes | Camera pose used for this dump |
| 2 | `VISIBLE_SUBSECTORS` | yes | BSP-visible subsectors in **draw visit order** |
| 3 | `VISIBLE_SECTORS` | yes | Set of visible sector indices |
| 4 | `WALL_DRAWS` | yes | Wall draw entries (one-sided and two-sided) |
| 5 | `SPRITE_DRAWS` | yes | Thing/sprite draw entries |
| 6 | `PORTAL_SNAPSHOT` | yes | Portal clip state at end of traversal |
| 7 | `FLAT_DRAWS` | optional | Flat draw entries (sector/subsector binding); omit when empty |
| 8 | `DRAW_META` | optional | Counters, draw-path flags, engine build tag |

Writers **must** emit sections 1–6. Readers **must** accept unknown section IDs (skip by `byteSize`).

## Section payloads

### 1 — CAMERA

| Field | Type | Notes |
|---|---|---|
| viewX | f32 | Doom map units (east) |
| viewY | f32 | Doom map units (north) |
| viewZ | f32 | Eye height in map units |
| yawDeg | f32 | Horizontal facing in **degrees** (0 = east, 90 = north) |
| pitchDeg | f32 | Vertical pitch in degrees (`0` for classic Doom probes) |
| yawBam | u32 | Same heading in **Doom angle units** (0–65535; `yawDeg × 65536 / 360`, rounded) |

The header `probeId` must match the probe that produced this camera. `yawDeg`/`yawBam` must agree within ±1 BAM unit.

### 2 — VISIBLE_SUBSECTORS

| Field | Type | Notes |
|---|---|---|
| count | u32 | |
| indices | u32 × count | Subsector indices in **exact HW BSP visit order** (see stability rules) |

### 3 — VISIBLE_SECTORS

| Field | Type | Notes |
|---|---|---|
| count | u32 | |
| indices | u32 × count | Unique sector indices, **sorted ascending** |

Derived from visible subsectors (and portal-expanded sectors), not re-sorted by visit order.

### 4 — WALL_DRAWS

| Field | Type | Notes |
|---|---|---|
| count | u32 | |
| entries | wallEntry × count | |

**wallEntry** (16 bytes):

| Field | Type | Notes |
|---|---|---|
| linedefIndex | u32 | Index into map linedefs |
| side | u16 | `0` = front / side0, `1` = back / side1 |
| segIndex | u16 | Seg index if known; `0xFFFF` if not tied to a single seg |
| sortKey | u32 | Stable tie-break within equal depth (writer-defined; must be deterministic) |
| flags | u32 | Reserved v1 (`0`); future: masked, fog, translucency bits |

Wall entries are ordered by **HW draw sort** (depth / seg order), then `sortKey`, then `linedefIndex`, then `side`.

### 5 — SPRITE_DRAWS

| Field | Type | Notes |
|---|---|---|
| count | u32 | |
| entries | spriteEntry × count | |

**spriteEntry** (16 bytes):

| Field | Type | Notes |
|---|---|---|
| thingIndex | u32 | Index into map things (`0xFFFFFFFF` = player/other non-map thing — writers should prefer map thing index) |
| spriteFrame | u32 | Packed sprite frame id (engine-native; diff as opaque u32 in v1) |
| sortKey | u32 | Depth / draw-order key |
| flags | u32 | Reserved v1 (`0`) |

Ordered by ascending `sortKey`, then `thingIndex`.

### 6 — PORTAL_SNAPSHOT

Captures portal clipper state after BSP traversal (from `hw_portal.cpp` / clip stack).

| Field | Type | Notes |
|---|---|---|
| stackDepth | u32 | Active portal recursion depth |
| clipCount | u32 | Number of active clip lines |
| clips | clipLine × clipCount | |

**clipLine** (24 bytes):

| Field | Type | Notes |
|---|---|---|
| x1 | f32 | Doom coords |
| y1 | f32 | |
| x2 | f32 | |
| y2 | f32 | |
| portalId | u32 | Stable portal id (`0` if anonymous) |
| flags | u32 | Reserved v1 (`0`) |

Clip lines are ordered by **stack bottom → top**, then portal id.

### 7 — FLAT_DRAWS (optional)

| Field | Type | Notes |
|---|---|---|
| count | u32 | |
| entries | flatEntry × count | |

**flatEntry** (12 bytes):

| Field | Type | Notes |
|---|---|---|
| subsectorIndex | u32 | |
| sectorIndex | u32 | Sector rendered for fake/flats |
| sortKey | u32 | Draw order key |

### 8 — DRAW_META (optional)

| Field | Type | Notes |
|---|---|---|
| flatDrawMode | u32 | `0` = unknown, `1` = sector, `2` = subsector-bsp |
| wallCount | u32 | Redundant sanity count |
| spriteCount | u32 | |
| subsectorCount | u32 | |
| engineTag | u8[8] | NUL-padded ASCII build tag (matches GZSTATE convention) |

## Stability rules (normative)

These rules make GZDRAW **byte-comparable** across backends:

1. **Endianness:** all multi-byte integers and IEEE floats are **little-endian**.
2. **Visible subsectors:** order equals GZDoom HW `DoSubsector` visit order for the same GZSTATE + camera. This is the primary oracle — not sorted by index.
3. **Visible sectors:** unique sector indices, **sorted ascending**.
4. **Wall / sprite / flat lists:** ordered by draw sort keys as defined above; ties broken by index fields.
5. **Portal clips:** stack order preserved; no deduplication across stack levels.
6. **Empty sections:** optional sections with `count = 0` may be omitted entirely; required sections with `count = 0` still emit the 4-byte count field.
7. **Indices:** all map indices are **0-based** into the imported GZSTATE map arrays.
8. **No pointers, strings, or floats as keys** except camera coords and clip geometry.
9. **Version bump** required for any layout change, new required section, or changed sort rule.

## CRC32

When header `flags` bit0 is set, each section directory entry's `crc32` is CRC32/IEEE over that section's payload bytes. Same polynomial as GZSTATE (`gzstate/crc32.ts`).

## Diff strategy

1. Parse headers; require matching `version`, `mapName`, `probeId`.
2. Diff section-by-section by `sectionId` (ignore CRC if payload bytes match).
3. For ordered lists, use sequential diff; for `VISIBLE_SECTORS`, compare sorted sets.
4. Corpus gate: native GZDoom dump ≡ WASM dump ≡ federated TS oracle at **0 byte diff** per probe (or documented allowed drift in a versioned exception list).

## File naming (recommended)

```
artifacts/gzrender-v2/gzdraw/<IWAD>/<MAP>/probe-<probeId>.gzdraw
```

Example: `artifacts/gzrender-v2/gzdraw/DOOM/E1M1/probe-0.gzdraw`

## Versioning

| Version | Status | Notes |
|---|---|---|
| 1 | **Implemented (Wave 2)** | Native + WASM dump all sections; TS reader/diff complete |

Any change to required sections, field sizes, or sort rules increments `version`.
