import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';

import { drawFromGzstate } from './drawFromGzstate';

/** Federated GZSTATE draw — geometry from GZSTATE via drawFromGzstate, not Classic WAD parse. */
export function drawFederatedWebGl2Frame(params: DrawSceneParams): void {
  drawFromGzstate(params);
}
