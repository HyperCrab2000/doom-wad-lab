import { hashBspSnapshot, type BspSnapshot } from '@/wad/renderer/bsp/vanilla/bspSnapshot';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import type { ModularRenderStage } from '@/wad/renderer/modular/modularRenderStage';
import { MODULAR_STAGE_ORDER } from '@/wad/renderer/modular/modularRenderStage';

import type {
  ModularFrameSnapshot,
  ModularGeometrySource,
  ModularStageSnapshot,
  StageDrawCounts,
} from './stageSnapshotTypes';

let globalFrameIndex = 0;

export class StageSnapshotRecorder {
  private readonly stages = new Map<ModularRenderStage, ModularStageSnapshot>();
  private readonly frameIndex: number;

  constructor(
    private readonly backend: RenderBackend,
    private readonly mapName: string,
    private readonly stageCap: ModularRenderStage | null,
  ) {
    this.frameIndex = ++globalFrameIndex;
  }

  record(
    stage: ModularRenderStage,
    partial: {
      cameraSectorIndex: number;
      cameraSubsector: number;
      flatDrawMode: string;
      drawCounts: StageDrawCounts;
      bsp: BspSnapshot | null;
    },
  ): void {
    const bspHash = partial.bsp ? hashBspSnapshot(partial.bsp) : null;
    this.stages.set(stage, {
      stage,
      backend: this.backend,
      mapName: this.mapName,
      stageCap: this.stageCap,
      cameraSectorIndex: partial.cameraSectorIndex,
      cameraSubsector: partial.cameraSubsector,
      flatDrawMode: partial.flatDrawMode,
      drawCounts: { ...partial.drawCounts },
      bsp: partial.bsp ? { ...partial.bsp, wallDrawOrder: [...partial.bsp.wallDrawOrder] } : null,
      bspHash,
    });
  }

  finalize(geometrySource: ModularGeometrySource = 'wad'): ModularFrameSnapshot {
    const stages: Partial<Record<ModularRenderStage, ModularStageSnapshot>> = {};
    for (const [key, value] of this.stages) {
      stages[key] = value;
    }
    const fullHash = hashFrameSnapshot(stages);
    const snapshot: ModularFrameSnapshot = {
      frameIndex: this.frameIndex,
      backend: this.backend,
      mapName: this.mapName,
      geometrySource,
      stageCap: this.stageCap,
      stages,
      fullHash,
    };
    if (typeof window !== 'undefined') {
      const w = window as unknown as {
        __doomStageSnapshots?: ModularFrameSnapshot;
        __doomStageSnapshotHistory?: ModularFrameSnapshot[];
      };
      w.__doomStageSnapshots = snapshot;
      w.__doomStageSnapshotHistory = w.__doomStageSnapshotHistory ?? [];
      w.__doomStageSnapshotHistory.push(snapshot);
      if (w.__doomStageSnapshotHistory.length > 120) {
        w.__doomStageSnapshotHistory.shift();
      }
    }
    return snapshot;
  }
}

export function hashFrameSnapshot(stages: Partial<Record<ModularRenderStage, ModularStageSnapshot>>): string {
  const parts: string[] = [];
  for (const stage of MODULAR_STAGE_ORDER) {
    const snap = stages[stage];
    if (!snap) continue;
    parts.push(
      `${stage}:${snap.bspHash ?? 'none'}:${snap.drawCounts.walls}:${snap.drawCounts.flats}:${snap.drawCounts.sprites}:${snap.drawCounts.voxels}`,
    );
  }
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function resetStageSnapshotHistory(): void {
  globalFrameIndex = 0;
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __doomStageSnapshotHistory?: ModularFrameSnapshot[] };
    w.__doomStageSnapshotHistory = [];
  }
}
