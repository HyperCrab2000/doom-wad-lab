# Parity Gap Tracker

## Stage order (must pass in sequence)

**Rule:** No renderer or game-engine injection until Stage 0 passes. Follow the [four-step plan](./four-step-plan.md): WAD data → GZDoom WASM frames → strip fork → modular splits.

| Stage | Gate | Command | Status |
|---|---|---|---|
| **0** | **WAD data parity (pre-renderer)** | `WAD_DATA_PARITY_REQUIRED=1 npm run test:wad-data` | **Closed** |
| 1 | GZSTATE export vs GZDoom dump (68 maps) | `GZRENDER_CORPUS_REQUIRED=1 npm run test:corpus` | **Closed** |
| 2 | BSP draw-state @ spawn (Classic vs federated) | `npm run test:modular` | **Closed** |
| 3 | GZDoom import oracle (native ref ≡ import) | `npm run import-oracle:corpus:all` | **Closed** (68/68) |
| **2b** | **GZDoom WASM vs gold-standard frames** | `npm run test:gzdoom-wasm-frame` | **Open** |
| 4 | Frame pixels vs GZDoom ref (browser renderer) | `GZFRAME_PARITY_REQUIRED=1 npm run test:frame` | Open |

**Rule:** No renderer or game-engine injection until Stage 0 passes. Stages 3–4 are blocked until Stages 0–2 are green.

## Stage 0 — what it proves (100% WAD data)

| Tier | Check | Scope |
|---|---|---|
| 1 | Parsed `lump.data` byte-identical to IWAD file slice | DOOM.WAD + DOOM2.WAD |
| 2 | `encodeWadToArrayBuffer` → parse preserves every lump payload CRC | both IWADs |
| 3 | Direct `wad.maps[MAP]` ≡ `gzstateToWadMap(exportToGzstate(...))` | 68 maps |
| 4 | Tier 3 through **GZSTATE wire** (`writeGzstate` → `readGzstate`) incl. **REJECT + BLOCKMAP raw bytes** | 68 maps |

Stage 0 output is **injectable WAD data**: a `.gzstate` file whose map lumps (geometry + REJECT + BLOCKMAP) round-trip to the same bytes the parser extracted from the IWAD.

## Open gaps

| ID | WAD | Map | Failure Class | Description | Status |
|---|---|---|---|---|---|
| GAP-0002 | DOOM | E1M1 | renderer dependency | Frame mismatch vs GZDoom @ spawn | Open |
| GAP-0003 | ALL | ALL | renderer dependency | Federated draw still TS WebGL | **Partial** |
| GAP-0005 | DOOM | E1M1+ | mod stack | PWAD/PK3 `-file` parity | Open |
| GAP-0006 | ALL | ALL | missing subsystem | Game engine WASM not built | Open |
| GAP-0008 | ALL | ALL | GZDoom import | MAP_REJECT/MAP_BLOCKMAP (sec 22–23) in Node wire + GZDoom dump/import | **Closed** |
| GAP-0009 | ALL | ALL | import oracle | GZDoom `-loadgzstate` frame ≡ WAD-load ref @ `-gzrender_only` | **Closed** (68/68) |

## Closed (2026-06-17)

- **Stage 0 (4 tiers)** — 68/68 maps WAD data parity including wire REJECT/BLOCKMAP
- **68/68 maps** — Node `exportToGzstate` matches GZDoom dump on 20 GZSTATE sections
- **Stage 3 (68/68)** — GZDoom import oracle: WAD-load ref ≡ `-loadgzstate` import @ 0% frame diff, both paths use `-gzrender_only`
- **68/68 maps** — BSP draw-state @ spawn: Classic vs WASM federated

## Next gate (Stage 4 — browser frame parity + Rust WASM full parse)

1. Browser renderer frame diff vs GZDoom ref (`GZFRAME_PARITY_REQUIRED=1 npm run test:frame`)
2. Rust `wasm-pack` build for full in-WASM GZSTATE parse (stub today: validate magic + TS `gzstateToWadMap` draw)
