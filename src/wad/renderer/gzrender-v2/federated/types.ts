import type { GzstateDocument } from '@hypercrab2000/doom-wad-core';
import type { WadMap } from '@/wad/interfaces/WadMap';

export interface FederatedWasmInstance {
  init(): number;
  validateGzstate(ptr: number, len: number): number;
  setCounts?(vertices: number, sectors: number): void;
  clearState(): void;
  getVertexCount(): number;
  getSectorCount(): number;
  getLinedefCount?(): number;
  getSegCount?(): number;
  getSectionCount?(): number;
  hasFullGzstateParse?(): boolean;
  isLoaded(): number;
  tick(): number;
  memory: WebAssembly.Memory;
  copyGzstateBytes(bytes: Uint8Array): number;
}

export interface FederatedMapState {
  mapName: string;
  gzstate: GzstateDocument;
  gzstateBytes: Uint8Array;
  gzstateMap: WadMap;
  wasmLoaded: boolean;
}

export interface FederatedWasmDebugInfo {
  backend: 'wasm-federated';
  mapName: string;
  vertexCount: number;
  sectorCount: number;
  sectionCount: number;
  wasmLoaded: boolean;
  voxelsDrawn?: number;
  voxelsPending?: number;
  error?: string;
}
