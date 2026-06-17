import { drawScene, type DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';

/**
 * Federated WebGL2 draw backend — uses classic HW pipeline while GZSTATE + WASM host
 * own canonical map state (future: draw from GZSTATE sections only).
 */
export function drawFederatedWebGl2Frame(params: DrawSceneParams): void {
  drawScene(params);
}
