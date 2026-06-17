import type { GzstateDocument } from '@hypercrab2000/doom-wad-core';

export interface FederatedWasmInstance {
  init(): number;
  validateGzstate(ptr: number, len: number): number;
  setCounts(vertices: number, sectors: number): void;
  clearState(): void;
  getVertexCount(): number;
  getSectorCount(): number;
  isLoaded(): number;
  tick(): number;
  memory: WebAssembly.Memory;
  copyGzstateBytes(bytes: Uint8Array): number;
}

export interface FederatedMapState {
  mapName: string;
  gzstate: GzstateDocument;
  gzstateBytes: Uint8Array;
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
