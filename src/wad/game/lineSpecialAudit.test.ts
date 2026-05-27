import { describe, expect, it } from 'vitest';
import { scanMapLineSpecials } from './lineSpecialAudit';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('lineSpecialAudit', () => {
  it('counts specials per map', () => {
    const map = {
      LINEDEFS: [{ special: 1 }, { special: 0 }, { special: 10 }],
      SECTORS: [],
      SIDEDEFS: [],
      VERTEXES: [],
      THINGS: [],
    } as unknown as WadMap;

    const usage = scanMapLineSpecials('TEST', map);
    expect(usage.get(1)?.count).toBe(1);
    expect(usage.get(10)?.count).toBe(1);
    expect(usage.has(0)).toBe(false);
  });

});
