interface VoxelMesh {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
  uvs: Float32Array;
}

type Slab = {
  x: number;
  y: number;
  slabs: { zTop: number; zLength: number; colors: number[] }[];
};

export function loadKvxBuffer(buffer: ArrayBuffer) {
  const dv = new DataView(buffer);

  let ptr = 0;
  const numBytes = dv.getUint32(ptr, true);
  ptr += 4;
  const xSize = dv.getUint32(ptr, true);
  ptr += 4;
  const ySize = dv.getUint32(ptr, true);
  ptr += 4;
  const zSize = dv.getUint32(ptr, true);
  ptr += 4;
  const pivotX = dv.getUint32(ptr, true) / 256;
  ptr += 4;
  const pivotY = dv.getUint32(ptr, true) / 256;
  ptr += 4;
  const pivotZ = dv.getUint32(ptr, true) / 256;
  ptr += 4;
  const slabSectionOffset = dv.getUint32(ptr, true);
  ptr += 4;

  const totalColumns = xSize * ySize;
  const offsetTable: number[] = [];

  // ✅ Read column offsets correctly (row-major corrected to column-major)
  for (let i = 0; i < totalColumns; i++) {
    const relativeSlabOffset = dv.getUint32(ptr, true);
    offsetTable.push(relativeSlabOffset + slabSectionOffset);
    ptr += 4;
  }

  console.log({
    numBytes,
    xSize,
    ySize,
    zSize,
    pivotX,
    pivotY,
    pivotZ,
    slabSectionOffset,
    totalColumns,
    offsetTable,
  });

  const slabData: Slab[] = [];
  const voxelMap = new Map<string, number>();

  // ✅ Column-major parsing fixed (y first, then x)
  for (let y = 0; y < ySize; y++) {
    for (let x = 0; x < xSize; x++) {
      const slabOffset = offsetTable[y + x * ySize];
      if (slabOffset < slabSectionOffset || slabOffset >= dv.byteLength - 4) continue;

      let slabPtr = slabOffset;
      const slabs: { zTop: number; zLength: number; colors: number[] }[] = [];
      const seenZTop = new Set<number>();

      while (slabPtr + 4 < dv.byteLength) {
        const zTop = dv.getUint8(slabPtr++);
        const zLength = dv.getUint8(slabPtr++);
        const slabBackface = dv.getUint8(slabPtr++);

        if (zLength === 0 || slabPtr + zLength > dv.byteLength) break;

        if (seenZTop.has(zTop)) {
          slabPtr += zLength;
          continue;
        }

        seenZTop.add(zTop);

        const colors: number[] = [];
        for (let zi = 0; zi < zLength; zi++) {
          const colorIndex = dv.getUint8(slabPtr++);
          colors.push(colorIndex);
        }

        // ✅ Flip colors for backface slabs (critical!)
        if (slabBackface !== 0) {
          colors.reverse();
        }

        for (let zi = 0; zi < zLength; zi++) {
          const colorIndex = colors[zi];

          // ✅ Corrected pivot offsets and axis order
          const xPos = x - pivotX;
          const yPos = zTop + zi - pivotZ;
          const zPos = y - pivotY;

          voxelMap.set(`${xPos},${yPos},${zPos}`, colorIndex);
        }

        slabs.push({ zTop, zLength, colors });
      }

      if (slabs.length > 0) {
        slabData.push({ x, y, slabs });
      }
    }
  }

  // ✅ Build voxel mesh correctly after slab parsing
  const mesh = buildVoxelMesh(voxelMap, xSize, ySize, zSize);
  return {
    mesh,
    meta: { xSize, ySize, zSize, pivotX, pivotY, pivotZ, slabData },
    voxelMap,
  };
}

// 🧱 Build voxel mesh with corrected axis and voxel map
export function buildVoxelMesh(
  voxelMap: Map<string, number>,
  xSize: number,
  ySize: number,
  zSize: number
): VoxelMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const solidMap = voxelMap;

  const exposedFaces = [
    { n: [1, 0, 0], d: [1, 0, 0] },
    { n: [-1, 0, 0], d: [-1, 0, 0] },
    { n: [0, 1, 0], d: [0, 1, 0] },
    { n: [0, -1, 0], d: [0, -1, 0] },
    { n: [0, 0, 1], d: [0, 0, 1] },
    { n: [0, 0, -1], d: [0, 0, -1] },
  ];

  // ✅ Generate cube for each voxel
  solidMap.forEach((color, key) => {
    const [x, y, z] = key.split(',').map(Number);
    const pos = [x, y, z];

    const exposed = exposedFaces.map(({ d }) => {
      const neighborKey = `${x + d[0]},${y + d[1]},${z + d[2]}`;
      return !solidMap.has(neighborKey);
    });

    if (exposed.some(Boolean)) {
      addCube(vertices, indices, normals, uvs, pos, exposed);
    }
  });

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

// 🎯 Add a cube at the correct position with correct normals and UVs
function addCube(
  verts: number[],
  inds: number[],
  norms: number[],
  uvs: number[],
  pos: number[],
  exposed: boolean[]
) {
  const half = 0.5;
  const faces = [
    { n: [1, 0, 0], corners: [[half, -half, -half], [half, -half, half], [half, half, half], [half, half, -half]] },
    { n: [-1, 0, 0], corners: [[-half, -half, half], [-half, -half, -half], [-half, half, -half], [-half, half, half]] },
    { n: [0, 1, 0], corners: [[-half, half, half], [half, half, half], [half, half, -half], [-half, half, -half]] },
    { n: [0, -1, 0], corners: [[-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half]] },
    { n: [0, 0, 1], corners: [[-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]] },
    { n: [0, 0, -1], corners: [[half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half]] },
  ];

  for (let i = 0; i < faces.length; i++) {
    if (!exposed[i]) continue;

    const face = faces[i];
    const start = verts.length / 3;
    for (const corner of face.corners) {
      verts.push(pos[0] + corner[0], pos[1] + corner[1], pos[2] + corner[2]);
      norms.push(...face.n);
      uvs.push(0, 0);
    }

    inds.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}
