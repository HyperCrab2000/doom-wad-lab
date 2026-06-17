import type { FlatObject } from '@/wad/interfaces/FlatObject';
import type { CpuMapGeometry } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { mapLoadCacheKey } from '@/wad/renderer/renderGame/mapLoadCache';
import { buildSceneTriangles, type SceneTriangleBuildOptions } from './buildSceneTriangles';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

const cpuGeometryCache = new Map<string, Promise<CpuMapGeometry>>();
const subsectorFlatCache = new Map<string, Promise<FlatObject[]>>();
const geometryReady = new Map<string, CpuMapGeometry>();
const flatsReady = new Map<string, FlatObject[]>();

export function registerLoadedMapGeometry(cacheKey: string, geometry: CpuMapGeometry): void {
  geometryReady.set(cacheKey, geometry);
  cpuGeometryCache.set(cacheKey, Promise.resolve(geometry));
}

export async function getOrBuildCpuGeometry(
  cacheKey: string,
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): Promise<CpuMapGeometry> {
  const registered = geometryReady.get(cacheKey);
  if (registered) return registered;

  let pending = cpuGeometryCache.get(cacheKey);
  if (!pending) {
    pending = import('@/wad/renderer/geometry/buildMapGeometryCpu').then(({ buildMapGeometryCpu }) =>
      buildMapGeometryCpu(map, texturesByName)
    );
    cpuGeometryCache.set(cacheKey, pending);
    pending
      .then((geometry) => geometryReady.set(cacheKey, geometry))
      .catch(() => cpuGeometryCache.delete(cacheKey));
  }
  return pending;
}

export async function getOrBuildSubsectorFlats(
  cacheKey: string,
  map: WadMap,
  bspRenderIndex: BspRenderIndex
): Promise<FlatObject[]> {
  let pending = subsectorFlatCache.get(cacheKey);
  if (!pending) {
    pending = import('@/wad/renderer/geometry/mapToSubsectorFlats').then(({ mapToSubsectorFlats }) =>
      mapToSubsectorFlats(map, bspRenderIndex)
    );
    subsectorFlatCache.set(cacheKey, pending);
    pending
      .then((flats) => flatsReady.set(cacheKey, flats))
      .catch(() => subsectorFlatCache.delete(cacheKey));
  }
  return pending;
}

export function prewarmPathTraceScene(
  wadPath: string | null | undefined,
  mapName: string,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers
): void {
  const geomKey = mapLoadCacheKey(wadPath, mapName);
  void getOrBuildCpuGeometry(geomKey, map, texturesByName);
  if (buffers.bspRenderIndex) {
    void getOrBuildSubsectorFlats(geomKey, map, buffers.bspRenderIndex);
  }
}

export async function awaitPathTraceGeometryReady(
  wadPath: string | null | undefined,
  mapName: string,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers
): Promise<void> {
  const geomKey = mapLoadCacheKey(wadPath, mapName);
  await getOrBuildCpuGeometry(geomKey, map, texturesByName);
  if (buffers.bspRenderIndex) {
    await getOrBuildSubsectorFlats(geomKey, map, buffers.bspRenderIndex);
  }
}

export function isPathTraceSceneReady(wadPath: string | null | undefined, mapName: string): boolean {
  const geomKey = mapLoadCacheKey(wadPath, mapName);
  return geometryReady.has(geomKey);
}

export function buildSceneTrianglesSync(
  wadPath: string | null | undefined,
  mapName: string,
  map: WadMap,
  drawState: GzdoomDrawState,
  buffers: MapBuffers,
  sceneOptions?: SceneTriangleBuildOptions
): SceneTriangle[] | null {
  if (!buffers.walls.length) return null;
  return buildSceneTriangles(map, buffers, drawState, sceneOptions);
}

export async function buildSceneTrianglesForFrame(
  wadPath: string | null | undefined,
  mapName: string,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  drawState: GzdoomDrawState,
  buffers: MapBuffers
) {
  const geomKey = mapLoadCacheKey(wadPath, mapName);
  await getOrBuildCpuGeometry(geomKey, map, texturesByName);
  if (buffers.bspRenderIndex) {
    await getOrBuildSubsectorFlats(geomKey, map, buffers.bspRenderIndex);
  }
  return buildSceneTriangles(map, buffers, drawState);
}

export function clearRtglResourceCache(): void {
  cpuGeometryCache.clear();
  subsectorFlatCache.clear();
  geometryReady.clear();
  flatsReady.clear();
}
