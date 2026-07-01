import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { snapshotFromDrawState } from '@/wad/renderer/bsp/vanilla/bspSnapshot';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { MODULAR_STAGE_ORDER, type ModularRenderStage } from '@/wad/renderer/modular/modularRenderStage';
import { StageSnapshotRecorder } from '@/wad/renderer/modular/stageSnapshotCollector';
import type {
  ModularFrameSnapshot,
  ModularGeometrySource,
  StageDrawCounts,
} from '@/wad/renderer/modular/stageSnapshotTypes';

export function emptyStageDrawCounts(): StageDrawCounts {
  return {
    walls: 0,
    flats: 0,
    transparentWalls: 0,
    voxels: 0,
    sprites: 0,
    wallSkippedTex: 0,
  };
}

export function drawCountsFromDrawState(drawState: GzdoomDrawState): StageDrawCounts {
  return {
    walls: drawState.wallDrawOrder.length,
    flats: drawState.flatSubsectorOrder.length,
    transparentWalls: 0,
    voxels: 0,
    sprites: 0,
    wallSkippedTex: 0,
  };
}

export function recordDrawStateStages(
  recorder: StageSnapshotRecorder,
  drawState: GzdoomDrawState,
  counts: StageDrawCounts,
  stages: readonly ModularRenderStage[] = MODULAR_STAGE_ORDER,
): void {
  const bsp = snapshotFromDrawState(drawState);
  for (const stage of stages) {
    recorder.record(stage, {
      cameraSectorIndex: drawState.cameraSectorIndex,
      cameraSubsector: drawState.cameraSubsector,
      flatDrawMode: drawState.flatDrawMode,
      drawCounts: counts,
      bsp,
    });
  }
}

export function buildFrameSnapshotFromDrawState(
  backend: RenderBackend,
  mapName: string,
  drawState: GzdoomDrawState,
  counts: StageDrawCounts = drawCountsFromDrawState(drawState),
  stageCap: ModularRenderStage | null = null,
  geometrySource: ModularGeometrySource = 'wad',
): ModularFrameSnapshot {
  const recorder = new StageSnapshotRecorder(backend, mapName, stageCap);
  recordDrawStateStages(recorder, drawState, counts);
  return recorder.finalize(geometrySource);
}
