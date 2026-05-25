import { describe, expect, it } from 'vitest';
import { loadKvxSlab6Full } from '@/wad/parser/kvxLoader';

function createSingleVoxelKvx(): ArrayBuffer {
  const headerSize = 7 * 4;
  const xStartSize = 2 * 4;
  const xyOffsetsSize = 2 * 2;
  const slabSize = 4;
  const paletteSize = 768;
  const totalSize = headerSize + xStartSize + xyOffsetsSize + slabSize + paletteSize;

  const buffer = new ArrayBuffer(totalSize);
  const dv = new DataView(buffer);

  let ptr = 0;
  dv.setUint32(ptr, totalSize, true);
  ptr += 4;
  dv.setUint32(ptr, 1, true);
  ptr += 4;
  dv.setUint32(ptr, 1, true);
  ptr += 4;
  dv.setUint32(ptr, 1, true);
  ptr += 4;
  dv.setInt32(ptr, 0, true);
  ptr += 4;
  dv.setInt32(ptr, 0, true);
  ptr += 4;
  dv.setInt32(ptr, 0, true);
  ptr += 4;

  for (let i = 0; i < 2; i++) {
    dv.setUint32(ptr, 0, true);
    ptr += 4;
  }

  dv.setUint16(ptr, 0, true);
  ptr += 2;
  dv.setUint16(ptr, slabSize, true);
  ptr += 2;

  dv.setUint8(ptr, 0);
  ptr += 1;
  dv.setUint8(ptr, 1);
  ptr += 1;
  dv.setUint8(ptr, 0);
  ptr += 1;
  dv.setUint8(ptr, 1);
  ptr += 1;

  const paletteStart = totalSize - paletteSize;
  dv.setUint8(paletteStart + 3, 63);
  dv.setUint8(paletteStart + 4, 0);
  dv.setUint8(paletteStart + 5, 0);

  return buffer;
}

describe('kvxLoader', () => {
  it('loads a minimal Slab6-style KVX model', async () => {
    const model = await loadKvxSlab6Full(createSingleVoxelKvx());

    expect(model.xsiz).toBe(1);
    expect(model.ysiz).toBe(1);
    expect(model.zsiz).toBe(1);
    expect(model.voxdata).toHaveLength(1);
    expect(model.voxdata[0].vis).toBe(63);
    expect(model.getColor(1)).toBe('rgb(252,0,0)');
  });

  it('rejects invalid dimensions', async () => {
    const buffer = createSingleVoxelKvx();
    const dv = new DataView(buffer);
    dv.setUint32(4, 999, true);

    await expect(loadKvxSlab6Full(buffer)).rejects.toThrow('KVX too big');
  });
});
