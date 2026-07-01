# 2026-06-16 — GZDoom HW renderer recon (bootstrap)

## Build

| Item | Value |
|------|-------|
| Repo | `/Users/williamfarmer/IdeaProjects/gzdoom-project` |
| Build dir | `build/` (existing CMake + Ninja from Feb 2025) |
| Build command | `cd build && ninja gzdoom` |
| Binary | `build/gzdoom.app/Contents/MacOS/gzdoom` |
| Build status | **Succeeded** 2026-06-16 (508/509 link step) |

## HW renderer entry points (initial)

Primary OpenGL path under `src/rendering/hwrenderer/`:

| File | Role |
|------|------|
| `hw_entrypoint.cpp` | HW renderer entry |
| `scene/hw_bsp.cpp` | BSP traversal, visibility clipping (`DoSubsector`, wall/flat/sprite jobs) |
| `scene/hw_drawinfo.cpp` | Draw info / frame setup |
| `scene/hw_flats.cpp` | Flat processing (`HWFlat::ProcessSector`) |
| `scene/hw_walls.cpp` | Wall rendering |
| `scene/hw_sprites.cpp` | Sprite rendering |
| `scene/hw_fakeflat.cpp` | Fake floor/ceiling handling |
| `scene/hw_portal.cpp` | Portal rendering |
| `hw_vertexbuilder.cpp` | Vertex buffer build |

Key includes in `hw_bsp.cpp`: `g_levellocals.h`, `hw_drawinfo.h`, `hw_clipper.h`, `flatvertices.h`.

## WAD Lab existing GZDoom alignment

`tools/bsp-ref/README.md` documents TS ports aligned to `hw_bsp.cpp`:

- `buildGzdoomDrawState` — subsector-BSP draw order
- Golden snapshots + dual trace (`buildBspVisibleSet` / `traceClassicBsp`)
- Production rule: flats/sprites from `flatSubsectorOrder` only (matches GZDoom `DoSubsector`)

This is **draw-order parity**, not full post-load GZSTATE. GZRender-V2 needs a new exporter for resolved post-load state (textures resolved, links built, sector heights, etc.).

## GZSTATE exporter hooks (TBD)

Candidates to investigate next:

- `FLevelLocals` / map load completion (`p_setup.cpp`, `g_level.cpp`)
- `serializer_doom.cpp` — existing save serialization (may inform section layout, not identical to GZSTATE)
- Texture manager post-load tables (`texturemanager.h`)
- `flatvertices.h` — GPU flat vertex state

## First vertical slice target

```txt
DOOM.WAD / E1M1
→ GZDoom dumps post-load GZSTATE
→ import renderer renders one frame
→ frame diff vs GZDoom reference
```

## Open questions

- Headless/offscreen frame capture path in GZDoom (for reference frames)
- Minimal subset of `FLevelLocals` needed for static E1M1 load state
- Whether to fork GZDoom with a `-dump-gzstate` CLI flag vs external tool
