// kvxLoader.ts
export function loadKvxBuffer(buffer: ArrayBuffer) {
  const dv = new DataView(buffer);
  const palette = new Uint8Array(buffer, buffer.byteLength - 768, 768);

  const numbytes = dv.getUint32(0, true);
  const xsiz = dv.getUint32(4, true);
  const ysiz = dv.getUint32(8, true);
  const zsiz = dv.getUint32(12, true);
  const xpiv = dv.getUint32(16, true) / 256;
  const ypiv = dv.getUint32(20, true) / 256;
  const zpiv = dv.getUint32(24, true) / 256;

  const xstartOffset = 28;
  const xstartSize = (xsiz + 1) * 4;
  const xyoffsSize = xsiz * (ysiz + 1) * 2;

  const xstart = new Uint32Array(buffer, xstartOffset, xsiz + 1);
  const xyoffs = new Uint16Array(buffer, xstartOffset + xstartSize, xsiz * (ysiz + 1));

  const slabDataOffset = xstartOffset + xstartSize + xyoffsSize;

  const voxelMap = new Map<string, number>();
  const colorRGB = new Map<number, string>();

  for (let i = 0; i < 256; i++) {
    const r = palette[i * 3 + 0] * 4;
    const g = palette[i * 3 + 1] * 4;
    const b = palette[i * 3 + 2] * 4;
    colorRGB.set(i, `rgb(${r},${g},${b})`);
  }

  for (let x = 0; x < xsiz; x++) {
    const yBase = x * (ysiz + 1);
    for (let y = 0; y < ysiz; y++) {
      const slabStart = xyoffs[yBase + y];
      const slabEnd = xyoffs[yBase + y + 1];

      let slabPtr = slabDataOffset + slabStart;
      const end = slabDataOffset + slabEnd;

      while (slabPtr < end) {
        const ztop = dv.getUint8(slabPtr++);
        const zlen = dv.getUint8(slabPtr++);
        slabPtr++; // Skip vis byte

        for (let zi = 0; zi < zlen; zi++) {
          const col = dv.getUint8(slabPtr++);
          voxelMap.set(`${x},${y},${ztop + zi}`, col);
        }
      }
    }
  }

  return {
    voxelMap,
    meta: {
      xSize: xsiz,
      ySize: ysiz,
      zSize: zsiz,
      pivotX: xpiv,
      pivotY: ypiv,
      pivotZ: zpiv,
    },
    getColor: (index: number) => colorRGB.get(index) || "#FF00FF",
  };
}
