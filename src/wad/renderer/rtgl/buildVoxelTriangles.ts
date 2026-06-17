import { mat4, vec3 } from 'gl-matrix';

import { ThingKind } from '@/wad/constants/ThingTypes';
import type { RenderableThing } from '@/wad/renderer/renderGame/renderableThings';
import type { VoxelThingFrameMap } from '@/wad/renderer/renderGame/voxelThingMeshes';
import type { SceneTriangle } from './buildSceneTriangles';
import { MAX_TRACE_TRIANGLES, SURFACE_WALL } from './pathTraceConstants';

const scratchModel = mat4.create();
const scratchPos = vec3.create();

function voxelThingYaw(
  thing: { x: number; y: number; type: number; angle: number },
  kind: ThingKind | undefined,
  timeSeconds: number
): number {
  const baseYaw = (thing.angle * Math.PI) / 180;
  if (
    kind === ThingKind.Pickup ||
    kind === ThingKind.Weapon ||
    kind === ThingKind.Key ||
    kind === ThingKind.Powerup ||
    kind === ThingKind.Artifact
  ) {
    const seed = ((thing.x * 13.37 + thing.y * 7.91 + thing.type * 3.17) % 360) * (Math.PI / 180);
    return seed + timeSeconds * 1.8;
  }
  return baseYaw;
}

function transformVertex(
  local: readonly [number, number, number],
  thingX: number,
  thingY: number,
  thingZ: number,
  yaw: number
): [number, number, number] {
  vec3.set(scratchPos, local[0], local[1], local[2]);
  mat4.identity(scratchModel);
  mat4.translate(scratchModel, scratchModel, [thingX, thingY, thingZ]);
  mat4.rotateY(scratchModel, scratchModel, Math.PI / 2 - yaw);
  vec3.transformMat4(scratchPos, scratchPos, scratchModel);
  return [scratchPos[0], scratchPos[1], scratchPos[2]];
}

function averageColor(
  colors: Float32Array,
  i0: number,
  i1: number,
  i2: number
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const idx of [i0, i1, i2]) {
    r += colors[idx * 3]!;
    g += colors[idx * 3 + 1]!;
    b += colors[idx * 3 + 2]!;
  }
  return [r / 3, g / 3, b / 3];
}

export function appendVoxelTriangles(
  out: SceneTriangle[],
  renderableThings: readonly RenderableThing[],
  voxelThingFrames: VoxelThingFrameMap,
  animateSpriteIndex: number,
  timeSeconds: number,
  visibleSectors: ReadonlySet<number>,
  paletteOut: Map<string, [number, number, number]>
): void {
  if (out.length >= MAX_TRACE_TRIANGLES || renderableThings.length === 0) return;

  for (const entry of renderableThings) {
    if (out.length >= MAX_TRACE_TRIANGLES) return;
    if (!visibleSectors.has(entry.sectorIndex)) continue;

    const { thingObj, thingType, thingSector, sectorIndex, thingIndex } = entry;
    if (!thingType.sprite) continue;

    const frames = voxelThingFrames.get(thingType.sprite);
    if (!frames?.length) continue;

    const frame = frames[(animateSpriteIndex + thingIndex) % frames.length];
    const mesh = frame?.mesh;
    if (!mesh || mesh.indexCount < 3) continue;

    const yaw = voxelThingYaw(thingObj, thingType.kind, timeSeconds);
    const baseY = thingSector.floorheight + mesh.floorLift;
    const thingX = thingObj.x;
    const thingZ = -thingObj.y;

    const positions = mesh.positions;
    const colors = mesh.colors;
    const indices = mesh.indices;

    for (let i = 0; i < indices.length; i += 3) {
      if (out.length >= MAX_TRACE_TRIANGLES) return;

      const i0 = indices[i]!;
      const i1 = indices[i + 1]!;
      const i2 = indices[i + 2]!;

      const v0 = transformVertex(
        [positions[i0 * 3]!, positions[i0 * 3 + 1]!, positions[i0 * 3 + 2]!],
        thingX,
        baseY,
        thingZ,
        yaw
      );
      const v1 = transformVertex(
        [positions[i1 * 3]!, positions[i1 * 3 + 1]!, positions[i1 * 3 + 2]!],
        thingX,
        baseY,
        thingZ,
        yaw
      );
      const v2 = transformVertex(
        [positions[i2 * 3]!, positions[i2 * 3 + 1]!, positions[i2 * 3 + 2]!],
        thingX,
        baseY,
        thingZ,
        yaw
      );

      const texName = `__voxel_${out.length}`;
      paletteOut.set(texName, averageColor(colors, i0, i1, i2));

      out.push({
        v0,
        v1,
        v2,
        uv0: [0, 0],
        uv1: [1, 0],
        uv2: [0, 1],
        sectorIndex,
        texName,
        surfaceKind: SURFACE_WALL,
      });
    }
  }
}
