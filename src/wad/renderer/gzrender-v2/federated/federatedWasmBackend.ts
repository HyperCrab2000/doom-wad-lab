import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';

import { loadGzstateFromWad } from './stateLoader';
import { clearFederatedWasmInstanceCache, loadFederatedWasmInstance } from './wasmHost';
import { drawFederatedWebGl2Frame } from './webgl2Backend';
import type { FederatedMapState, FederatedWasmDebugInfo } from './types';

let mapState: FederatedMapState | null = null;
let loadError: string | undefined;

export async function prewarmFederatedWasmMap(
  wad: Wad,
  mapName: string,
  _map: WadMap,
): Promise<void> {
  loadError = undefined;
  try {
    const wasm = await loadFederatedWasmInstance();
    const { doc, bytes } = loadGzstateFromWad(wad, mapName);
    wasm.clearState();
    const ptr = wasm.copyGzstateBytes(bytes);
    const valid = wasm.validateGzstate(ptr, bytes.byteLength);
    if (!valid) {
      throw new Error('WASM rejected GZSTATE buffer (bad magic or version)');
    }
    wasm.setCounts(doc.vertices.length, doc.sectors.length);
    mapState = {
      mapName: doc.header.mapName,
      gzstate: doc,
      gzstateBytes: bytes,
      wasmLoaded: wasm.isLoaded() === 1,
    };
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    mapState = null;
    throw err;
  }
}

export function drawFederatedWasmFrame(params: DrawSceneParams): void {
  if (!mapState) {
    throw new Error(loadError ?? 'Federated WASM map not loaded');
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
      error: loadError ?? 'not loaded',
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
    error: loadError,
  };
}

export function resetFederatedWasmBackend(): void {
  mapState = null;
  loadError = undefined;
  clearFederatedWasmInstanceCache();
}

export function getFederatedMapState(): FederatedMapState | null {
  return mapState;
}
