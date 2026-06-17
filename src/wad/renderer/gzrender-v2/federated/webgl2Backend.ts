import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { executeHwDrawPipeline } from '@/wad/renderer/renderGame/drawScene';

/**
 * Federated GZSTATE draw path — calls the HW pipeline without the Classic `drawScene` wrapper.
 * WASM host validates GZSTATE before this runs; future: consume WASM draw lists directly.
 */
export function drawFederatedWebGl2Frame(params: DrawSceneParams): void {
  executeHwDrawPipeline(params);
}
