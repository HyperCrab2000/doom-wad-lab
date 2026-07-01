# Appendix — Full layer catalog

Generated from [`CLASSIC_LAYER_DEFINITIONS`](../../../src/wad/renderer/modular/classicLayerMapping.ts).

| ID | UI toggles | Modular stages | Node sources | GZDoom CVARs |
|----|------------|----------------|--------------|--------------|
| `walls-solid` | solidWalls | wallsUnlit, wallsOpaque, wallsTransparent | `mapToWalls`, `buildMapGeometryCpu` | gl_render_walls |
| `walls-texture` | solidWalls + wallTextures | wallsOpaque, wallsTransparent, wallsUnlit | `loadWad` texture raster | gl_render_walls, gl_texture |
| `floors` | solidFloors | flatsUnlit, flats | `mapToFlats`, SECTORS.floorpic | gl_render_flats |
| `ceilings` | solidCeilings | flatsUnlit, flats | `mapToFlats`, SECTORS.ceilingpic | gl_render_flats |
| `floor-textures` | solidFloors + floorTextures | flats | flat atlas | gl_render_flats, gl_texture |
| `ceiling-textures` | solidCeilings + ceilingTextures | flats | flat atlas | gl_render_flats, gl_texture |
| `liquid` | animatedLiquid | flats | animatedFlats, time scroll | gl_render_flats |
| `sky` | sky, courtyardSky | sky | drawSkybox, gzdoomDrawState | gl_portals, gl_noskyboxes |
| `sprites` | voxels | voxels, sprites | THINGS, KVX | gl_render_things |
| `dynamic-light` | dynamicLighting | (shader uniforms) | pointLights | gl_fogmode |
| `sector-color` | coloredLighting | (shader uniforms) | sectorLightCache | gl_bandedswlight |
| `wireframe-bsp` | wireframeMode | visibilityWireframe, meshWireframe | buildGzdoomDrawState | gl_texture 0 |

---

## Test presets

| Preset ID | Use |
|-----------|-----|
| `all` | Full scene baseline |
| `walls-solid` | Wall isolation |
| `floors` / `ceilings` | Flat isolation |
| `sky` | Sky + ceiling |
| `walls-off` | Regression — walls hidden, flats remain |

```typescript
import { classicLayerTestPreset } from '@/wad/renderer/modular/classicLayerMapping';
classicLayerTestPreset('walls-off');
```

---

[← Classic Layer Bible](./README.md)
