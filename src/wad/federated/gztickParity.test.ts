import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';
import { diffGztick, readGztick, writeGztick } from '@hypercrab2000/doom-gzengine-core';

import { exportGztickFromMap } from '@/wad/federated/exportGztickFromMap';
import { parseGztickScript } from '@/wad/federated/gztickScript';
import { simulateGztickFixture } from '@/wad/federated/simulateGztickFixture';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IWAD = path.join(ROOT, 'public/wads/DOOM.WAD');
const GZTICK_FIXTURE_T0 = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom/E1M1_t0.gztick');
const GZTICK_FIXTURE_DOOR_T35 = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom/E1M1-door_t35.gztick');
const GZTICK_SCRIPT_DOOR = path.join(ROOT, 'fixtures/gztick/E1M1-door-t35.script');

function loadFixtureWad() {
  const raw = fs.readFileSync(IWAD);
  return loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('gztick engine parity', () => {
  it.skipIf(typeof writeGztick !== 'function')('round-trips TS export through codec', () => {
    const wad = loadFixtureWad();
    const map = wad.maps.E1M1;
    expect(map).toBeTruthy();
    const exported = exportGztickFromMap(map!, 'E1M1', 0);
    const decoded = readGztick(writeGztick(exported));
    expect(diffGztick(exported, decoded, { ignoreEngineTag: true }).ok).toBe(true);
  });

  it('matches GZDoom E1M1 t=0 fixture when present', () => {
    if (process.env.GZTICK_PARITY_REQUIRED !== '1' && !fs.existsSync(GZTICK_FIXTURE_T0)) {
      return;
    }
    expect(fs.existsSync(GZTICK_FIXTURE_T0)).toBe(true);

    const wad = loadFixtureWad();
    const map = structuredClone(wad.maps.E1M1!);
    const tsDoc = exportGztickFromMap(map, 'E1M1', 0);
    const raw = fs.readFileSync(GZTICK_FIXTURE_T0);
    const gzdoomDoc = readGztick(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    );

    const result = diffGztick(gzdoomDoc, tsDoc, { ignoreEngineTag: true });
    if (!result.ok) {
      const preview = result.mismatches.slice(0, 12).map((m) => `${m.path}: ${m.expected} != ${m.actual}`);
      throw new Error(`GZTICK parity failed (${result.mismatches.length} mismatches)\n${preview.join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });

  it('exports runtime things at t>0 in GZDoom door fixture when present', () => {
    if (process.env.GZTICK_PARITY_REQUIRED !== '1' && !fs.existsSync(GZTICK_FIXTURE_DOOR_T35)) {
      return;
    }
    expect(fs.existsSync(GZTICK_FIXTURE_DOOR_T35)).toBe(true);

    const raw = fs.readFileSync(GZTICK_FIXTURE_T0);
    const t0 = readGztick(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    );
    const rawDoor = fs.readFileSync(GZTICK_FIXTURE_DOOR_T35);
    const door = readGztick(
      rawDoor.buffer.slice(rawDoor.byteOffset, rawDoor.byteOffset + rawDoor.byteLength) as ArrayBuffer,
    );

    expect(door.header.tickNumber).toBe(35);
    expect(door.things.length).toBeGreaterThan(0);
    expect(door.things.length).toBeLessThan(t0.things.length);
    const player = door.things.find((thing) => thing.stateName === 'PLAY');
    expect(player?.thingType).toBe(1);
    expect(player?.health).toBe(100);
  });

  it('matches GZDoom E1M1 door script at t=35 when present', () => {
    if (process.env.GZTICK_PARITY_REQUIRED !== '1' && !fs.existsSync(GZTICK_FIXTURE_DOOR_T35)) {
      return;
    }
    expect(fs.existsSync(GZTICK_FIXTURE_DOOR_T35)).toBe(true);
    expect(fs.existsSync(GZTICK_SCRIPT_DOOR)).toBe(true);

    const wad = loadFixtureWad();
    const map = structuredClone(wad.maps.E1M1!);
    const fixture = parseGztickScript(fs.readFileSync(GZTICK_SCRIPT_DOOR, 'utf8'), 'E1M1');
    const tsDoc = simulateGztickFixture(map, 'E1M1', fixture);
    const raw = fs.readFileSync(GZTICK_FIXTURE_DOOR_T35);
    const gzdoomDoc = readGztick(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    );

    const result = diffGztick(gzdoomDoc, tsDoc, { ignoreEngineTag: true, ignoreThings: true });
    if (!result.ok) {
      const preview = result.mismatches.slice(0, 20).map((m) => `${m.path}: ${m.expected} != ${m.actual}`);
      throw new Error(`GZTICK door parity failed (${result.mismatches.length} mismatches)\n${preview.join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });
});
