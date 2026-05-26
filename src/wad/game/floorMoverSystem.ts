import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { FloorMoverDef, getFloorMoverSpecial } from './floorMoverSpecials';

export type MoverDirection = 'up' | 'down' | 'wait';

export interface ActiveFloorMover {
  sectorIndex: number;
  sector: Sector;
  kind: FloorMoverDef['kind'];
  speed: number;
  direction: MoverDirection;
  waitRemaining: number;
  floorTarget: number;
  ceilingTarget: number;
  /** Plat cycle: low → wait → high */
  platHigh: number;
  platLow: number;
  platPhase: 'down' | 'wait' | 'up' | 'idle';
  waitAtSeconds: number;
}

export interface MoverTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playStart: boolean;
  sound: FloorMoverDef['sound'];
}

const HEIGHT_EPS = 0.5;

export class FloorMoverSystem {
  private readonly movers = new Map<number, ActiveFloorMover>();
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

  getActiveMoverCount(): number {
    return this.movers.size;
  }

  tryUseLine(lineIndex: number, line: LineDef): MoverTriggerResult {
    const def = getFloorMoverSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.triggerLine(lineIndex, line, def, true);
  }

  tryWalkLine(lineIndex: number, line: LineDef): MoverTriggerResult {
    const def = getFloorMoverSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.triggerLine(lineIndex, line, def, false);
  }

  tick(dt: number): { playStart: boolean; sound: FloorMoverDef['sound'] } {
    let playStart = false;
    let sound: FloorMoverDef['sound'] = 'mover';

    for (const mover of this.movers.values()) {
      const prevFloor = mover.sector.floorheight;
      const prevCeil = mover.sector.ceilingheight;

      if (mover.direction === 'wait') {
        mover.waitRemaining -= dt;
        if (mover.waitRemaining <= 0) {
          if (mover.kind === 'plat' && mover.platPhase === 'wait') {
            mover.platPhase = 'up';
            mover.direction = 'up';
            mover.floorTarget = mover.platHigh;
            playStart = true;
          } else {
            this.movers.delete(mover.sectorIndex);
          }
        }
        continue;
      }

      const delta = mover.speed * dt;
      if (mover.direction === 'up') {
        mover.sector.floorheight = Math.min(
          mover.sector.floorheight + delta,
          mover.floorTarget
        );
        if (mover.kind !== 'plat') {
          mover.sector.ceilingheight = Math.min(
            mover.sector.ceilingheight + delta,
            mover.ceilingTarget
          );
        }
      } else {
        mover.sector.floorheight = Math.max(
          mover.sector.floorheight - delta,
          mover.floorTarget
        );
        if (mover.kind !== 'plat') {
          mover.sector.ceilingheight = Math.max(
            mover.sector.ceilingheight - delta,
            mover.ceilingTarget
          );
        }
      }

      if (
        Math.abs(mover.sector.floorheight - prevFloor) > HEIGHT_EPS ||
        Math.abs(mover.sector.ceilingheight - prevCeil) > HEIGHT_EPS
      ) {
        this.markDirty(mover.sectorIndex);
      }

      const floorDone =
        Math.abs(mover.sector.floorheight - mover.floorTarget) <= HEIGHT_EPS;
      const ceilDone =
        mover.kind === 'plat' ||
        Math.abs(mover.sector.ceilingheight - mover.ceilingTarget) <= HEIGHT_EPS;

      if (floorDone && ceilDone) {
        mover.sector.floorheight = mover.floorTarget;
        if (mover.kind !== 'plat') {
          mover.sector.ceilingheight = mover.ceilingTarget;
        }

        if (mover.kind === 'plat') {
          if (mover.platPhase === 'down') {
            mover.platPhase = 'wait';
            mover.direction = 'wait';
            mover.waitRemaining = mover.waitAtSeconds;
          } else if (mover.platPhase === 'up') {
            this.movers.delete(mover.sectorIndex);
          }
        } else {
          this.movers.delete(mover.sectorIndex);
        }
      }
    }

    return { playStart, sound };
  }

  private triggerLine(
    lineIndex: number,
    line: LineDef,
    def: FloorMoverDef,
    playSwitch: boolean
  ): MoverTriggerResult {
    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    let triggered = false;
    for (const { sectorIndex, sector } of sectors) {
      if (this.startMover(sectorIndex, sector, def)) {
        triggered = true;
      }
    }

    if (triggered && def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return triggered
      ? { triggered: true, playSwitch, playStart: true, sound: def.sound }
      : emptyResult();
  }

  private startMover(sectorIndex: number, sector: Sector, def: FloorMoverDef): boolean {
    if (this.movers.has(sectorIndex)) return false;

    const mover: ActiveFloorMover = {
      sectorIndex,
      sector,
      kind: def.kind,
      speed: def.speed,
      direction: 'up',
      waitRemaining: def.waitSeconds,
      floorTarget: sector.floorheight,
      ceilingTarget: sector.ceilingheight,
      platHigh: sector.floorheight,
      platLow: sector.floorheight,
      platPhase: 'idle',
      waitAtSeconds: def.waitSeconds > 0 ? def.waitSeconds : 3,
    };

    switch (def.kind) {
      case 'plat': {
        mover.platLow = lowestNeighborFloor(this.map, sectorIndex);
        mover.platHigh = highestNeighborFloor(this.map, sectorIndex) - 8;
        if (mover.platHigh <= mover.platLow + HEIGHT_EPS) {
          mover.platHigh = sector.ceilingheight - 8;
        }
        mover.platPhase = 'down';
        mover.direction = 'down';
        mover.floorTarget = mover.platLow;
        break;
      }
      case 'floorUp':
        mover.floorTarget = lowestNeighborCeiling(this.map, sectorIndex) - 8;
        mover.direction = 'up';
        break;
      case 'floorDown':
        mover.floorTarget = lowestNeighborFloor(this.map, sectorIndex);
        mover.direction = 'down';
        break;
      case 'ceilingDown':
        mover.ceilingTarget = sector.floorheight + 8;
        mover.direction = 'down';
        break;
      case 'ceilingUp':
        mover.ceilingTarget = highestNeighborCeiling(this.map, sectorIndex);
        mover.direction = 'up';
        break;
      default:
        return false;
    }

    this.movers.set(sectorIndex, mover);
    this.markDirty(sectorIndex);
    return true;
  }

  private markDirty(sectorIndex: number): void {
    this.dirty = true;
    this.dirtySectorIndices.add(sectorIndex);
    for (const line of this.map.LINEDEFS) {
      for (const sideIndex of line.sidenum) {
        if (sideIndex < 0) continue;
        if (this.map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
        for (const otherSide of line.sidenum) {
          if (otherSide < 0) continue;
          const neighbor = this.map.SIDEDEFS[otherSide].sector;
          if (neighbor !== sectorIndex) {
            this.dirtySectorIndices.add(neighbor);
          }
        }
        break;
      }
    }
  }

  private resolveTargetSectors(
    line: LineDef,
    def: FloorMoverDef
  ): Array<{ sectorIndex: number; sector: Sector }> {
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

function lowestNeighborFloor(map: WadMap, sectorIndex: number): number {
  let min = map.SECTORS[sectorIndex].floorheight;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      const other = map.SECTORS[map.SIDEDEFS[otherSide].sector];
      if (other) min = Math.min(min, other.floorheight);
    }
  }
  return min;
}

function highestNeighborFloor(map: WadMap, sectorIndex: number): number {
  let max = map.SECTORS[sectorIndex].floorheight;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      const other = map.SECTORS[map.SIDEDEFS[otherSide].sector];
      if (other) max = Math.max(max, other.floorheight);
    }
  }
  return max;
}

function lowestNeighborCeiling(map: WadMap, sectorIndex: number): number {
  let min = Number.POSITIVE_INFINITY;
  const sector = map.SECTORS[sectorIndex];
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      const other = map.SECTORS[map.SIDEDEFS[otherSide].sector];
      if (other) min = Math.min(min, other.ceilingheight);
    }
  }
  if (!Number.isFinite(min)) return sector.ceilingheight;
  return min;
}

function highestNeighborCeiling(map: WadMap, sectorIndex: number): number {
  let max = map.SECTORS[sectorIndex].ceilingheight;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      const other = map.SECTORS[map.SIDEDEFS[otherSide].sector];
      if (other) max = Math.max(max, other.ceilingheight);
    }
  }
  return max;
}

function emptyResult(): MoverTriggerResult {
  return { triggered: false, playSwitch: false, playStart: false, sound: 'mover' };
}
