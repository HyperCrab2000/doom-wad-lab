import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import {
  playerHeight,
  playerMaxStepHeight,
  playerMinStepSpeed,
  playerStepSpeedRatio,
} from '@/wad/constants/GameInfo';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { Thing } from '@/wad/interfaces/Thing';
import { Vertex } from '@/wad/interfaces/Vertex';
import { WadMap } from '@/wad/interfaces/WadMap';

export interface BlockingSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BlockingCircle {
  x: number;
  y: number;
  radius: number;
}

export interface LineOpening {
  floor: number;
  ceiling: number;
  range: number;
}

/** Doom wiki: walk ~292 mu/s (cmd 25), run ~583 mu/s (cmd 50) at 35 tics/sec. */
export const DOOM_WALK_SPEED = 291.66;
export const DOOM_RUN_SPEED = 583.33;

export function getPlayerFeetZ(
  sector: Sector | null,
  worldFeetZ: number,
  grounded = false
): number {
  if (grounded && sector) {
    return sector.floorheight;
  }
  return worldFeetZ;
}

/** Move toward a target floor height at a capped rate (Doom-style step climbing). */
export function approachWorldHeight(
  current: number,
  target: number,
  maxDelta: number
): number {
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export function getGroundStepSpeed(horizontalSpeed: number): number {
  return Math.max(playerMinStepSpeed, horizontalSpeed * playerStepSpeedRatio);
}

export function getLineOpening(map: WadMap, line: LineDef): LineOpening | null {
  const front = getLineSector(map, line, 0);
  const back = getLineSector(map, line, 1);
  if (!front || !back) return null;

  const ceiling = Math.min(front.ceilingheight, back.ceilingheight);
  const floor = Math.max(front.floorheight, back.floorheight);

  return {
    floor,
    ceiling,
    range: ceiling - floor,
  };
}

export function isBlockingLineForPlayer(
  map: WadMap,
  line: LineDef,
  playerFeetZ: number
): boolean {
  if (line.flags.impassible || line.flags.blockAll) return true;
  if (!line.flags.twoSided || line.sidenum[1] < 0) return true;

  const opening = getLineOpening(map, line);
  if (!opening) return true;

  // Mirrors PTR_SlideTraverse / P_CheckPosition in p_map.c.
  if (opening.range < playerHeight) return true;
  if (opening.ceiling - playerFeetZ < playerHeight) return true;
  if (opening.floor - playerFeetZ > playerMaxStepHeight) return true;

  return false;
}

/** @deprecated Use isBlockingLineForPlayer with player feet Z. */
export function isBlockingLine(map: WadMap, line: LineDef): boolean {
  const front = getLineSector(map, line, 0);
  return isBlockingLineForPlayer(map, line, front?.floorheight ?? 0);
}

export function getLineSector(map: WadMap, line: LineDef, side: 0 | 1): Sector | null {
  const sideIndex = line.sidenum[side];
  if (sideIndex < 0) return null;
  const sideDef = map.SIDEDEFS[sideIndex];
  return sideDef ? map.SECTORS[sideDef.sector] : null;
}

export function isSectorWalkable(
  current: Sector | null,
  next: Sector,
  airborne: boolean
): boolean {
  if (next.ceilingheight - next.floorheight < playerHeight) return false;
  if (airborne) return true;
  if (!current) return true;

  const rise = next.floorheight - current.floorheight;
  return rise <= playerMaxStepHeight;
}

export function getDesiredVelocity(keys: Set<string>, yaw: number, moveSpeed: number) {
  let localX = 0;
  let localY = 0;

  if (keys.has('KeyW') || keys.has('ArrowUp')) localY += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) localY -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) localX -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) localX += 1;

  const length = Math.hypot(localX, localY);
  if (length === 0) return { x: 0, y: 0 };

  localX /= length;
  localY /= length;

  return {
    x: (Math.cos(yaw) * localY + Math.cos(yaw - Math.PI / 2) * localX) * moveSpeed,
    y: (Math.sin(yaw) * localY + Math.sin(yaw - Math.PI / 2) * localX) * moveSpeed,
  };
}

export function getBlockingSegments(map: WadMap, playerFeetZ: number): BlockingSegment[] {
  return map.LINEDEFS.filter((line) => isBlockingLineForPlayer(map, line, playerFeetZ)).map(
    (line) => {
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      return {
        x1: v1.x,
        y1: v1.y,
        x2: v2.x,
        y2: v2.y,
      };
    }
  );
}

let cachedSegments: BlockingSegment[] | null = null;
let cachedFeetZ = Number.NaN;
let cachedSectorIndex = -1;

export function getCachedBlockingSegments(map: WadMap, playerFeetZ: number, sectorIndex = -1): BlockingSegment[] {
  if (
    cachedSegments &&
    Math.abs(playerFeetZ - cachedFeetZ) < 0.5 &&
    sectorIndex === cachedSectorIndex
  ) {
    return cachedSegments;
  }
  cachedSegments = getBlockingSegments(map, playerFeetZ);
  cachedFeetZ = playerFeetZ;
  cachedSectorIndex = sectorIndex;
  return cachedSegments;
}

export function invalidateBlockingSegmentCache(): void {
  cachedSegments = null;
  cachedFeetZ = Number.NaN;
  cachedSectorIndex = -1;
}

/** Pickups, weapons, keys, and powerups are touch-only (vanilla MF_SPECIAL). */
export function isBlockingThingKind(kind: ThingKind | undefined): boolean {
  return (
    kind === ThingKind.Monster ||
    kind === ThingKind.Boss ||
    kind === ThingKind.Barrel ||
    kind === ThingKind.Decoration ||
    kind === ThingKind.Hazard
  );
}

function getThingCollisionHeight(kind: ThingKind | undefined): number {
  switch (kind) {
    case ThingKind.Pickup:
    case ThingKind.Weapon:
    case ThingKind.Key:
    case ThingKind.Powerup:
    case ThingKind.Artifact:
      return 32;
    case ThingKind.Barrel:
      return 42;
    default:
      return playerHeight;
  }
}

export function isBlockingThing(
  thing: Thing,
  playerFeetZ: number,
  thingFloorZ: number
): boolean {
  if (!hasValidFlags(thing)) return false;

  const thingType = DOOM_THING_MAP_BY_ID[thing.type];
  if (!thingType || thingType.radius <= 0) return false;
  if (!isBlockingThingKind(thingType.kind)) return false;
  if (thingType.kind === ThingKind.Decoration && thingType.sprite === 'PLAY') return false;

  const thingTop = thingFloorZ + getThingCollisionHeight(thingType.kind);
  const playerTop = playerFeetZ + playerHeight;
  if (playerFeetZ >= thingTop || playerTop <= thingFloorZ) return false;

  return true;
}

export function getBlockingCircles(
  map: WadMap,
  playerFeetZ: number,
  resolveSectorAt: (position: Vertex) => Sector | null,
  skipThing?: (thing: Thing) => boolean
): BlockingCircle[] {
  const circles: BlockingCircle[] = [];

  for (const thing of map.THINGS) {
    if (skipThing?.(thing)) continue;
    const thingType = DOOM_THING_MAP_BY_ID[thing.type];
    const thingFloorZ = resolveSectorAt({ x: thing.x, y: thing.y })?.floorheight ?? 0;
    if (!isBlockingThing(thing, playerFeetZ, thingFloorZ)) continue;

    circles.push({
      x: thing.x,
      y: thing.y,
      radius: thingType!.radius,
    });
  }

  return circles;
}

export function moveCircleAgainstSegments(
  position: Vertex,
  delta: Vertex,
  radius: number,
  segments: BlockingSegment[]
): Vertex {
  return moveCircleAgainstObstacles(position, delta, radius, segments, []);
}

export function moveCircleAgainstCircles(
  position: Vertex,
  delta: Vertex,
  playerRadius: number,
  circles: BlockingCircle[]
): Vertex {
  return moveCircleAgainstObstacles(position, delta, playerRadius, [], circles);
}

export function moveCircleAgainstObstacles(
  position: Vertex,
  delta: Vertex,
  playerRadius: number,
  segments: BlockingSegment[],
  circles: BlockingCircle[]
): Vertex {
  const next = {
    x: position.x + delta.x,
    y: position.y + delta.y,
  };

  // A few relaxation passes are enough for Doom-sized movement deltas and corners.
  for (let pass = 0; pass < 4; pass++) {
    for (const segment of segments) {
      pushCircleOffSegment(next, playerRadius, segment);
    }
    for (const circle of circles) {
      pushCircleOffCircle(next, playerRadius, circle, position);
    }
  }

  return next;
}

function pushCircleOffSegment(next: Vertex, radius: number, segment: BlockingSegment) {
  const closest = closestPointOnSegment(next, segment);
  const dx = next.x - closest.x;
  const dy = next.y - closest.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= radius) return;

  if (dist > 0.0001) {
    const push = radius - dist;
    next.x += (dx / dist) * push;
    next.y += (dy / dist) * push;
  } else {
    const sx = segment.x2 - segment.x1;
    const sy = segment.y2 - segment.y1;
    const len = Math.hypot(sx, sy) || 1;
    next.x += (-sy / len) * radius;
    next.y += (sx / len) * radius;
  }
}

function pushCircleOffCircle(
  next: Vertex,
  playerRadius: number,
  circle: BlockingCircle,
  origin: Vertex
) {
  let dx = next.x - circle.x;
  let dy = next.y - circle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = playerRadius + circle.radius;
  if (dist >= minDist) return;

  if (dist <= 0.0001) {
    dx = origin.x - circle.x;
    dy = origin.y - circle.y;
    if (Math.abs(dx) + Math.abs(dy) <= 0.0001) {
      dx = next.x - circle.x || 1;
      dy = next.y - circle.y;
    }
  }

  const len = Math.hypot(dx, dy) || 1;
  next.x = circle.x + (dx / len) * minDist;
  next.y = circle.y + (dy / len) * minDist;
}

function closestPointOnSegment(point: Vertex, segment: BlockingSegment): Vertex {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return { x: segment.x1, y: segment.y1 };
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSq)
  );

  return {
    x: segment.x1 + t * dx,
    y: segment.y1 + t * dy,
  };
}

export function isMovementKey(code: string) {
  return [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
    'Space',
  ].includes(code);
}

export function isShiftHeld(keys: Set<string>): boolean {
  return keys.has('ShiftLeft') || keys.has('ShiftRight');
}
