import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { FloorMoverSystem } from './floorMoverSystem';
import { getSectorsByTag } from './sectorAdjacency';
import { getDonutSpecial, DonutDef } from './donutSpecials';

export interface DonutTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  playStart: boolean;
}

export class DonutSystem {
  private readonly usedOnceLines = new Set<number>();

  constructor(
    private readonly map: WadMap,
    private readonly floors: FloorMoverSystem
  ) {}

  tryUseLine(lineIndex: number, line: LineDef): DonutTriggerResult {
    const def = getDonutSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def);
  }

  private trigger(lineIndex: number, line: LineDef, def: DonutDef): DonutTriggerResult {
    const tag = line.tag ?? 0;
    if (tag === 0) return emptyResult();

    const back = getLineSector(this.map, line, 1);
    if (!back) return emptyResult();
    const pillarIndex = this.map.SECTORS.indexOf(back);
    if (pillarIndex < 0) return emptyResult();

    const tagged = getSectorsByTag(this.map, tag);
    if (tagged.length < 2) return emptyResult();

    let started = 0;
    for (const { sectorIndex } of tagged) {
      if (sectorIndex === pillarIndex) {
        if (this.floors.startFloorMoveKind(sectorIndex, 'floorUp')) started++;
      } else {
        if (this.floors.startFloorMoveKind(sectorIndex, 'floorDown')) started++;
      }
    }

    if (started === 0) return emptyResult();

    if (def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return { triggered: true, playSwitch: true, playStart: true };
  }
}

function emptyResult(): DonutTriggerResult {
  return { triggered: false, playSwitch: false, playStart: false };
}
