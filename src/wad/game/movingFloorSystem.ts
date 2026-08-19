import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import type { LineDef } from '@/wad/interfaces/LineDef';
import type { Sector } from '@/wad/interfaces/Sector';
import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  findHighestFloorSurrounding,
  findLowestFloorSurrounding,
} from './floorSurrounding';
import { getMovingFloorSpecial, type MovingFloorDef } from './movingFloorSpecials';

export type MovingFloorPhase = 'down' | 'wait' | 'up';

export interface ActiveMovingFloor {
  sectorIndex: number;
  sector: Sector;
  speed: number;
  phase: MovingFloorPhase;
  waitRemaining: number;
  waitAtSeconds: number;
  floorHigh: number;
  floorLow: number;
}

export interface MovingFloorTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playStart: boolean;
}

const HEIGHT_EPS = 0.5;

export class MovingFloorSystem {
  private readonly movers = new Map<number, ActiveMovingFloor>();
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

  getActiveCount(): number {
    return this.movers.size;
  }

  getActiveSectorIndices(): ReadonlySet<number> {
    return new Set(this.movers.keys());
  }

  stopByTag(tag: number): boolean {
    if (tag === 0) return false;
    let stopped = false;
    for (const [sectorIndex, mover] of this.movers) {
      if (this.map.SECTORS[sectorIndex]?.tag === tag) {
        this.movers.delete(sectorIndex);
        this.markDirty(sectorIndex);
        stopped = true;
      }
    }
    return stopped;
  }

  tryWalkLine(lineIndex: number, line: LineDef): MovingFloorTriggerResult {
    const def = getMovingFloorSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.triggerLine(lineIndex, line, def);
  }

  tick(dt: number): { playStart: boolean } {
    let playStart = false;
    for (const mover of this.movers.values()) {
      const prev = mover.sector.floorheight;
      if (mover.phase === 'wait') {
        mover.waitRemaining -= dt;
        if (mover.waitRemaining <= 0) {
          mover.phase = 'up';
          playStart = true;
        }
        continue;
      }

      const delta = mover.speed * dt;
      if (mover.phase === 'down') {
        mover.sector.floorheight = Math.max(mover.sector.floorheight - delta, mover.floorLow);
        if (mover.sector.floorheight <= mover.floorLow + HEIGHT_EPS) {
          mover.sector.floorheight = mover.floorLow;
          mover.phase = 'wait';
          mover.waitRemaining = mover.waitAtSeconds;
        }
      } else {
        mover.sector.floorheight = Math.min(mover.sector.floorheight + delta, mover.floorHigh);
        if (mover.sector.floorheight >= mover.floorHigh - HEIGHT_EPS) {
          mover.sector.floorheight = mover.floorHigh;
          mover.phase = 'down';
          playStart = true;
        }
      }

      if (Math.abs(mover.sector.floorheight - prev) > HEIGHT_EPS) {
        this.markDirty(mover.sectorIndex);
      }
    }
    return { playStart };
  }

  private triggerLine(
    lineIndex: number,
    line: LineDef,
    def: MovingFloorDef
  ): MovingFloorTriggerResult {
    if (def.action === 'stop') {
      const stopped = this.stopByTag(line.tag ?? 0);
      if (!stopped) return emptyResult();
      if (def.repeat === 'once') this.usedOnceLines.add(lineIndex);
      return { triggered: true, playSwitch: false, playStart: false };
    }

    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    let triggered = false;
    for (const { sectorIndex, sector } of sectors) {
      if (this.startMovingFloor(sectorIndex, sector, def)) triggered = true;
    }

    if (triggered && def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return triggered
      ? { triggered: true, playSwitch: false, playStart: true }
      : emptyResult();
  }

  private startMovingFloor(sectorIndex: number, sector: Sector, def: MovingFloorDef): boolean {
    if (this.movers.has(sectorIndex)) return false;

    const floorLow = findLowestFloorSurrounding(this.map, sectorIndex);
    let floorHigh = findHighestFloorSurrounding(this.map, sectorIndex) - 8;
    if (floorHigh <= floorLow + HEIGHT_EPS) {
      floorHigh = sector.ceilingheight - 8;
    }

    this.movers.set(sectorIndex, {
      sectorIndex,
      sector,
      speed: def.speed,
      phase: 'down',
      waitRemaining: 0,
      waitAtSeconds: def.waitSeconds > 0 ? def.waitSeconds : 3,
      floorHigh,
      floorLow,
    });
    this.markDirty(sectorIndex);
    return true;
  }

  private markDirty(sectorIndex: number): void {
    this.dirty = true;
    this.dirtySectorIndices.add(sectorIndex);
  }

  private resolveTargetSectors(
    line: LineDef,
    def: MovingFloorDef
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

function emptyResult(): MovingFloorTriggerResult {
  return { triggered: false, playSwitch: false, playStart: false };
}
