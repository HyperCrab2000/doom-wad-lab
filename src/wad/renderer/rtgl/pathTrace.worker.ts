import { mat4 } from 'gl-matrix';

import { renderPathTraceCpu } from './pathTraceCpu';
import {
  deserializeColorMap,
  deserializeCpuAtlas,
  type PathTraceWorkerRequest,
  type PathTraceWorkerResponse,
} from './pathTraceSerialize';

self.onmessage = (event: MessageEvent<PathTraceWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'trace') return;

  const started = performance.now();
  try {
    const inv = mat4.create();
    mat4.set(inv, msg.invViewProj);
    const atlas = msg.atlas ? deserializeCpuAtlas(msg.atlas) : null;
    const pixels = renderPathTraceCpu(
      msg.triangles,
      inv,
      {
        atlas,
        wallColors: deserializeColorMap(msg.wallColors),
        floorColors: deserializeColorMap(msg.floorColors),
      },
      msg.sectorLight,
      msg.width,
      msg.height
    );

    const response: PathTraceWorkerResponse = {
      id: msg.id,
      type: 'traced',
      pixels,
      width: msg.width,
      height: msg.height,
      traceMs: performance.now() - started,
    };
    self.postMessage(response, [pixels.buffer]);
  } catch (error) {
    const response: PathTraceWorkerResponse = {
      id: msg.id,
      type: 'traced',
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};
