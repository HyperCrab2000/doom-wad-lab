import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { resolvePortalCulledWireframeDrawState } from '@/wad/renderer/rtgl/portalWireframeSight';
import type { WireframeMode } from '@/wad/renderer/modular/renderLayerToggles';

/** Pick wall/flat draw lists for the active wireframe mode. */
export function resolveWireframeDrawState(
  mode: WireframeMode,
  params: DrawSceneParams,
  drawState: GzdoomDrawState
): GzdoomDrawState {
  switch (mode) {
    case 'bsp':
      return {
        ...drawState,
        wallDrawOrder: drawState.bspWallDrawOrder,
        flatSubsectorOrder: drawState.bspFlatSubsectorOrder,
      };
    case 'mesh':
      return drawState;
    case 'sight':
      return resolvePortalCulledWireframeDrawState(params, drawState);
    default:
      return drawState;
  }
}
