import { buildMapGeometryCpu, CpuMapGeometry } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WallTexture } from '@/wad/interfaces/WallTexture';

export type SerializableWallTexture = Pick<WallTexture, 'name' | 'width' | 'height' | 'transparent'>;

export interface GeometryWorkerRequest {
  type: 'build';
  map: WadMap;
  texturesByName: Record<string, SerializableWallTexture>;
}

export interface GeometryWorkerResponse {
  type: 'built';
  geometry: CpuMapGeometry;
}

type WorkerMessage = GeometryWorkerRequest | GeometryWorkerResponse;

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (geometry: CpuMapGeometry) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<GeometryWorkerResponse & { id?: number; error?: string }>) => {
      const { id, type, geometry, error } = event.data;
      if (id == null) return;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (type === 'built' && geometry) {
        entry.resolve(geometry);
      } else {
        entry.reject(new Error(error ?? 'Geometry worker failed'));
      }
    };
    worker.onerror = (event) => {
      for (const entry of pending.values()) {
        entry.reject(new Error(event.message));
      }
      pending.clear();
    };
  }
  return worker;
}

export function buildMapGeometryInWorker(
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): Promise<CpuMapGeometry> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(buildMapGeometryCpu(map, texturesByName));
  }

  const id = ++requestId;
  const serializableTextures = Object.fromEntries(
    Object.entries(texturesByName).map(([name, texture]) => [
      name,
      {
        name: texture.name,
        width: texture.width,
        height: texture.height,
        transparent: Boolean(texture.transparent),
      },
    ])
  );

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({
      id,
      type: 'build',
      map,
      texturesByName: serializableTextures,
    } satisfies GeometryWorkerRequest & { id: number });
  });
}

export function terminateGeometryWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
