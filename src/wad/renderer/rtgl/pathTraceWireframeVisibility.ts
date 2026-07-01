import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import type { RenderLayerDrawPlan } from '@/wad/renderer/modular/renderLayerToggles';
import { resolveWireframeDrawState } from '@/wad/renderer/modular/wireframeDrawState';

export function resolvePathTraceWireframeDrawState(
  params: DrawSceneParams,
  drawState: GzdoomDrawState,
  layerPlan: RenderLayerDrawPlan
): GzdoomDrawState {
  if (layerPlan.wireframeMode !== 'sight') {
    return resolveWireframeDrawState(layerPlan.wireframeMode, params, drawState);
  }
  return resolveWireframeDrawState('sight', params, drawState);
}

export { collectRayTracedVisibleGeometry } from '@/wad/renderer/rtgl/collectRayTracedVisibleSectors';
