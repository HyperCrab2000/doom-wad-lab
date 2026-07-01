import fs from 'node:fs';
import path from 'node:path';

import { exportToGzstate, loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildFrameSnapshotFromDrawState, drawCountsFromDrawState } from '@/wad/renderer/modular/buildFrameSnapshotFromDrawState';
import type { ModularFrameSnapshot } from '@/wad/renderer/modular/stageSnapshotTypes';
import { gzstateToWadMap } from '@/wad/renderer/gzrender-v2/federated/gzstateToWadMap';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  buildVanillaBspView,
  listIwadMaps,
  loadWadMap,
  playerStartView,
  runProductionMeshDrawState,
  type MapRef,
  type VanillaBspView,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

const IWAD_DIR = path.join(process.cwd(), 'public/wads');

const snapshotCache = new Map<string, ModularFrameSnapshot>();
const gzstateMapCache = new Map<string, WadMap>();

function snapshotCacheKey(mapRef: MapRef, backend: RenderBackend): string {
  return `${mapRef.wadName}::${mapRef.mapName}::${backend}`;
}

function gzstateMapCacheKey(mapRef: MapRef): string {
  return `${mapRef.wadName}::${mapRef.mapName}`;
}

export function clearModularSnapshotCache(): void {
  snapshotCache.clear();
  gzstateMapCache.clear();
}

export function iwadsPresent(): boolean {
  return fs.existsSync(path.join(IWAD_DIR, 'DOOM.WAD')) && fs.existsSync(path.join(IWAD_DIR, 'DOOM2.WAD'));
}

/** Federated path — geometry from GZSTATE export, not direct WAD map parse. */
export function loadGzstateWadMap(mapRef: MapRef): WadMap {
  const key = gzstateMapCacheKey(mapRef);
  const hit = gzstateMapCache.get(key);
  if (hit) return hit;

  const wadPath = path.join(IWAD_DIR, mapRef.wadName);
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = exportToGzstate(wad, mapRef.mapName);
  const map = gzstateToWadMap(doc);
  gzstateMapCache.set(key, map);
  return map;
}

function buildGzstateBspView(mapRef: MapRef, viewX: number, viewY: number, viewYaw: number): VanillaBspView {
  const map = loadGzstateWadMap(mapRef);
  const index = buildBspRenderIndex(map);
  if (!index) throw new Error(`BSP index missing for GZSTATE map ${mapRef.mapName}`);
  const sectorVisibility = buildSectorVisibilityIndex(map);
  return { mapRef, map, index, sectorVisibility, viewX, viewY, viewYaw };
}

function runGzstateProductionMeshDrawState(view: VanillaBspView) {
  const subsectorFlats = mapToSubsectorFlats(view.map, view.index);
  return buildGzdoomDrawState({
    map: view.map,
    buffers: {
      bspRenderIndex: view.index,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility: view.sectorVisibility,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats,
    } as never,
    viewX: view.viewX,
    viewY: view.viewY,
    viewYaw: view.viewYaw,
    cameraPos: [view.viewX, 41, -view.viewY],
  });
}

export function captureSpawnModularFrameSnapshot(
  mapRef: MapRef,
  backend: RenderBackend,
): ModularFrameSnapshot | null {
  const cached = snapshotCache.get(snapshotCacheKey(mapRef, backend));
  if (cached) return cached;

  const wadMap = loadWadMap(mapRef.wadName, mapRef.mapName);
  const start = playerStartView(wadMap);

  let drawState;
  let geometrySource: 'wad' | 'gzstate';

  if (backend === 'wasm-federated') {
    const view = buildGzstateBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
    drawState = runGzstateProductionMeshDrawState(view);
    geometrySource = 'gzstate';
  } else {
    const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
    drawState = runProductionMeshDrawState(view);
    geometrySource = 'wad';
  }

  if (!drawState) return null;
  const snapshot = buildFrameSnapshotFromDrawState(
    backend,
    mapRef.mapName,
    drawState,
    drawCountsFromDrawState(drawState),
    null,
    geometrySource,
  );
  snapshotCache.set(snapshotCacheKey(mapRef, backend), snapshot);
  return snapshot;
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
