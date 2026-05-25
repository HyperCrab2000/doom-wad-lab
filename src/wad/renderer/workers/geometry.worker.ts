import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { WadMap } from '@/wad/interfaces/WadMap';
import { SerializableWallTexture } from '@/wad/renderer/workers/geometryWorkerClient';

interface WorkerRequest {
  id: number;
  type: 'build';
  map: WadMap;
  texturesByName: Record<string, SerializableWallTexture>;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, map, texturesByName } = event.data;
  if (type !== 'build') return;

  try {
    const geometry = buildMapGeometryCpu(map, texturesByName as never);
    self.postMessage({ id, type: 'built', geometry });
  } catch (error) {
    self.postMessage({
      id,
      type: 'built',
      error: error instanceof Error ? error.message : 'Geometry worker failed',
    });
  }
};

export {};
