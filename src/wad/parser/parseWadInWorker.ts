import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { Wad } from '@/wad/interfaces/Wad';

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (wad: Wad) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./wadParse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; wad?: Wad; error?: string }>) => {
      const { id, wad, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (wad) {
        entry.resolve(wad);
      } else {
        entry.reject(new Error(error ?? 'WAD parse worker failed'));
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

function parseOnMainThread(buffer: ArrayBuffer): Wad {
  return loadWadFromArrayBuffer(buffer.slice(0));
}

export function parseWadInWorker(buffer: ArrayBuffer): Promise<Wad> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(parseOnMainThread(buffer));
  }

  const id = ++requestId;
  const fallbackCopy = buffer.slice(0);
  const transferable = buffer.slice(0);

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject: (error) => {
        pending.delete(id);
        try {
          console.warn('[wad] worker parse failed, falling back to main thread:', error.message);
          terminateWadParseWorker();
          resolve(parseOnMainThread(fallbackCopy));
        } catch (fallbackError) {
          reject(error);
        }
      },
    });
    try {
      getWorker().postMessage({ id, buffer: transferable }, [transferable]);
    } catch (error) {
      pending.delete(id);
      try {
        resolve(parseOnMainThread(fallbackCopy));
      } catch (fallbackError) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
}

export function terminateWadParseWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
