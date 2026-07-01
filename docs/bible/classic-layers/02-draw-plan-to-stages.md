# Chapter 02 — Draw plan → modular stages

## Pipeline order

From [`modularRenderStage.ts`](../../../src/wad/renderer/modular/modularRenderStage.ts):

```
clear → visibilityWireframe → meshWireframe → sky → flatsUnlit → flats
  → wallsUnlit → wallsOpaque → wallsTransparent → voxels → sprites
```

## runStage() gate

In [`drawScene.ts`](../../../src/wad/renderer/renderGame/drawScene.ts) `executeHwDrawPipeline`:

| Stage | Enabled when (layerPlan) |
|-------|--------------------------|
| sky | layerPlan.sky |
| flatsUnlit | ceilingsUnlit \|\| floorsUnlit |
| flats | floorsTextured \|\| ceilingsTextured |
| wallsUnlit | wallsUnlit |
| wallsOpaque / wallsTransparent | wallsTextured |
| voxels | voxels |
| sprites | sprites |

When `?modStage=` URL cap is set, stages above cap are also skipped (debug builds).

---

[← Draw plan](./01-ui-to-draw-plan.md) · [Next: Node geometry →](./03-node-geometry-pipeline.md)
