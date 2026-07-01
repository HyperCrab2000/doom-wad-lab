import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';

import { loadGzstateFromWad } from './stateLoader';
import { clearFederatedWasmInstanceCache, loadFederatedWasmInstance } from './wasmHost';
import { drawFederatedWebGl2Frame } from './webgl2Backend';
import type { FederatedWasmDebugInfo } from './types';
import {
  getFederatedLoadError,
  getFederatedMapState,
  resetFederatedMapState,
  setFederatedLoadError,
  setFederatedMapState,
} from './mapStateStore';
import { gzstateToWadMap } from './gzstateToWadMap';

export async function prewarmFederatedWasmMap(
  wad: Wad,
  mapName: string,
  _map: WadMap,
): Promise<void> {
  setFederatedLoadError(undefined);
  try {
    const wasm = await loadFederatedWasmInstance();
    const { doc, bytes } = loadGzstateFromWad(wad, mapName);
    wasm.clearState();
    const ptr = wasm.copyGzstateBytes(bytes);
    const valid = wasm.validateGzstate(ptr, bytes.byteLength);
    if (!valid) {
      throw new Error('WASM rejected GZSTATE buffer (bad magic, version, or parse failure)');
    }
    const fullParse = wasm.hasFullGzstateParse?.() ?? false;
    if (!fullParse && wasm.getVertexCount() === 0) {
      wasm.setCounts?.(doc.vertices.length, doc.sectors.length);
    }
    const vertexCount = wasm.getVertexCount();
    const sectorCount = wasm.getSectorCount();
    if (vertexCount !== doc.vertices.length || sectorCount !== doc.sectors.length) {
      throw new Error(
        `WASM GZSTATE counts mismatch: wasm ${vertexCount}/${sectorCount} vs doc ${doc.vertices.length}/${doc.sectors.length}`,
      );
    }
    if (fullParse && wasm.getLinedefCount && wasm.getLinedefCount() !== doc.linedefs.length) {
      throw new Error(
        `WASM linedef count mismatch: wasm ${wasm.getLinedefCount()} vs doc ${doc.linedefs.length}`,
      );
    }
    const rejectPresent = doc.mapReject != null && doc.mapReject.byteLength > 0;
    const blockmapPresent = doc.mapBlockmapRaw != null && doc.mapBlockmapRaw.byteLength > 0;
    const roundtripMap = gzstateToWadMap(doc);
    if (rejectPresent && !roundtripMap.REJECT) {
      throw new Error('GZSTATE wire missing REJECT after round-trip to WadMap');
    }
    if (blockmapPresent && !roundtripMap.BLOCKMAP) {
      throw new Error('GZSTATE wire missing BLOCKMAP after round-trip to WadMap');
    }
    setFederatedMapState({
      mapName: doc.header.mapName,
      gzstate: doc,
      gzstateBytes: bytes,
      gzstateMap: roundtripMap,
      wasmLoaded: wasm.isLoaded() === 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setFederatedLoadError(message);
    setFederatedMapState(null);
    throw err;
  }
}

export function drawFederatedWasmFrame(params: DrawSceneParams): void {
  if (!getFederatedMapState()) {
    throw new Error(getFederatedLoadError() ?? 'Federated WASM map not loaded');
  }
  const wasmPromise = loadFederatedWasmInstance();
  void wasmPromise.then((wasm) => wasm.tick());
  drawFederatedWebGl2Frame(params);
}

export function getFederatedWasmDebugInfo(): FederatedWasmDebugInfo | null {
  const drawStats =
    typeof window !== 'undefined'
      ? ((window as unknown as { __doomDrawStats?: Record<string, number> }).__doomDrawStats ?? null)
      : null;

  const mapState = getFederatedMapState();
  if (!mapState) {
    return {
      backend: 'wasm-federated',
      mapName: '',
      vertexCount: 0,
      sectorCount: 0,
      sectionCount: 0,
      wasmLoaded: false,
      voxelsDrawn: drawStats?.voxels,
      voxelsPending: drawStats?.voxelsPending,
      error: getFederatedLoadError() ?? 'not loaded',
    };
  }
  return {
    backend: 'wasm-federated',
    mapName: mapState.mapName,
    vertexCount: mapState.gzstate.vertices.length,
    sectorCount: mapState.gzstate.sectors.length,
    sectionCount: mapState.gzstate.sections.length,
    wasmLoaded: mapState.wasmLoaded,
    voxelsDrawn: drawStats?.voxels,
    voxelsPending: drawStats?.voxelsPending,
    error: getFederatedLoadError(),
  };
}

export function resetFederatedWasmBackend(): void {
  resetFederatedMapState();
  clearFederatedWasmInstanceCache();
}

export { getFederatedMapState } from './mapStateStore';
