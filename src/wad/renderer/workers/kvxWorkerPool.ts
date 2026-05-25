import { KvxWorkerResult } from './kvx.worker';

const POOL_SIZE = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));

interface PendingJob {
  resolve: (result: KvxWorkerResult) => void;
  reject: (error: Error) => void;
}

class KvxWorkerSlot {
  private worker: Worker;
  private busy = false;
  private pending: PendingJob | null = null;

  constructor() {
    this.worker = new Worker(new URL('./kvx.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ id: number; type: 'built'; result?: KvxWorkerResult; error?: string }>) => {
      const job = this.pending;
      this.pending = null;
      this.busy = false;
      if (!job) return;
      if (event.data.result) {
        job.resolve(event.data.result);
      } else {
        job.reject(new Error(event.data.error ?? 'KVX worker failed'));
      }
    };
    this.worker.onerror = (event) => {
      const job = this.pending;
      this.pending = null;
      this.busy = false;
      job?.reject(new Error(event.message));
    };
  }

  run(buffer: ArrayBuffer): Promise<KvxWorkerResult> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.busy = true;
      this.worker.postMessage({ id: 0, type: 'build', buffer }, [buffer]);
    });
  }

  get isBusy() {
    return this.busy;
  }

  terminate() {
    this.worker.terminate();
  }
}

class KvxWorkerPool {
  private slots: KvxWorkerSlot[] = [];
  private queue: Array<{ buffer: ArrayBuffer; resolve: (result: KvxWorkerResult) => void; reject: (error: Error) => void }> = [];

  constructor() {
    if (typeof Worker !== 'undefined') {
      for (let i = 0; i < POOL_SIZE; i++) {
        this.slots.push(new KvxWorkerSlot());
      }
    }
  }

  build(buffer: ArrayBuffer): Promise<KvxWorkerResult> {
    if (this.slots.length === 0) {
      return import('@/wad/parser/kvxLoader').then(async ({ loadKvxSlab6Full, getVoxelFloorLift, getVoxelSpanHeight }) => {
        const { buildKvxSurfaceMesh } = await import('@/wad/voxels/kvxMesh');
        const model = await loadKvxSlab6Full(buffer.slice(0));
        const mesh = buildKvxSurfaceMesh(model);
        return {
          positions: mesh.positions,
          colors: mesh.colors,
          indices: mesh.indices,
          height: getVoxelSpanHeight(model),
          floorLift: getVoxelFloorLift(model),
          indexType: mesh.indices instanceof Uint32Array ? 5125 : 5123,
          indexCount: mesh.indices.length,
        };
      });
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ buffer, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    while (this.queue.length > 0) {
      const slot = this.slots.find((entry) => !entry.isBusy);
      if (!slot) return;
      const job = this.queue.shift();
      if (!job) return;
      slot
        .run(job.buffer.slice(0))
        .then(job.resolve)
        .catch(job.reject)
        .finally(() => this.pump());
    }
  }

  terminate() {
    for (const slot of this.slots) {
      slot.terminate();
    }
    this.slots = [];
    this.queue = [];
  }
}

let pool: KvxWorkerPool | null = null;

export function buildKvxMeshInPool(buffer: ArrayBuffer): Promise<KvxWorkerResult> {
  pool ??= new KvxWorkerPool();
  return pool.build(buffer);
}

export function terminateKvxWorkerPool(): void {
  pool?.terminate();
  pool = null;
}
