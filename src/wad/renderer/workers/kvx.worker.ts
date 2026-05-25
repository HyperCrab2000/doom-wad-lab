import { parseKvxSlab6Full } from '@/wad/parser/kvxLoader';
import { buildKvxSurfaceMesh } from '@/wad/voxels/kvxMesh';
import { getVoxelFloorLift, getVoxelSpanHeight } from '@/wad/parser/kvxLoader';

export interface KvxWorkerResult {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  height: number;
  floorLift: number;
  indexType: number;
  indexCount: number;
}

interface WorkerRequest {
  id: number;
  type: 'build';
  buffer: ArrayBuffer;
}

interface WorkerResponse {
  id: number;
  type: 'built';
  result?: KvxWorkerResult;
  error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, buffer } = event.data;
  if (type !== 'build') return;

  try {
    const model = parseKvxSlab6Full(buffer);
    const mesh = buildKvxSurfaceMesh(model);
    const result: KvxWorkerResult = {
      positions: mesh.positions,
      colors: mesh.colors,
      indices: mesh.indices,
      height: getVoxelSpanHeight(model),
      floorLift: getVoxelFloorLift(model),
      indexType: mesh.indices instanceof Uint32Array ? 5125 : 5123,
      indexCount: mesh.indices.length,
    };

    self.postMessage(
      { id, type: 'built', result },
      [result.positions.buffer, result.colors.buffer, result.indices.buffer]
    );
  } catch (error) {
    self.postMessage({
      id,
      type: 'built',
      error: error instanceof Error ? error.message : 'KVX worker failed',
    });
  }
};

export {};
