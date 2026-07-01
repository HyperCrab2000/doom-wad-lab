import type { BspSnapshot } from '@/wad/renderer/bsp/vanilla/bspSnapshot';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import type { ModularRenderStage } from '@/wad/renderer/modular/modularRenderStage';

export interface StageDrawCounts {
  walls: number;
  flats: number;
  transparentWalls: number;
  voxels: number;
  sprites: number;
  wallSkippedTex: number;
}

export interface ModularStageSnapshot {
  stage: ModularRenderStage;
  backend: RenderBackend;
  mapName: string;
  stageCap: ModularRenderStage | null;
  cameraSectorIndex: number;
  cameraSubsector: number;
  flatDrawMode: string;
  drawCounts: StageDrawCounts;
  bsp: BspSnapshot | null;
  bspHash: string | null;
}

/** Where spawn-time geometry came from — wasm-federated must use `gzstate`, not shared WAD harness. */
export type ModularGeometrySource = 'wad' | 'gzstate';

export interface ModularFrameSnapshot {
  frameIndex: number;
  backend: RenderBackend;
  mapName: string;
  geometrySource: ModularGeometrySource;
  stageCap: ModularRenderStage | null;
  stages: Partial<Record<ModularRenderStage, ModularStageSnapshot>>;
  fullHash: string;
}

export interface StageSnapshotDiff {
  stage: ModularRenderStage;
  field: string;
  left: unknown;
  right: unknown;
}

export interface FrameSnapshotDiffResult {
  equal: boolean;
  diffs: StageSnapshotDiff[];
}
