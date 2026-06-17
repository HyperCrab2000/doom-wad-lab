import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { drawPathTraceSync } from './rtglRenderer';

export function drawScenePathTrace(params: DrawSceneParams): void {
  drawPathTraceSync(params, params.wadPath ?? null, params.mapName ?? '');
}

export { drawPathTraceSync };
