# Chapter 10 — GZDoom parity matrix

| Classic toggle | Draw plan | GZDoom (s) CVAR |
|----------------|-----------|-----------------|
| solidWalls | wallsTextured / wallsUnlit | gl_render_walls |
| solidFloors \|\| solidCeilings | drawFloorFlats / drawCeilingFlats | gl_render_flats |
| wall/floor/ceiling textures | *Textured flags | gl_texture |
| voxels | sprites | gl_render_things |
| sky | sky | gl_portals, gl_noskyboxes |
| dynamicLighting | dynamicLights | gl_fogmode |
| coloredLighting | coloredLights | gl_bandedswlight |

**Not in browser WASM:** `gl_lightmode`, `gl_light_sprites` (stripped — use matrix above).

Live APIs:

- Classic: `applyClassicLayerTogglesLive`
- GZDoom: `applyGzdoomLayerTogglesLive`

---

[← Wireframe](./09-layer-wireframe.md) · [Testing →](./11-testing-diagnostics.md)
