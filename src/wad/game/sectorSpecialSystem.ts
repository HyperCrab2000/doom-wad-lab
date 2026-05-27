import type { WadMap } from '@/wad/interfaces/WadMap';
import { getSectorTimedDoor } from './sectorSpecialRuntime';

interface TimedDoorState {
  sectorIndex: number;
  mode: 'close' | 'open';
  speed: number;
  targetCeiling: number;
  active: boolean;
}

export class SectorSpecialSystem {
  private levelTime = 0;
  private readonly timedDoors: TimedDoorState[] = [];
  private dirty = false;
  private readonly dirtySectors = new Set<number>();

  constructor(private readonly map: WadMap) {
    map.SECTORS.forEach((sector, sectorIndex) => {
      const spec = getSectorTimedDoor(sector.type);
      if (!spec) return;
      this.timedDoors.push({
        sectorIndex,
        mode: spec.mode,
        speed: spec.speed,
        targetCeiling:
          spec.mode === 'close' ? sector.floorheight : sector.ceilingheight + 128,
        active: false,
      });
    });
  }

  getTimedDoorCount(): number {
    return this.timedDoors.length;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
    this.dirtySectors.clear();
  }

  getDirtySectors(): ReadonlySet<number> {
    return this.dirtySectors;
  }

  tick(dt: number): void {
    if (this.timedDoors.length === 0) return;
    this.levelTime += dt;

    for (const door of this.timedDoors) {
      const spec = getSectorTimedDoor(this.map.SECTORS[door.sectorIndex]?.type ?? -1);
      if (!spec) continue;

      if (!door.active && this.levelTime >= spec.delaySeconds) {
        door.active = true;
        const sector = this.map.SECTORS[door.sectorIndex];
        door.targetCeiling =
          door.mode === 'close' ? sector.floorheight : sector.ceilingheight + 128;
      }

      if (!door.active) continue;

      const sector = this.map.SECTORS[door.sectorIndex];
      const delta = door.speed * dt * (door.mode === 'close' ? -1 : 1);
      const next = sector.ceilingheight + delta;

      if (door.mode === 'close') {
        sector.ceilingheight = Math.max(door.targetCeiling, next);
        if (sector.ceilingheight <= door.targetCeiling + 0.01) {
          sector.ceilingheight = door.targetCeiling;
          door.active = false;
        }
      } else {
        sector.ceilingheight = Math.min(door.targetCeiling, next);
        if (sector.ceilingheight >= door.targetCeiling - 0.01) {
          sector.ceilingheight = door.targetCeiling;
          door.active = false;
        }
      }

      this.dirty = true;
      this.dirtySectors.add(door.sectorIndex);
    }
  }
}
