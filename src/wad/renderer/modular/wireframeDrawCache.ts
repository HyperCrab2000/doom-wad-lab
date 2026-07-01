import { createBuffer, createElementBuffer } from 'apl-easy-gl';

export function hashWallFlatDrawKey(
  wallDrawOrder: readonly { lineIndex: number; sideDefIndex: number }[],
  flatSubsectorOrder: readonly number[],
  salt = 0
): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (const entry of wallDrawOrder) {
    h ^= entry.lineIndex;
    h = Math.imul(h, 16777619);
    h ^= entry.sideDefIndex;
    h = Math.imul(h, 16777619);
  }
  for (const subsector of flatSubsectorOrder) {
    h ^= subsector;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface LineArrayCache {
  key: number;
  positions: number[];
  vertexCount: number;
}

interface IndexedLineCache {
  key: number;
  positions: number[];
  indices: number[];
  indexCount: number;
  vertexCount: number;
}

interface LineBufferCache {
  key: number;
  buffer: ReturnType<typeof createBuffer>;
  vertexCount: number;
}

interface IndexedBufferCache {
  key: number;
  posBuffer: ReturnType<typeof createBuffer>;
  idxBuffer: ReturnType<typeof createElementBuffer>;
  indexCount: number;
}

export function drawCachedLineArrays(
  gl: WebGL2RenderingContext,
  program: { setAttributes: (attrs: { aPosition: ReturnType<typeof createBuffer> }) => void },
  cache: { current: LineBufferCache | null },
  geomKey: number,
  positions: number[]
): number {
  const vertexCount = positions.length / 3;
  if (vertexCount === 0) return 0;

  if (!cache.current || cache.current.key !== geomKey || cache.current.vertexCount !== vertexCount) {
    cache.current = {
      key: geomKey,
      buffer: createBuffer(gl, new Float32Array(positions), 3),
      vertexCount,
    };
  }

  program.setAttributes({ aPosition: cache.current.buffer });
  gl.drawArrays(gl.LINES, 0, vertexCount);
  return vertexCount / 2;
}

export function drawCachedIndexedLines(
  gl: WebGL2RenderingContext,
  program: { setAttributes: (attrs: { aPosition: ReturnType<typeof createBuffer> }) => void },
  cache: { current: IndexedBufferCache | null },
  geomKey: number,
  positions: number[],
  indices: number[]
): number {
  const indexCount = indices.length;
  if (indexCount === 0) return 0;

  if (!cache.current || cache.current.key !== geomKey || cache.current.indexCount !== indexCount) {
    cache.current = {
      key: geomKey,
      posBuffer: createBuffer(gl, new Float32Array(positions), 3),
      idxBuffer: createElementBuffer(gl, new Uint16Array(indices), 1),
      indexCount,
    };
  }

  program.setAttributes({ aPosition: cache.current.posBuffer });
  cache.current.idxBuffer.draw(gl.LINES);
  return indexCount / 2;
}

export function retainLineArrayCache(
  store: { current: LineArrayCache | null },
  key: number,
  positions: number[]
): number[] {
  const vertexCount = positions.length / 3;
  if (store.current?.key === key && store.current.vertexCount === vertexCount) {
    return store.current.positions;
  }
  store.current = { key, positions, vertexCount };
  return positions;
}

export function retainIndexedLineCache(
  store: { current: IndexedLineCache | null },
  key: number,
  positions: number[],
  indices: number[]
): { positions: number[]; indices: number[] } {
  const indexCount = indices.length;
  if (
    store.current?.key === key &&
    store.current.indexCount === indexCount &&
    store.current.vertexCount === positions.length / 3
  ) {
    return { positions: store.current.positions, indices: store.current.indices };
  }
  store.current = {
    key,
    positions,
    indices,
    indexCount,
    vertexCount: positions.length / 3,
  };
  return { positions, indices };
}
