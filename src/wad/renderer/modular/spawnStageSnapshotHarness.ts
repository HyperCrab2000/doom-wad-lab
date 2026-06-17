import fs from 'node:fs';
import path from 'node:path';

import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { buildFrameSnapshotFromDrawState, drawCountsFromDrawState } from '@/wad/renderer/modular/buildFrameSnapshotFromDrawState';
import type { ModularFrameSnapshot } from '@/wad/renderer/modular/stageSnapshotTypes';
import {
  buildVanillaBspView,
  listIwadMaps,
  loadWadMap,
  playerStartView,
  runProductionMeshDrawState,
  type MapRef,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

const IWAD_DIR = path.join(process.cwd(), 'public/wads');

export function iwadsPresent(): boolean {
  return fs.existsSync(path.join(IWAD_DIR, 'DOOM.WAD')) && fs.existsSync(path.join(IWAD_DIR, 'DOOM2.WAD'));
}

export function captureSpawnModularFrameSnapshot(
  mapRef: MapRef,
  backend: RenderBackend,
): ModularFrameSnapshot | null {
  const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
  const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
  const drawState = runProductionMeshDrawState(view);
  if (!drawState) return null;
  return buildFrameSnapshotFromDrawState(backend, mapRef.mapName, drawState, drawCountsFromDrawState(drawState));
}

export function captureAllSpawnModularFrameSnapshots(
  backend: RenderBackend,
): Array<{ mapRef: MapRef; snapshot: ModularFrameSnapshot }> {
  const out: Array<{ mapRef: MapRef; snapshot: ModularFrameSnapshot }> = [];
  for (const mapRef of listIwadMaps()) {
    const snapshot = captureSpawnModularFrameSnapshot(mapRef, backend);
    if (snapshot) out.push({ mapRef, snapshot });
  }
  return out;
}
