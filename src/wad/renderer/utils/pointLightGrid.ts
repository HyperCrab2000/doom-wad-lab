import type { PointLight } from '@/wad/renderer/renderGame/sectorLighting';
import {
  EMPTY_LIGHT_UNIFORMS,
  type PrecomputedLightUniforms,
} from '@/wad/renderer/utils/precomputedLights';

const DEFAULT_CELL_SIZE = 384;
const MAX_NEAREST = 4;

interface GridEntry {
  light: PointLight;
  distanceSq: number;
}

/**
 * Uniform grid accelerates nearest point-light lookups (walls/flats/sprites each frame).
 */
export class PointLightGrid {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private cells = new Map<number, PointLight[]>();
  private readonly scratch: GridEntry[] = [];

  constructor(cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  rebuild(lights: readonly PointLight[]): void {
    this.clear();
    if (lights.length === 0) return;

    for (const light of lights) {
      const [x, y, z] = light.position;
      const radius = light.radius;
      const minCx = Math.floor((x - radius) * this.invCellSize);
      const maxCx = Math.floor((x + radius) * this.invCellSize);
      const minCz = Math.floor((z - radius) * this.invCellSize);
      const maxCz = Math.floor((z + radius) * this.invCellSize);
      const minCy = Math.floor((y - radius) * this.invCellSize);
      const maxCy = Math.floor((y + radius) * this.invCellSize);

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          for (let cz = minCz; cz <= maxCz; cz++) {
            const key = cellKey(cx, cy, cz);
            let bucket = this.cells.get(key);
            if (!bucket) {
              bucket = [];
              this.cells.set(key, bucket);
            }
            bucket.push(light);
          }
        }
      }
    }
  }

  queryUniforms(worldPos: [number, number, number]): PrecomputedLightUniforms {
    this.collectNearest(worldPos);
    if (this.scratch.length === 0) return EMPTY_LIGHT_UNIFORMS;
    return uniformsFromNearest(this.scratch);
  }

  /** Summed RGB contribution for voxel / billboard shaders that use a single vec3. */
  queryDynamicLight(worldPos: [number, number, number]): [number, number, number] {
    this.collectNearest(worldPos);
    let r = 0;
    let g = 0;
    let b = 0;
    for (const { light } of this.scratch) {
      const contribution = radialContribution(light, worldPos);
      r += contribution[0];
      g += contribution[1];
      b += contribution[2];
    }
    return [r, g, b];
  }

  private collectNearest(worldPos: [number, number, number]): void {
    this.scratch.length = 0;
    if (this.cells.size === 0) return;

    const cx = Math.floor(worldPos[0] * this.invCellSize);
    const cy = Math.floor(worldPos[1] * this.invCellSize);
    const cz = Math.floor(worldPos[2] * this.invCellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.cells.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          for (const light of bucket) {
            const distSq = distanceSq(light.position, worldPos);
            if (distSq > light.radius * light.radius) continue;
            insertNearest(this.scratch, light, distSq, MAX_NEAREST);
          }
        }
      }
    }
  }
}

function radialContribution(
  light: PointLight,
  worldPos: [number, number, number]
): [number, number, number] {
  const dist = Math.sqrt(distanceSq(light.position, worldPos));
  if (dist >= light.radius) {
    return [0, 0, 0];
  }

  const t = 1 - dist / light.radius;
  const falloff = t * t * (3 - 2 * t);
  const strength = light.intensity * falloff;
  return [
    light.color[0] * strength,
    light.color[1] * strength,
    light.color[2] * strength,
  ];
}

function cellKey(cx: number, cy: number, cz: number): number {
  return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) | 0;
}

function distanceSq(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function insertNearest(
  list: GridEntry[],
  light: PointLight,
  distanceSq: number,
  max: number
): void {
  if (list.length < max) {
    list.push({ light, distanceSq });
    if (list.length === max) {
      list.sort((a, b) => a.distanceSq - b.distanceSq);
    }
    return;
  }

  if (distanceSq >= list[max - 1].distanceSq) return;

  list[max - 1] = { light, distanceSq };
  list.sort((a, b) => a.distanceSq - b.distanceSq);
}

function uniformsFromNearest(nearest: GridEntry[]): PrecomputedLightUniforms {
  const uniforms: PrecomputedLightUniforms = {
    ...EMPTY_LIGHT_UNIFORMS,
    uPointLightCount: nearest.length,
  };

  nearest.forEach(({ light }, index) => {
    switch (index) {
      case 0:
        uniforms.uPointLightPosition0 = light.position;
        uniforms.uPointLightColor0 = light.color;
        uniforms.uPointLightRadius0 = light.radius;
        uniforms.uPointLightIntensity0 = light.intensity;
        break;
      case 1:
        uniforms.uPointLightPosition1 = light.position;
        uniforms.uPointLightColor1 = light.color;
        uniforms.uPointLightRadius1 = light.radius;
        uniforms.uPointLightIntensity1 = light.intensity;
        break;
      case 2:
        uniforms.uPointLightPosition2 = light.position;
        uniforms.uPointLightColor2 = light.color;
        uniforms.uPointLightRadius2 = light.radius;
        uniforms.uPointLightIntensity2 = light.intensity;
        break;
      case 3:
        uniforms.uPointLightPosition3 = light.position;
        uniforms.uPointLightColor3 = light.color;
        uniforms.uPointLightRadius3 = light.radius;
        uniforms.uPointLightIntensity3 = light.intensity;
        break;
      default:
        break;
    }
  });

  return uniforms;
}
