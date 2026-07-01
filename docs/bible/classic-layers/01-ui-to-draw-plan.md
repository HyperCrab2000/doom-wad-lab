# Chapter 01 — UI toggles → draw plan

## RenderLayerToggles (UI state)

Defined in [`renderLayerToggles.ts`](../../../src/wad/renderer/modular/renderLayerToggles.ts).

| Toggle | Group | Default |
|--------|-------|---------|
| solidWalls | Geometry | on |
| solidFloors | Geometry | on |
| solidCeilings | Geometry | on |
| sky | Geometry | on |
| voxels | Geometry | on (sprites) |
| courtyardSky | Geometry | on |
| wallTextures | Textures | on |
| floorTextures | Textures | on |
| ceilingTextures | Textures | on |
| animatedLiquid | Textures | on |
| dynamicLighting | Lighting | on |
| coloredLighting | Lighting | on |
| wireframeMode | Debug | off |

Persisted in `sessionStorage` key `doom-render-layers-v6`.

## RenderLayerDrawPlan (GPU gates)

`buildRenderLayerDrawPlan(toggles)` produces booleans consumed by `drawScene`:

| Plan field | Meaning |
|------------|---------|
| wallsTextured | Draw opaque/masked walls with textures |
| wallsUnlit | Walls without texture sample (flat color) |
| drawFloorFlats | Submit floor triangles |
| drawCeilingFlats | Submit ceiling triangles |
| floorsTextured / ceilingsTextured | Sample flat atlas |
| sky | Run skybox pass |
| sprites / voxels | Draw things |
| dynamicLights / coloredLights | Shader light paths |

## Example — walls off

```typescript
// solidWalls: false → wallsTextured false, wallsUnlit false
// runStage('wallsOpaque') returns false
```

See [Chapter 02](./02-draw-plan-to-stages.md).

---

[← Intro](./00-introduction.md) · [Next: Stages →](./02-draw-plan-to-stages.md)
