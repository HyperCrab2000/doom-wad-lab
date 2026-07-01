import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { executeHwDrawPipeline } from '@/wad/renderer/renderGame/drawScene';

import { getFederatedMapState } from './mapStateStore';

/**
 * Federated draw path — geometry comes from loaded GZSTATE, not the parallel WAD map parse.
 */
export function drawFromGzstate(params: DrawSceneParams): void {
  const state = getFederatedMapState();
  const drawParams =
    state?.gzstateMap != null ? { ...params, map: state.gzstateMap } : params;
  executeHwDrawPipeline(drawParams);
}
