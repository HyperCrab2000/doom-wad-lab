import type { BspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';

export interface BspSnapshot {
  cameraSubsector: number;
  cameraSectorIndex: number;
  flatSubsectorOrder: number[];
  flatSectorOrder: number[];
  wallDrawOrder: Array<{ lineIndex: number; sideDefIndex: number }>;
  visibleSectors: number[];
}

export function snapshotFromBspVisible(visible: BspVisibleSet): BspSnapshot {
  return {
    cameraSubsector: visible.cameraSubsector,
    cameraSectorIndex: visible.cameraSectorIndex,
    flatSubsectorOrder: [...visible.flatSubsectorOrder],
    flatSectorOrder: [...visible.flatSectorOrder],
    wallDrawOrder: visible.wallDrawOrder.map((entry) => ({
      lineIndex: entry.lineIndex,
      sideDefIndex: entry.sideDefIndex,
    })),
    visibleSectors: [...visible.visibleSectors].sort((a, b) => a - b),
  };
}

export function snapshotFromDrawState(drawState: GzdoomDrawState): BspSnapshot {
  return {
    cameraSubsector: drawState.cameraSubsector,
    cameraSectorIndex: drawState.cameraSectorIndex,
    flatSubsectorOrder: [...drawState.flatSubsectorOrder],
    flatSectorOrder: [...drawState.flatSectorOrder],
    wallDrawOrder: drawState.wallDrawOrder.map((entry) => ({
      lineIndex: entry.lineIndex,
      sideDefIndex: entry.sideDefIndex,
    })),
    visibleSectors: [...drawState.visibleSectors].sort((a, b) => a - b),
  };
}

/** Browser + Node safe — must not import node:crypto (used from drawScene). */
export function hashBspSnapshot(snapshot: BspSnapshot): string {
  const payload = JSON.stringify(snapshot);
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Frozen BSP outputs — regenerate with `npx tsx scripts/generate-bsp-golden-snapshots.ts`. */
export interface BspGoldenCatalog {
  version: 1;
  generatedAt: string;
  spawn: Record<string, { hash: string; snapshot: BspSnapshot }>;
  e1m1Courtyard: Record<string, { hash: string; snapshot: BspSnapshot }>;
}
