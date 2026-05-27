import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import type { CrusherSystem } from './crusherSystem';
import { FloorMoverSystem } from './floorMoverSystem';
import { bfsSectorChain } from './sectorAdjacency';
import { getStairSpecial, StairDef } from './stairSpecials';

export interface StairTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playStart: boolean;
}

export class StairSystem {
  private readonly usedOnceLines = new Set<number>();

  constructor(
    private readonly map: WadMap,
    private readonly floors: FloorMoverSystem,
    private readonly crushers: CrusherSystem | null = null
  ) {}

  tryUseLine(lineIndex: number, line: LineDef): StairTriggerResult {
    const def = getStairSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, true);
  }

  tryWalkLine(lineIndex: number, line: LineDef): StairTriggerResult {
    const def = getStairSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, false);
  }

  private trigger(
    lineIndex: number,
    line: LineDef,
    def: StairDef,
    playSwitch: boolean
  ): StairTriggerResult {
    const back = getLineSector(this.map, line, 1);
    if (!back) return emptyResult();
    const startIndex = this.map.SECTORS.indexOf(back);
    if (startIndex < 0) return emptyResult();

    const chain = bfsSectorChain(this.map, startIndex);
    const baseFloor = back.floorheight;
    let started = 0;

    for (let i = 0; i < chain.length; i++) {
      const target = baseFloor + def.stepHeight * (i + 1);
      if (this.floors.startFloorMoveTo(chain[i], target, def.speed)) {
        started++;
        if (def.crush && this.crushers) {
          const sector = this.map.SECTORS[chain[i]];
          if (sector) {
            this.crushers.startCrusherOnSector(chain[i], sector, def.speed);
          }
        }
      }
    }

    if (started === 0) return emptyResult();

    if (def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return { triggered: true, playSwitch, playStart: true };
  }
}

function emptyResult(): StairTriggerResult {
  return { triggered: false, playSwitch: false, playStart: false };
}
