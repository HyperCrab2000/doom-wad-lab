import { describe, expect, it } from 'vitest';
import { lineDef, sector } from '../../../test/helpers/syntheticMaps';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { ScrollSystem } from './scrollSystem';

describe('ScrollSystem', () => {
  it('advances xOffset on special-48 linedefs each tick', () => {
    const map = {
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
      ],
      LINEDEFS: [lineDef(48, 0)],
      SIDEDEFS: [
        {
          sector: 0,
          xOffset: 0,
          yOffset: 0,
          upperTexture: '-',
          lowerTexture: '-',
          middleTexture: 'BLODGR1',
        },
        { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      ],
      SECTORS: [sector(0, 128, 0)],
    } as unknown as WadMap;

    const scroll = new ScrollSystem(map);
    expect(scroll.getScrollingSideCount()).toBe(2);
    scroll.tick(0.5);
    expect(map.SIDEDEFS[0].xOffset).toBeGreaterThan(0);
    expect(scroll.isDirty()).toBe(true);
  });
});
