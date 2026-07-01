import type { FramesByThingNameMap } from '@/wad/renderer/renderGame/types';
import type { RenderableThing } from '@/wad/renderer/renderGame/renderableThings';
import { FRUSTUM_CULL_RADIUS } from '@/wad/constants/RenderInfo';
import { extractFrustumPlanes, isSphereInFrustum } from '@/wad/renderer/utils/frustumCull';
import { hasVoxelDefinitionForSprite } from '@/wad/voxels/voxelCatalog';
import type { SceneTriangle } from './buildSceneTriangles';
import { MAX_TRACE_TRIANGLES, SURFACE_SPRITE } from './pathTraceConstants';

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function pushSpriteQuad(
  out: SceneTriangle[],
  center: [number, number, number],
  right: [number, number, number],
  up: [number, number, number],
  halfWidth: number,
  halfHeight: number,
  sectorIndex: number,
  texName: string
): void {
  if (out.length + 2 > MAX_TRACE_TRIANGLES) return;

  const rw = [right[0] * halfWidth, right[1] * halfWidth, right[2] * halfWidth];
  const uh = [up[0] * halfHeight, up[1] * halfHeight, up[2] * halfHeight];

  const bl: [number, number, number] = [
    center[0] - rw[0] - uh[0],
    center[1] - rw[1] - uh[1],
    center[2] - rw[2] - uh[2],
  ];
  const br: [number, number, number] = [
    center[0] + rw[0] - uh[0],
    center[1] + rw[1] - uh[1],
    center[2] + rw[2] - uh[2],
  ];
  const tl: [number, number, number] = [
    center[0] - rw[0] + uh[0],
    center[1] - rw[1] + uh[1],
    center[2] - rw[2] + uh[2],
  ];
  const tr: [number, number, number] = [
    center[0] + rw[0] + uh[0],
    center[1] + rw[1] + uh[1],
    center[2] + rw[2] + uh[2],
  ];

  out.push({
    v0: bl,
    v1: br,
    v2: tl,
    uv0: [0, 1],
    uv1: [1, 1],
    uv2: [0, 0],
    sectorIndex,
    texName,
    surfaceKind: SURFACE_SPRITE,
  });
  out.push({
    v0: tl,
    v1: br,
    v2: tr,
    uv0: [0, 0],
    uv1: [1, 1],
    uv2: [1, 0],
    sectorIndex,
    texName,
    surfaceKind: SURFACE_SPRITE,
  });
}

export function appendSpriteTriangles(
  out: SceneTriangle[],
  renderableThings: readonly RenderableThing[],
  sortedFramesByThingName: FramesByThingNameMap,
  animateSpriteIndex: number,
  cameraPos: [number, number, number],
  modelViewProjMatrix: Float32Array | number[],
  visibleSectors: ReadonlySet<number>
): void {
  if (out.length >= MAX_TRACE_TRIANGLES || renderableThings.length === 0) return;

  const frustum = extractFrustumPlanes(modelViewProjMatrix as never);
  const entries: Array<{ entry: RenderableThing; distanceSq: number }> = [];

  for (const entry of renderableThings) {
    if (out.length >= MAX_TRACE_TRIANGLES) return;
    if (!visibleSectors.has(entry.sectorIndex)) continue;

    const { thingObj, thingSector } = entry;
    if (
      !isSphereInFrustum(
        frustum,
        thingObj.x,
        thingSector.floorheight + 32,
        -thingObj.y,
        FRUSTUM_CULL_RADIUS
      )
    ) {
      continue;
    }

    const dx = thingObj.x - cameraPos[0];
    const dz = -thingObj.y - cameraPos[2];
    entries.push({ entry, distanceSq: dx * dx + dz * dz });
  }

  entries.sort((a, b) => b.distanceSq - a.distanceSq);

  for (const { entry } of entries) {
    if (out.length >= MAX_TRACE_TRIANGLES) return;

    const { thingObj, thingIndex, thingType, thingSector, sectorIndex } = entry;
    if (!thingType.sprite) continue;
    if (hasVoxelDefinitionForSprite(thingType.sprite)) continue;

    const spriteObj = sortedFramesByThingName[thingType.sprite];
    if (!spriteObj) continue;

    const dx = thingObj.x - cameraPos[0];
    const dy = -thingObj.y - cameraPos[2];
    let spriteDirAngle = Math.atan2(dy, dx) + Math.PI / 8;
    if (spriteDirAngle < 0) spriteDirAngle += Math.PI * 2;
    const dirIndex = Math.floor(spriteDirAngle / (Math.PI / 4)) + 1;

    const spriteFrames = spriteObj[dirIndex] || spriteObj[parseInt(Object.keys(spriteObj)[0]!, 10)];
    if (!spriteFrames) continue;

    const frameIds = Object.keys(spriteFrames).map(Number).sort((a, b) => a - b);
    if (frameIds.length === 0) continue;
    const frameId = frameIds[(animateSpriteIndex + thingIndex) % frameIds.length]!;
    const thingSprite = spriteFrames[frameId];
    if (!thingSprite?.sprite) continue;

    const thingYPos = thingType.isFloater
      ? thingSector.ceilingheight - thingSprite.sprite.height / 2
      : thingSector.floorheight + thingSprite.sprite.height / 2;

    const center: [number, number, number] = [thingObj.x, thingYPos, -thingObj.y];
    const toCam = normalize3([
      cameraPos[0] - center[0],
      cameraPos[1] - center[1],
      cameraPos[2] - center[2],
    ]);
    let right = cross([0, 1, 0], toCam);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-4) {
      right = [1, 0, 0];
    }
    right = normalize3(right);
    const up = normalize3(cross(toCam, right));

    pushSpriteQuad(
      out,
      center,
      right,
      up,
      thingSprite.sprite.width / 2,
      thingSprite.sprite.height / 2,
      sectorIndex,
      thingSprite.sprite.name
    );
  }
}
