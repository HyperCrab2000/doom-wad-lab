import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { getCrusherSpecial, CrusherDef } from './crusherSpecials';

export type CrusherPhase = 'closing' | 'waiting' | 'opening';

export interface ActiveCrusher {
  sectorIndex: number;
  sector: Sector;
  speed: number;
  phase: CrusherPhase;
  waitRemaining: number;
  floorOpen: number;
  ceilingOpen: number;
}

export interface CrusherTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playStart: boolean;
}

const GAP = 8;
const HEIGHT_EPS = 0.5;

export class CrusherSystem {
  private readonly crushers = new Map<number, ActiveCrusher>();
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

  getActiveCrusherCount(): number {
    return this.crushers.size;
  }

  getActiveSectorIndices(): ReadonlySet<number> {
    return new Set(this.crushers.keys());
  }

  tryUseLine(lineIndex: number, line: LineDef): CrusherTriggerResult {
    const def = getCrusherSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.triggerLine(lineIndex, line, def, true);
  }

  tryWalkLine(lineIndex: number, line: LineDef): CrusherTriggerResult {
    const def = getCrusherSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.triggerLine(lineIndex, line, def, false);
  }

  tick(dt: number): { playStart: boolean } {
    let playStart = false;

    for (const crusher of this.crushers.values()) {
      const prevFloor = crusher.sector.floorheight;
      const prevCeil = crusher.sector.ceilingheight;

      if (crusher.phase === 'waiting') {
        crusher.waitRemaining -= dt;
        if (crusher.waitRemaining <= 0) {
          crusher.phase = 'opening';
          playStart = true;
        }
        continue;
      }

      const delta = crusher.speed * dt;
      if (crusher.phase === 'closing') {
        crusher.sector.floorheight += delta;
        crusher.sector.ceilingheight -= delta;
        if (crusher.sector.ceilingheight - crusher.sector.floorheight <= GAP + HEIGHT_EPS) {
          crusher.sector.floorheight = crusher.sector.ceilingheight - GAP;
          crusher.phase = 'waiting';
          crusher.waitRemaining = 1;
        }
      } else {
        crusher.sector.floorheight = Math.max(crusher.sector.floorheight - delta, crusher.floorOpen);
        crusher.sector.ceilingheight = Math.min(crusher.sector.ceilingheight + delta, crusher.ceilingOpen);
        const floorDone = Math.abs(crusher.sector.floorheight - crusher.floorOpen) <= HEIGHT_EPS;
        const ceilDone = Math.abs(crusher.sector.ceilingheight - crusher.ceilingOpen) <= HEIGHT_EPS;
        if (floorDone && ceilDone) {
          this.crushers.delete(crusher.sectorIndex);
        }
      }

      if (
        Math.abs(crusher.sector.floorheight - prevFloor) > HEIGHT_EPS ||
        Math.abs(crusher.sector.ceilingheight - prevCeil) > HEIGHT_EPS
      ) {
        this.markDirty(crusher.sectorIndex);
      }
    }

    return { playStart };
  }

  stopCrushersByTag(tag: number): boolean {
    if (tag === 0) return false;
    let stopped = false;
    for (const sectorIndex of [...this.crushers.keys()]) {
      if (this.map.SECTORS[sectorIndex]?.tag === tag) {
        this.crushers.delete(sectorIndex);
        this.markDirty(sectorIndex);
        stopped = true;
      }
    }
    return stopped;
  }

  private triggerLine(
    lineIndex: number,
    line: LineDef,
    def: CrusherDef,
    playSwitch: boolean
  ): CrusherTriggerResult {
    if (def.action === 'stop') {
      const stopped = this.stopCrushersByTag(line.tag ?? 0);
      if (!stopped) return emptyResult();
      if (def.repeat === 'once') {
        this.usedOnceLines.add(lineIndex);
      }
      return { triggered: true, playSwitch, playStart: false };
    }

    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    let triggered = false;
    for (const { sectorIndex, sector } of sectors) {
      if (this.startCrusher(sectorIndex, sector, def)) triggered = true;
    }

    if (triggered && def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return triggered
      ? { triggered: true, playSwitch, playStart: true }
      : emptyResult();
  }

  /** Start crushing a sector (stairs, floor-up-then-crush). */
  startCrusherOnSector(sectorIndex: number, sector: Sector, speed = 35): boolean {
    if (this.crushers.has(sectorIndex)) return false;
    if (sector.ceilingheight - sector.floorheight <= GAP + HEIGHT_EPS) return false;
    this.crushers.set(sectorIndex, {
      sectorIndex,
      sector,
      speed,
      phase: 'closing',
      waitRemaining: 0,
      floorOpen: sector.floorheight,
      ceilingOpen: sector.ceilingheight,
    });
    this.markDirty(sectorIndex);
    return true;
  }

  private startCrusher(sectorIndex: number, sector: Sector, def: CrusherDef): boolean {
    return this.startCrusherOnSector(sectorIndex, sector, def.speed);
  }

  private markDirty(sectorIndex: number): void {
    this.dirty = true;
    this.dirtySectorIndices.add(sectorIndex);
  }

  private resolveTargetSectors(
    line: LineDef,
    def: CrusherDef
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

function emptyResult(): CrusherTriggerResult {
  return { triggered: false, playSwitch: false, playStart: false };
}
