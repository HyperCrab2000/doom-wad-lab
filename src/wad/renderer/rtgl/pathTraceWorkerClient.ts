import type { SceneTriangle } from './buildSceneTriangles';
import type { CpuTextureAtlas } from './textureAtlas';
import {
  mat4ToFloat32,
  serializeColorMap,
  serializeCpuAtlas,
  type PathTraceWorkerRequest,
  type PathTraceWorkerResponse,
} from './pathTraceSerialize';

type TraceComplete = (result: {
  pixels: Uint8Array;
  width: number;
  height: number;
  traceMs: number;
} | { error: string }) => void;

let worker: Worker | null = null;
let nextId = 1;
let pending = false;
let onComplete: TraceComplete | null = null;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./pathTrace.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PathTraceWorkerResponse>) => {
      pending = false;
      const cb = onComplete;
      onComplete = null;
      if (!cb) return;
      const msg = event.data;
      if (msg.error || !msg.pixels) {
        cb({ error: msg.error ?? 'Path trace worker failed' });
        return;
      }
      cb({ pixels: msg.pixels, width: msg.width ?? 0, height: msg.height ?? 0, traceMs: msg.traceMs ?? 0 });
    };
    worker.onerror = () => {
      pending = false;
      const cb = onComplete;
      onComplete = null;
      cb?.({ error: 'Path trace worker crashed' });
    };
  }
  return worker;
}

export interface PathTraceJob {
  triangles: SceneTriangle[];
  invViewProj: Float32Array;
  width: number;
  height: number;
  sectorLight: Float32Array;
  wallColors: ReadonlyMap<string, [number, number, number]>;
  floorColors: ReadonlyMap<string, [number, number, number]>;
  atlas: CpuTextureAtlas | null;
}

export function isPathTraceWorkerBusy(): boolean {
  return pending;
}

export function queuePathTrace(job: PathTraceJob, complete: TraceComplete): boolean {
  if (pending) return false;
  pending = true;
  onComplete = complete;

  const id = nextId++;
  const request: PathTraceWorkerRequest = {
    id,
    type: 'trace',
    triangles: job.triangles,
    invViewProj: job.invViewProj,
    width: job.width,
    height: job.height,
    sectorLight: job.sectorLight,
    wallColors: serializeColorMap(job.wallColors),
    floorColors: serializeColorMap(job.floorColors),
    atlas: job.atlas ? serializeCpuAtlas(job.atlas) : null,
  };

  ensureWorker().postMessage(request);
  return true;
}

export function terminatePathTraceWorker(): void {
  worker?.terminate();
  worker = null;
  pending = false;
  onComplete = null;
}

export { mat4ToFloat32 };
