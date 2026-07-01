import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { drawFederatedWasmFrame } from './federatedWasmBackend';

export function drawSceneFederatedWasm(params: DrawSceneParams): void {
  drawFederatedWasmFrame(params);
}

export { drawFederatedWasmFrame as drawFederatedWasmSync };
