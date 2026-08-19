import type { WadMap } from '@/wad/interfaces/WadMap';
import { getAdjacentSectorIndices } from './sectorAdjacency';

/** Doom sector types that spawn passive lighting thinkers at map load (SpawnLights). */
const STROBE_FAST = 2;
const STROBE_SLOW = 3;
const BLINK_DAMAGE = 4;
const GLOW = 8;
const STROBE_SLOW_SYNC = 12;
const STROBE_FAST_SYNC = 13;

const STROBEBRIGHT = 5;
const FASTDARK = 15;
const SLOWDARK = 35;
const GLOWSPEED = 8;

function clampLight(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function findMinSurroundingLight(map: WadMap, sectorIndex: number, min: number): number {
  for (const neighbor of getAdjacentSectorIndices(map, sectorIndex)) {
    const level = map.SECTORS[neighbor]?.lightlevel ?? min;
    if (level < min) min = level;
  }
  return min;
}

interface GlowThinker {
  kind: 'glow';
  sectorIndex: number;
  direction: -1 | 1;
  maxLight: number;
  minLight: number;
}

interface StrobeThinker {
  kind: 'strobe';
  sectorIndex: number;
  count: number;
  maxLight: number;
  minLight: number;
  brightTime: number;
  darkTime: number;
}

type LightingThinker = GlowThinker | StrobeThinker;

function spawnStrobeThinker(
  map: WadMap,
  sectorIndex: number,
  brightTime: number,
  darkTime: number,
  inSync: boolean,
): StrobeThinker {
  const sector = map.SECTORS[sectorIndex];
  const maxLight = clampLight(sector.lightlevel);
  let minLight = clampLight(findMinSurroundingLight(map, sectorIndex, maxLight));
  if (minLight === maxLight) minLight = 0;

  return {
    kind: 'strobe',
    sectorIndex,
    brightTime,
    darkTime,
    maxLight,
    minLight,
    count: inSync ? 1 : ((sectorIndex * 17 + 3) & 7) + 1,
  };
}

export class SectorLightingThinkerSystem {
  private readonly thinkers: LightingThinker[] = [];
  private dirty = false;
  private readonly dirtySectors = new Set<number>();

  constructor(private readonly map: WadMap) {
    map.SECTORS.forEach((sector, sectorIndex) => {
      switch (sector.type) {
        case GLOW:
          this.thinkers.push({
            kind: 'glow',
            sectorIndex,
            direction: -1,
            maxLight: clampLight(sector.lightlevel),
            minLight: clampLight(findMinSurroundingLight(map, sectorIndex, sector.lightlevel)),
          });
          break;
        case STROBE_FAST:
        case BLINK_DAMAGE:
          this.thinkers.push(spawnStrobeThinker(map, sectorIndex, STROBEBRIGHT, FASTDARK, false));
          break;
        case STROBE_SLOW:
          this.thinkers.push(spawnStrobeThinker(map, sectorIndex, STROBEBRIGHT, SLOWDARK, false));
          break;
        case STROBE_SLOW_SYNC:
          this.thinkers.push(spawnStrobeThinker(map, sectorIndex, STROBEBRIGHT, SLOWDARK, true));
          break;
        case STROBE_FAST_SYNC:
          this.thinkers.push(spawnStrobeThinker(map, sectorIndex, STROBEBRIGHT, FASTDARK, true));
          break;
        default:
          break;
      }
    });
  }

  getThinkerCount(): number {
    return this.thinkers.length;
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

  tick(_dt: number): void {
    if (this.thinkers.length === 0) return;

    for (const thinker of this.thinkers) {
      const sector = this.map.SECTORS[thinker.sectorIndex];
      if (!sector) continue;

      if (thinker.kind === 'glow') {
        let newLight = sector.lightlevel;
        if (thinker.direction === -1) {
          newLight -= GLOWSPEED;
          if (newLight <= thinker.minLight) {
            newLight += GLOWSPEED;
            thinker.direction = 1;
          }
        } else {
          newLight += GLOWSPEED;
          if (newLight >= thinker.maxLight) {
            newLight -= GLOWSPEED;
            thinker.direction = -1;
          }
        }
        sector.lightlevel = clampLight(newLight);
      } else {
        thinker.count -= 1;
        if (thinker.count === 0) {
          if (sector.lightlevel === thinker.minLight) {
            sector.lightlevel = thinker.maxLight;
            thinker.count = thinker.brightTime;
          } else {
            sector.lightlevel = thinker.minLight;
            thinker.count = thinker.darkTime;
          }
        }
      }

      this.dirty = true;
      this.dirtySectors.add(thinker.sectorIndex);
    }
  }
}
