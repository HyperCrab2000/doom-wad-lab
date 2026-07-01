import { exportToGzstate, loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { gzstateToWadMap } from './gzstateToWadMap';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const DOOM_WAD = path.join(ROOT, 'public/wads/DOOM.WAD');

describe('gzstateToWadMap', () => {
  it('reconstructs E1M1 geometry counts from GZSTATE export', () => {
    if (!fs.existsSync(DOOM_WAD)) return;
    const buf = fs.readFileSync(DOOM_WAD);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const doc = exportToGzstate(wad, 'E1M1');
    const map = gzstateToWadMap(doc);

    expect(map.VERTEXES.length).toBe(doc.vertices.length);
    expect(map.SECTORS.length).toBe(doc.sectors.length);
    expect(map.LINEDEFS.length).toBe(doc.linedefs.length);
    expect(map.SIDEDEFS.length).toBe(doc.sidedefs.length);
    expect(map.SEGS?.length).toBe(doc.segs.length);
    expect(map.NODES?.length).toBe(doc.nodes.length);
    expect(map.SECTORS[0]?.floorpic.length).toBeGreaterThan(0);
  });
});
