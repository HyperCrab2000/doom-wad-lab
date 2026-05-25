import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';

interface WorkerRequest {
  id: number;
  buffer: ArrayBuffer;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer } = event.data;
  try {
    const wad = loadWadFromArrayBuffer(buffer);
    self.postMessage({ id, wad });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'WAD parse worker failed',
    });
  }
};

export {};
