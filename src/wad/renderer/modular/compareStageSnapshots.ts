import { MODULAR_STAGE_ORDER } from '@/wad/renderer/modular/modularRenderStage';

import type {
  FrameSnapshotDiffResult,
  ModularFrameSnapshot,
  ModularStageSnapshot,
  StageSnapshotDiff,
} from './stageSnapshotTypes';

function diffStage(left: ModularStageSnapshot, right: ModularStageSnapshot): StageSnapshotDiff[] {
  const diffs: StageSnapshotDiff[] = [];
  const fields: Array<keyof ModularStageSnapshot> = [
    'cameraSectorIndex',
    'cameraSubsector',
    'flatDrawMode',
    'bspHash',
  ];
  for (const field of fields) {
    if (left[field] !== right[field]) {
      diffs.push({ stage: left.stage, field, left: left[field], right: right[field] });
    }
  }
  const countFields = ['walls', 'flats', 'transparentWalls', 'voxels', 'sprites', 'wallSkippedTex'] as const;
  for (const field of countFields) {
    if (left.drawCounts[field] !== right.drawCounts[field]) {
      diffs.push({
        stage: left.stage,
        field: `drawCounts.${field}`,
        left: left.drawCounts[field],
        right: right.drawCounts[field],
      });
    }
  }
  return diffs;
}

export function compareFrameSnapshots(
  left: ModularFrameSnapshot,
  right: ModularFrameSnapshot,
  stages: readonly string[] = MODULAR_STAGE_ORDER,
): FrameSnapshotDiffResult {
  const diffs: StageSnapshotDiff[] = [];
  if (left.mapName !== right.mapName) {
    diffs.push({ stage: 'sprites', field: 'mapName', left: left.mapName, right: right.mapName });
  }
  for (const stage of stages) {
    const l = left.stages[stage as keyof typeof left.stages];
    const r = right.stages[stage as keyof typeof right.stages];
    if (!l && !r) continue;
    if (!l || !r) {
      diffs.push({ stage: stage as ModularStageSnapshot['stage'], field: 'missing', left: !!l, right: !!r });
      continue;
    }
    diffs.push(...diffStage(l, r));
  }
  return { equal: diffs.length === 0, diffs };
}

export function formatStageSnapshotDiff(result: FrameSnapshotDiffResult): string {
  if (result.equal) return 'equal';
  return result.diffs
    .slice(0, 20)
    .map((d) => `${d.stage}.${d.field}: ${JSON.stringify(d.left)} != ${JSON.stringify(d.right)}`)
    .join('\n');
}
