import { skyFlats } from '@/wad/constants/WadInfo';

import { FlatObject } from '@/wad/interfaces/FlatObject';
import { Triangle } from '@/wad/interfaces/Triangle';
import { WadMap } from '@/wad/interfaces/WadMap';
import { vec3 } from 'gl-matrix';

export const createFlatMesh = (
  triangles: Array<Triangle>,
  height: number,
  reverseOrientation?: boolean
): Pick<FlatObject, 'position' | 'indices' | 'normal' | 'uv' | 'center' | 'boundsRadius'> => {
  const flatPositions: number[] = [];
  const flatIndices: number[] = [];
  const flatNormals: number[] = [];
  const flatUVs: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let pointCount = 0;

  let posIndex = 0;

  triangles.forEach((triangle) => {
    const p1: vec3 = vec3.fromValues(triangle[0].x, height, -triangle[0].y);
    const p2: vec3 = vec3.fromValues(triangle[1].x, height, -triangle[1].y);
    const p3: vec3 = vec3.fromValues(triangle[2].x, height, -triangle[2].y);

    const normal = computeNormal(p1, p2, p3);

    flatPositions.push(...p1, ...p2, ...p3);
    for (const point of [p1, p2, p3]) {
      sumX += point[0];
      sumY += point[1];
      sumZ += point[2];
      pointCount++;
    }
    flatNormals.push(...normal, ...normal, ...normal);

    // DOOM-style UVs: 1 texel = 1 world unit, repeat every 64
    flatUVs.push(
      triangle[0].x % 64, triangle[0].y % 64,
      triangle[1].x % 64, triangle[1].y % 64,
      triangle[2].x % 64, triangle[2].y % 64,
    );

    if (reverseOrientation) {
      flatIndices.push(posIndex + 2, posIndex + 1, posIndex);
    } else {
      flatIndices.push(posIndex, posIndex + 1, posIndex + 2);
    }

    posIndex += 3;
  });

  const center: [number, number, number] = pointCount
    ? [sumX / pointCount, sumY / pointCount, sumZ / pointCount]
    : [0, height, 0];

  let boundsRadius = 0;
  for (let i = 0; i < flatPositions.length; i += 3) {
    const dx = flatPositions[i] - center[0];
    const dy = flatPositions[i + 1] - center[1];
    const dz = flatPositions[i + 2] - center[2];
    boundsRadius = Math.max(boundsRadius, Math.hypot(dx, dy, dz));
  }

  return {
    position: new Float32Array(flatPositions),
    indices: new Uint16Array(flatIndices),
    normal: new Float32Array(flatNormals),
    uv: new Float32Array(flatUVs),
    center,
    boundsRadius,
  };
};

function computeNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
  const u = vec3.subtract(vec3.create(), p2, p1); // vector from p1 to p2
  const v = vec3.subtract(vec3.create(), p3, p1); // vector from p1 to p3
  const n = vec3.cross(vec3.create(), u, v);      // perpendicular vector
  return vec3.normalize(n, n);                    // unit length
}

export const mapToFlats = (
  map: WadMap,
  trianglesBySector: Record<number, Array<Triangle>>
): Array<FlatObject> => {
  const flats = new Array<FlatObject>();

  map.SECTORS.forEach((sector, sectorIndex) => {
    const triangles = trianglesBySector[sectorIndex];

    if (!triangles) {
      return;
    }

    //lightIntensity = Math.sin(lightIntensity * 1.57); //different easing

    //we need to add the triangles to the ceiling and the floor
    if (sector.ceilingheight > sector.floorheight) {
      if (skyFlats.indexOf(sector.floorpic) < 0) {
        flats.push({
          sector,
          sectorIndex,
          flatName: sector.floorpic,
          ...createFlatMesh(triangles, sector.floorheight, false),
        });
      }

      if (skyFlats.indexOf(sector.ceilingpic) < 0) {
        flats.push({
          sector,
          sectorIndex,
          flatName: sector.ceilingpic,
          ...createFlatMesh(triangles, sector.ceilingheight, true),
        });
      }
    }
  });

  return flats;
};
