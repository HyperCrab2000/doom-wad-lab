import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import {
  DOOR_SPEED_UNITS_PER_SEC,
  DoorAction,
  DoorSpecialDef,
  getDoorSpecial,
} from './lineSpecials';

export type DoorMoveDirection = 'down' | 'up' | 'wait';

export interface ActiveDoor {
  sectorIndex: number;
  sector: Sector;
  /** Fully open ceiling height (lowest neighboring ceiling minus 4). */
  topHeight: number;
  /** Closed ceiling height (floor level). */
  bottomHeight: number;
  speed: number;
  direction: DoorMoveDirection;
  waitRemaining: number;
  /** Seconds to wait at the top before closing (openWaitClose). */
  waitAtTopSeconds: number;
  action: DoorAction;
  staysOpen: boolean;
  sound: DoorSpecialDef['sound'];
}

export interface DoorTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playOpen: boolean;
  playClose: boolean;
  sound: DoorSpecialDef['sound'];
}

const HEIGHT_EPS = 1;

export class DoorSystem {
  private readonly doors = new Map<number, ActiveDoor>();
  private readonly usedOnceLines = new Set<number>();
  private dirty = false;
  private readonly dirtySectorIndices = new Set<number>();

  constructor(private readonly map: WadMap) {}

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
    this.dirtySectorIndices.clear();
  }

  getDirtySectors(): ReadonlySet<number> {
    return this.dirtySectorIndices;
  }

  getActiveDoorCount(): number {
    return this.doors.size;
  }

  tryUseLine(lineIndex: number, line: LineDef): DoorTriggerResult {
    const def = getDoorSpecial(line.special);
    if (!def || def.activation !== 'switch') {
      return emptyResult();
    }
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) {
      return emptyResult();
    }

    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    let triggered = false;
    let motion: 'open' | 'close' | null = null;
    for (const { sectorIndex, sector } of sectors) {
      const nextMotion = this.startDoorAction(sectorIndex, sector, def);
      if (nextMotion) {
        triggered = true;
        motion = nextMotion;
      }
    }

    if (triggered && def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return triggered ? triggerResult(def, motion, true) : emptyResult();
  }

  tryWalkLine(lineIndex: number, line: LineDef): DoorTriggerResult {
    const def = getDoorSpecial(line.special);
    if (!def || def.activation !== 'walk') {
      return emptyResult();
    }
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) {
      return emptyResult();
    }

    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    let triggered = false;
    let motion: 'open' | 'close' | null = null;
    for (const { sectorIndex, sector } of sectors) {
      const nextMotion = this.startDoorAction(sectorIndex, sector, def);
      if (nextMotion) {
        triggered = true;
        motion = nextMotion;
      }
    }

    if (triggered && def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return triggered ? triggerResult(def, motion, false) : emptyResult();
  }

  tick(dt: number): { playOpen: boolean; playClose: boolean; sound: DoorSpecialDef['sound'] | null } {
    let playOpen = false;
    let playClose = false;
    let sound: DoorSpecialDef['sound'] | null = null;

    for (const door of this.doors.values()) {
      if (door.direction === 'wait') {
        door.waitRemaining -= dt;
        if (door.waitRemaining <= 0) {
          if (door.action === 'openWaitClose') {
            door.direction = 'down';
            door.waitRemaining = 0;
            playClose = true;
            sound = door.sound;
          } else if (door.action === 'closeWaitOpen') {
            door.direction = 'up';
            door.waitRemaining = 0;
            playOpen = true;
            sound = door.sound;
          } else if (door.staysOpen) {
            this.doors.delete(door.sectorIndex);
          }
        }
        continue;
      }

      const previous = door.sector.ceilingheight;
      if (door.direction === 'down') {
        door.sector.ceilingheight -= door.speed * dt;
        if (door.sector.ceilingheight <= door.bottomHeight) {
          door.sector.ceilingheight = door.bottomHeight;
          const motionSound = this.finishDoorMove(door, 'down');
          if (motionSound === 'open') playOpen = true;
          if (motionSound === 'close') playClose = true;
          if (motionSound) sound = door.sound;
        }
      } else if (door.direction === 'up') {
        door.sector.ceilingheight += door.speed * dt;
        if (door.sector.ceilingheight >= door.topHeight) {
          door.sector.ceilingheight = door.topHeight;
          const motionSound = this.finishDoorMove(door, 'up');
          if (motionSound === 'open') playOpen = true;
          if (motionSound === 'close') playClose = true;
          if (motionSound) sound = door.sound;
        }
      }

      if (door.sector.ceilingheight !== previous) {
        this.markSectorAndNeighborsDirty(door.sectorIndex);
      }
    }

    return { playOpen, playClose, sound };
  }

  private finishDoorMove(door: ActiveDoor, direction: DoorMoveDirection): 'open' | 'close' | null {
    if (direction === 'down') {
      if (door.action === 'openWaitClose') {
        this.doors.delete(door.sectorIndex);
        return 'close';
      }
      if (door.action === 'closeWaitOpen') {
        door.direction = 'wait';
        door.waitRemaining = door.waitAtTopSeconds;
        return null;
      }
      this.doors.delete(door.sectorIndex);
      return 'close';
    }

    if (direction === 'up') {
      if (door.action === 'openWaitClose') {
        door.direction = 'wait';
        door.waitRemaining = door.waitAtTopSeconds;
        return null;
      }
      if (door.action === 'closeWaitOpen') {
        this.doors.delete(door.sectorIndex);
        return 'open';
      }
      if (door.staysOpen) {
        this.doors.delete(door.sectorIndex);
        return 'open';
      }
      this.doors.delete(door.sectorIndex);
      return 'open';
    }

    return null;
  }

  private startDoorAction(
    sectorIndex: number,
    sector: Sector,
    def: DoorSpecialDef
  ): 'open' | 'close' | null {
    const topHeight = computeDoorTopHeight(this.map, sectorIndex, sector);
    const bottomHeight = sector.floorheight;
    const speed = DOOR_SPEED_UNITS_PER_SEC[def.speed];
    const existing = this.doors.get(sectorIndex);

    const closed = sector.ceilingheight <= bottomHeight + HEIGHT_EPS;
    const open = sector.ceilingheight >= topHeight - HEIGHT_EPS;

    if (existing?.direction === 'wait') {
      if (def.action === 'openWaitClose' && open) {
        existing.direction = 'down';
        existing.waitRemaining = 0;
        this.markSectorAndNeighborsDirty(sectorIndex);
        return 'close';
      }
      if (def.action === 'closeWaitOpen' && closed) {
        existing.direction = 'up';
        existing.waitRemaining = 0;
        this.markSectorAndNeighborsDirty(sectorIndex);
        return 'open';
      }
      return null;
    }

    if (existing) return null;

    let direction: DoorMoveDirection | null = null;
    let staysOpen = false;

    switch (def.action) {
      case 'open':
        if (open) return null;
        direction = 'up';
        staysOpen = true;
        break;
      case 'close':
        if (closed) return null;
        direction = 'down';
        break;
      case 'openWaitClose':
        if (closed) direction = 'up';
        else if (open) direction = 'down';
        else direction = 'up';
        break;
      case 'closeWaitOpen':
        if (open) direction = 'down';
        else if (closed) direction = 'up';
        else direction = 'down';
        break;
    }

    if (!direction) return null;

    this.doors.set(sectorIndex, {
      sectorIndex,
      sector,
      topHeight,
      bottomHeight,
      speed,
      direction,
      waitRemaining: def.waitSeconds,
      waitAtTopSeconds: def.waitSeconds,
      action: def.action,
      staysOpen,
      sound: def.sound,
    });
    this.markSectorAndNeighborsDirty(sectorIndex);
    return direction === 'up' ? 'open' : 'close';
  }

  private markSectorAndNeighborsDirty(sectorIndex: number): void {
    this.dirty = true;
    this.dirtySectorIndices.add(sectorIndex);
    for (const line of this.map.LINEDEFS) {
      for (const sideIndex of line.sidenum) {
        if (sideIndex < 0) continue;
        if (this.map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
        for (const otherSideIndex of line.sidenum) {
          if (otherSideIndex < 0) continue;
          const neighbor = this.map.SIDEDEFS[otherSideIndex].sector;
          if (neighbor !== sectorIndex) {
            this.dirtySectorIndices.add(neighbor);
          }
        }
        break;
      }
    }
  }

  private resolveTargetSectors(line: LineDef, def: DoorSpecialDef): Array<{ sectorIndex: number; sector: Sector }> {
    if (def.remote) {
      const tag = line.tag ?? 0;
      if (tag === 0) return [];
      return this.map.SECTORS.map((sector, sectorIndex) => ({ sector, sectorIndex })).filter(
        ({ sector }) => sector.tag === tag
      );
    }

    const back = getLineSector(this.map, line, 1);
    if (!back) return [];
    const sectorIndex = this.map.SECTORS.indexOf(back);
    if (sectorIndex < 0) return [];
    return [{ sectorIndex, sector: back }];
  }
}

function computeDoorTopHeight(map: WadMap, sectorIndex: number, sector: Sector): number {
  let neighborCeiling = Number.POSITIVE_INFINITY;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      const side = map.SIDEDEFS[sideIndex];
      if (side.sector !== sectorIndex) continue;
      const otherSideIndex = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSideIndex < 0) continue;
      const otherSector = map.SECTORS[map.SIDEDEFS[otherSideIndex].sector];
      if (otherSector) {
        neighborCeiling = Math.min(neighborCeiling, otherSector.ceilingheight);
      }
    }
  }
  if (!Number.isFinite(neighborCeiling)) {
    neighborCeiling = sector.ceilingheight;
  }
  return Math.max(sector.floorheight + HEIGHT_EPS, neighborCeiling - 4);
}

function triggerResult(
  def: DoorSpecialDef,
  motion: 'open' | 'close' | null,
  playSwitch = true
): DoorTriggerResult {
  return {
    triggered: true,
    playSwitch,
    playOpen: motion === 'open',
    playClose: motion === 'close',
    sound: def.sound,
  };
}

function emptyResult(): DoorTriggerResult {
  return {
    triggered: false,
    playSwitch: false,
    playOpen: false,
    playClose: false,
    sound: 'door',
  };
}
