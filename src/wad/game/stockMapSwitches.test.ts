import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLineSpecialSimulator, simulateUseLine } from '@/wad/game/lineSpecialSimulator';
import { isSwitchActivatableSpecial } from '@/wad/game/lineSpecialActivation';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';

const hasDoom = fs.existsSync(path.resolve(process.cwd(), 'public/wads/DOOM.WAD'));
const hasDoom2 = fs.existsSync(path.resolve(process.cwd(), 'public/wads/DOOM2.WAD'));

function loadMap(wadName: 'DOOM.WAD' | 'DOOM2.WAD', mapName: string) {
  const buf = fs.readFileSync(path.resolve(process.cwd(), `public/wads/${wadName}`));
  return loadWadFromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  ).maps[mapName];
}

describe.skipIf(!hasDoom)('E1M1 switch audit', () => {
  it('triggers each switch line on an isolated fresh map state', () => {
    const template = loadMap('DOOM.WAD', 'E1M1');
    const failures: number[] = [];

    for (let i = 0; i < template.LINEDEFS.length; i++) {
      const line = template.LINEDEFS[i];
      if (!isSwitchActivatableSpecial(line.special)) continue;
      const map = structuredClone(template);
      const sim = createLineSpecialSimulator(map);
      if (!simulateUseLine(sim, i).triggered) failures.push(i);
    }

    expect(failures, `failed lines: ${failures.join(', ')}`).toEqual([]);
  });
});

describe.skipIf(!hasDoom2)('MAP01 switch audit', () => {
  it('triggers each switch line on an isolated fresh map state', () => {
    const template = loadMap('DOOM2.WAD', 'MAP01');
    const failures: number[] = [];

    for (let i = 0; i < template.LINEDEFS.length; i++) {
      const line = template.LINEDEFS[i];
      if (!isSwitchActivatableSpecial(line.special)) continue;
      const map = structuredClone(template);
      const sim = createLineSpecialSimulator(map);
      if (!simulateUseLine(sim, i).triggered) failures.push(i);
    }

    expect(failures, `failed lines: ${failures.join(', ')}`).toEqual([]);
  });

  it('lowers the tag-3 slime pool for switch line 84 (HEF to neighbor 48)', () => {
    const map = loadMap('DOOM2.WAD', 'MAP01');
    const sim = createLineSpecialSimulator(map);
    expect(map.LINEDEFS[84].special).toBe(102);
    expect(simulateUseLine(sim, 84).triggered).toBe(true);
    for (let i = 0; i < 80 && sim.controller.floors.getActiveMoverCount() > 0; i++) {
      sim.controller.floors.tick(0.05);
    }
    for (const sectorIndex of [46, 47, 50, 51]) {
      expect(map.SECTORS[sectorIndex].floorheight).toBe(48);
    }
  });
});
