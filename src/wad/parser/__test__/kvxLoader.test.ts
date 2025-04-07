import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVoxelMesh, loadKvxModel } from '@/wad/parser/kvxLoader';

function createValidTestKvx(): ArrayBuffer {
  const headerSize = 4 + 2 + 2 + 2 + 2 + 4 * 3; // header + pivot
  const offsetTableSize = 4 * (2 * 2); // 2x2 columns
  const slabSize = 8; // simple slab

  const totalSize = headerSize + offsetTableSize + slabSize;
  const buffer = new ArrayBuffer(totalSize);
  const dv = new DataView(buffer);

  let ptr = 0;
  dv.setUint32(ptr, totalSize, true);
  ptr += 4;
  dv.setUint16(ptr, 2, true);
  ptr += 2; // xSize = 2
  dv.setUint16(ptr, 2, true);
  ptr += 2; // ySize = 2
  dv.setUint16(ptr, 4, true);
  ptr += 2; // zSize = 4
  ptr += 2; // dummy
  ptr += 4 * 3; // pivots

  const offsetBase = headerSize + offsetTableSize;
  for (let i = 0; i < 4; i++) {
    dv.setUint32(ptr, offsetBase, true);
    ptr += 4;
  }

  // Slab section
  dv.setUint8(offsetBase, 1); // slab count
  dv.setUint8(offsetBase + 1, 0); // dummy
  dv.setUint8(offsetBase + 2, 0); // zTop
  dv.setUint8(offsetBase + 3, 4); // zLength
  dv.setUint8(offsetBase + 4, 0); // dummy

  return buffer;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('kvxLoader', () => {
  it('should load valid KVX model', async () => {
    const buffer = createValidTestKvx();

    (global.fetch as any) = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(buffer),
    });

    const mesh = await loadKvxModel('/fake/valid.kvx');

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('should still process valid columns even if one offset is corrupt', async () => {
    const buffer = createValidTestKvx();
    const dv = new DataView(buffer);

    // Corrupt just one offset (first one)
    dv.setUint32(24, 9999999, true);

    (global.fetch as any) = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(buffer),
    });

    const mesh = await loadKvxModel('/fake/corrupt.kvx');

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('should handle truncated buffer gracefully', async () => {
    const buffer = createValidTestKvx();
    const shortBuffer = buffer.slice(0, buffer.byteLength - 5);

    (global.fetch as any) = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(shortBuffer),
    });

    const mesh = await loadKvxModel('/fake/truncated.kvx');

    expect(mesh.vertices.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });
});

describe('buildVoxelMesh', () => {
  it('should return empty mesh if no valid slabs', () => {
    const dummy = new DataView(new ArrayBuffer(64));
    const mesh = buildVoxelMesh(dummy, [0, 0, 0, 0], 2, 2, 4, 0, 0, 0);

    expect(mesh.vertices.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });
});
