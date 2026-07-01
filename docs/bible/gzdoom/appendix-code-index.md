# Appendix — Code Index

Alphabetical index of key source files for the gold-standard GZDoom HW renderer pipeline and doom-wad-lab integration. Paths relative to repository roots unless noted.

**Back to:** [README.md](./README.md)

---

## A

| File | Purpose |
|------|---------|
| `gzdoom-project/src/common/rendering/gles/gles_buffers.cpp` | GL buffer object create/upload for meshes |
| `gzdoom-project/src/common/rendering/gles/gles_framebuffer.cpp` | Framebuffer objects, stencil, `GZRenderOnly` FBO shortcuts |
| `gzdoom-project/src/common/rendering/gles/gles_renderstate.cpp` | `FRenderState` GLES implementation — draw calls |
| `gzdoom-project/src/common/rendering/gles/gles_shader.cpp` | Shader compile/link; `gles.webgl2` variants |
| `gzdoom-project/src/common/rendering/gles/gles_system.cpp` | `InitGLES`, capability probe, `gles.webgl2`, `glesMode` |
| `gzdoom-project/src/common/rendering/gles/gles_system.h` | GLES runtime struct `OpenGLESRenderer::gles` |
| `gzdoom-project/src/common/rendering/gles/gles_texture.cpp` | Texture upload, format conversion |

---

## D

| File | Purpose |
|------|---------|
| `gzdoom-project/src/d_main.cpp` | Main loop, `W_Init`, `InitGZRenderOnlyFromArgs`, tic driver |
| `gzdoom-project/src/doomdata.h` | WAD map lump structs (`mapvertex_t`, `maplinedef_t`, …) |
| `doom-wad-lab/src/wad/renderer/gzrender-v2/federated/drawFromGzstate.ts` | Classic WebGL draw from GZSTATE (non-gold) |

---

## F

| File | Purpose |
|------|---------|
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_fakeflat.cpp` | `hw_FakeFlat` — heightsec / deep water sector view |
| `gzdoom-project/src/rendering/hwrenderer/data/flatvertices.cpp` | `FFlatVertex` GPU vertex layout |
| `gzdoom-project/src/rendering/hwrenderer/data/hw_lightbuffer.cpp` | Dynamic light SSBO for shaders |
| `gzdoom-project/src/rendering/hwrenderer/data/hw_viewpointbuffer.cpp` | Viewpoint uniform buffer |

---

## G

| File | Purpose |
|------|---------|
| `gzdoom-project/src/g_level.cpp` | Level transitions; calls `P_SetupLevel` |
| `gzdoom-project/src/gamedata/r_defs.h` | Runtime map structs (`vertex_t`, `sector_t`, …) |
| `gzdoom-project/src/gzdraw_dump.cpp` | GZDRAW CPU oracle draw-list dumps |
| `gzdoom-project/src/gzstate_dump.cpp` | GZSTATE v1 export/import; `GZRender*` flags |
| `gzdoom-project/src/gzstate_dump.h` | Public gzrender API declarations |
| `doom-wad-lab/src/gzdoom-oracle/gzdoomWasmHost.ts` | Emscripten module loader, MEMFS, `callMain` |
| `doom-wad-lab/src/gzdoom-oracle/gzdoomPureWasmHost.ts` | Pure WASM `(s)` instantiate + shims |
| `doom-wad-lab/src/gzdoom-oracle/parityDisplayModes.ts` | Named parity CVAR mode → argv |
| `doom-wad-lab/src/gzdoom-oracle/corpusTiers.ts` | Corpus gate tier definitions |

---

## H

| File | Purpose |
|------|---------|
| `gzdoom-project/src/rendering/hwrenderer/hw_entrypoint.cpp` | `RenderViewpoint` — frame entry, light collect |
| `gzdoom-project/src/rendering/hwrenderer/hw_cvars.cpp` | HW renderer CVAR registry |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_bsp.cpp` | BSP traversal, `DoSubsector`, job queue |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_clipper.cpp` | Horizontal/vertical angle clipper |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_decal.cpp` | Wall decal geometry and draw |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_drawinfo.cpp` | `HWDrawInfo`, `SetupView`, `CreateScene`, `DrawScene` |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_drawinfo.h` | Draw info class declaration |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_drawlist.cpp` | Draw lists, sort, translucent pass |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_drawlistadd.cpp` | Insert walls/flats/sprites into lists |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_drawstructs.h` | `HWWall`, `HWFlat`, `HWSprite` structs |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_dynlightdata.cpp` | Dynamic light spatial queries |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_flats.cpp` | Floor/ceiling processing, plane UV |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_lighting.cpp` | `CalcLightLevel`, fog tables |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_models.cpp` | 3D model actor rendering |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_portal.cpp` | Sector/line portals, recursion |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_renderhacks.cpp` | Post-BSP texture/sector hacks |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_setcolor.cpp` | `SetColor`, `SetFog` on render state |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_sky.cpp` | Sky texture rendering |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_skyportal.cpp` | Sky portal sub-view |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_spritelight.cpp` | Sprite/thing light sampling |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_sprites.cpp` | `HWSprite::Process`, billboards |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_vertexbuilder.cpp` | Subsector tessellation, `CreateVBO` |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_walls.cpp` | Wall render methods, mirror, fog boundary |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_walls_vertex.cpp` | Wall vertex/UV generation |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_walldispatcher.cpp` | `AddLine` dispatch, tier logic |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_weapon.cpp` | Player weapon psprites |
| `gzdoom-project/src/rendering/hwrenderer/scene/hw_draw2d.cpp` | GLES 2D/HUD drawing |

---

## P

| File | Purpose |
|------|---------|
| `gzdoom-project/src/p_setup.cpp` | `P_SetupLevel`, lump loaders, GZSTATE import branch |
| `gzdoom-project/src/p_nodes.cpp` | BSP node load (incl. GL nodes) |
| `gzdoom-project/src/p_sectors.cpp` | Sector grouping, portal setup helpers |

---

## R

| File | Purpose |
|------|---------|
| `gzdoom-project/src/r_data/r_interpolate.cpp` | View/entity interpolation |
| `gzdoom-project/src/r_sky.cpp` | Sky texture state, scroll |
| `gzdoom-project/src/r_utility.cpp` | `R_SetupFrame`, viewpoint utilities |

---

## S

| File | Purpose |
|------|---------|
| `gzdoom-project/src/sbar.cpp` | Status bar base class |
| `gzdoom-project/src/st_stuff.cpp` | Doom status bar widgets |
| `doom-wad-lab/src/wad/renderer/bsp/vanilla/bspGoldenSnapshots.json` | Node BSP golden JSON snapshots |
| `doom-wad-lab/src/wad/renderer/gzrender-v2/gzdoom/applyGzdoomRenderLayers.ts` | Layer toggles → GZDoom argv |
| `doom-wad-lab/src/wad/renderer/gzrender-v2/gzdoom/applyGzdoomLayerTogglesLive.ts` | Live `_gzr_exec_cmd` layer updates |
| `doom-wad-lab/src/wad/renderer/gzrender-v2/gzdoom/gzdoomViewerRuntime.ts` | Gold WASM viewer runtime |
| `doom-wad-lab/src/wad/renderer/gzrender-v2/gzdoom/gzdoomSViewerRuntime.ts` | Modular `(s)` viewer runtime |
| `doom-wad-lab/src/wad/renderer/modular/renderLayerToggles.ts` | Classic WebGL layer toggle types |
| `doom-wad-lab/src/wad/parity/frame/frameDiff.ts` | Playfield PNG pixel diff |

---

## T

| File | Purpose |
|------|---------|
| `gzdoom-project/src/texturemanager.cpp` | Global texture/sprite/flat manager (`TexMan`) |
| `gzdoom-project/src/texturemanager.h` | TexMan API |
| `doom-wad-lab/tools/gzrender-v2/build-gzdoom-wasm.sh` | Gold Emscripten build script |
| `doom-wad-lab/tools/gzrender-v2/build-gzdoom-s-pure-wasm.sh` | Modular pure WASM build |
| `doom-wad-lab/tools/gzrender-v2/evaluate-gzdoom-wasm-corpus.mts` | 68-map diff evaluator |
| `doom-wad-lab/tools/gzrender-v2/export-node-gzstate.mts` | Batch Node GZSTATE export |
| `doom-wad-lab/tools/gzrender-v2/gzdoom-wasm-corpus.mts` | Batch WASM PNG capture |
| `doom-wad-lab/tools/gzrender-v2/verify-gold-wasm-artifact.sh` | Gold artifact path verification |

---

## V

| File | Purpose |
|------|---------|
| `gzdoom-project/src/v_draw.cpp` | 2D patch/text drawing API |
| `gzdoom-project/src/v_video.cpp` | Video mode, screen abstraction |

---

## W

| File | Purpose |
|------|---------|
| `gzdoom-project/src/w_wad.cpp` | WAD lump directory and I/O |

---

## Chapter → primary files quick map

| Chapter | Start here |
|---------|------------|
| [01 Boot](./01-engine-boot-and-wad-load.md) | `d_main.cpp`, `p_setup.cpp`, `texturemanager.cpp` |
| [02 Structs](./02-level-data-structures.md) | `doomdata.h`, `r_defs.h` |
| [03 View](./03-view-setup-and-camera.md) | `hw_drawinfo.cpp`, `hw_entrypoint.cpp` |
| [04 BSP](./04-bsp-traversal.md) | `hw_bsp.cpp`, `hw_clipper.cpp` |
| [05 Walls](./05-wall-rendering.md) | `hw_walls.cpp`, `hw_walldispatcher.cpp` |
| [06 Flats](./06-flats-and-ceilings.md) | `hw_flats.cpp`, `hw_vertexbuilder.cpp` |
| [07 Sky/portals](./07-sky-and-portals.md) | `hw_portal.cpp`, `hw_sky.cpp` |
| [08 Light](./08-lighting.md) | `hw_lighting.cpp`, `hw_setcolor.cpp` |
| [09 Sprites](./09-sprites-and-models.md) | `hw_sprites.cpp`, `hw_weapon.cpp` |
| [10 Draw order](./10-draw-order-and-translucency.md) | `hw_drawlist.cpp` |
| [11 HUD](./11-hud-and-2d.md) | `hw_draw2d.cpp`, `sbar.cpp` |
| [12 WASM](./12-gles-webgl2-wasm-path.md) | `gles_system.cpp`, `build-gzdoom-wasm.sh` |
| [13 CVARs](./13-render-layer-cvars.md) | `applyGzdoomRenderLayers.ts` |
| [14 GZSTATE](./14-gzstate-dump-parity.md) | `gzstate_dump.cpp` |
| [15 Gates](./15-wasm-host-and-corpus-gates.md) | `evaluate-gzdoom-wasm-corpus.mts` |
