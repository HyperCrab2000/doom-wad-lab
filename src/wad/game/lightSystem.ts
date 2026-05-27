import { getLineSector } from '@/wad/renderer/controls/doomCollision';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { getAdjacentSectorIndices } from './sectorAdjacency';
import { getLightSpecial, LightDef } from './lightSpecials';

const FLICKER_SECTOR_TYPE = 17;

export interface LightTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
}

export class LightSystem {
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

  tryUseLine(lineIndex: number, line: LineDef): LightTriggerResult {
    const def = getLightSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, true);
  }

  tryWalkLine(lineIndex: number, line: LineDef): LightTriggerResult {
    const def = getLightSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, false);
  }

  private trigger(
    lineIndex: number,
    line: LineDef,
    def: LightDef,
    playSwitch: boolean
  ): LightTriggerResult {
    const sectors = this.resolveTargetSectors(line, def);
    if (sectors.length === 0) return emptyResult();

    for (const { sectorIndex, sector } of sectors) {
      this.applyEffect(sectorIndex, sector, def.effect);
    }

    if (def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }

    return { triggered: true, playSwitch };
  }

  private applyEffect(sectorIndex: number, sector: Sector, effect: LightDef['effect']): void {
    switch (effect) {
      case 'zero':
        sector.lightlevel = 0;
        break;
      case 'max255':
        sector.lightlevel = 255;
        break;
      case 'maxNeighbor': {
        let max = sector.lightlevel;
        for (const neighbor of getAdjacentSectorIndices(this.map, sectorIndex)) {
          max = Math.max(max, this.map.SECTORS[neighbor].lightlevel);
        }
        sector.lightlevel = max;
        break;
      }
      case 'lowestNeighbor': {
        let min = sector.lightlevel;
        for (const neighbor of getAdjacentSectorIndices(this.map, sectorIndex)) {
          min = Math.min(min, this.map.SECTORS[neighbor].lightlevel);
        }
        sector.lightlevel = min;
        break;
      }
      case 'flicker':
        sector.type = FLICKER_SECTOR_TYPE;
        if (sector.lightlevel < 32) sector.lightlevel = 160;
        break;
    }
    this.markDirty(sectorIndex);
  }

  private markDirty(sectorIndex: number): void {
    this.dirty = true;
    this.dirtySectorIndices.add(sectorIndex);
  }

  private resolveTargetSectors(
    line: LineDef,
    def: LightDef
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

function emptyResult(): LightTriggerResult {
  return { triggered: false, playSwitch: false };
}
