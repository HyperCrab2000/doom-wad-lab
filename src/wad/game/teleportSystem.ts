import { DOOM_THING_TYPES } from '@/wad/constants/doomThingTypes';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { doomAngleToYaw } from '@/wad/renderer/controls/playerView';
import { getTeleportSpecial } from './teleportSpecials';

export interface TeleportDestination {
  x: number;
  y: number;
  yaw: number;
  sectorIndex: number;
}

export interface TeleportTriggerResult {
  triggered: boolean;
  playTeleport: boolean;
  destination?: TeleportDestination;
}

const TELEPORT_LANDING = DOOM_THING_TYPES.TELEPORT_LANDING;

export class TeleportSystem {
  private readonly usedOnceLines = new Set<number>();

  constructor(private readonly map: WadMap) {}

  tryWalkLine(lineIndex: number, line: LineDef, isPlayer: boolean): TeleportTriggerResult {
    const def = getTeleportSpecial(line.special);
    if (!def || def.activation !== 'walk') {
      return emptyResult();
    }
    if (!isPlayer && !def.allowMonsters) {
      return emptyResult();
    }
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) {
      return emptyResult();
    }

    const tag = line.tag ?? 0;
    if (tag === 0) return emptyResult();

    const destination = findTeleportDestination(this.map, tag);
    if (!destination) return emptyResult();

    if (def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return {
      triggered: true,
      playTeleport: true,
      destination,
    };
  }

}

export function findTeleportDestination(map: WadMap, lineTag: number): TeleportDestination | null {
  const taggedSectors: number[] = [];
  for (let i = 0; i < map.SECTORS.length; i++) {
    if (map.SECTORS[i]?.tag === lineTag) taggedSectors.push(i);
  }
  if (taggedSectors.length === 0) return null;

  const matches: TeleportDestination[] = [];
  for (const thing of map.THINGS) {
    if (thing.type !== TELEPORT_LANDING) continue;
    const sectorIndex = findSectorIndexContainingPoint(map, thing.x, thing.y, taggedSectors);
    if (sectorIndex < 0) continue;
    matches.push({
      x: thing.x,
      y: thing.y,
      yaw: doomAngleToYaw(thing.angle),
      sectorIndex,
    });
  }

  return matches[0] ?? null;
}

function findSectorIndexContainingPoint(
  map: WadMap,
  x: number,
  y: number,
  allowedSectors: number[]
): number {
  for (const sectorIndex of allowedSectors) {
    const bounds = sectorBounds(map, sectorIndex);
    if (!bounds) continue;
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      return sectorIndex;
    }
  }
  return -1;
}

function sectorBounds(
  map: WadMap,
  sectorIndex: number
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex]?.sector !== sectorIndex) continue;
      for (const vertexIndex of [line.v1, line.v2]) {
        const vertex = map.VERTEXES[vertexIndex];
        if (!vertex) continue;
        found = true;
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
    }
  }

  return found ? { minX, maxX, minY, maxY } : null;
}

function emptyResult(): TeleportTriggerResult {
  return { triggered: false, playTeleport: false };
}
