import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { Wad } from '@/wad/interfaces/Wad';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getGenmidiFromWad, getMusicLump, getMusicLumpCandidatesForMap, getMusicLumpForMap, parseMus } from './doomMusic';

describe('Doom music lookup', () => {
  it('maps Doom episode maps and Doom II maps to stock music lumps', () => {
    expect(getMusicLumpForMap('E1M1')).toBe('D_E1M1');
    expect(getMusicLumpForMap('MAP01')).toBe('D_RUNNIN');
    expect(getMusicLumpForMap('MAP32')).toBe('D_ULTIMA');
  });

  it('maps Ultimate Doom episode 4 maps to reused stock music lumps', () => {
    expect(getMusicLumpForMap('E4M1')).toBe('D_E3M4');
    expect(getMusicLumpForMap('E4M4')).toBe('D_E1M5');
    expect(getMusicLumpCandidatesForMap('E4M1')).toEqual(['D_E3M4', 'D_E4M1']);
  });

  it('finds music data in the WAD lump hash', () => {
    const data = new ArrayBuffer(4);
    const wad = { lumpHash: { D_RUNNIN: data } } as unknown as Wad;

    expect(getMusicLump(wad, 'MAP01')).toEqual({ name: 'D_RUNNIN', data });
  });

  it('finds Ultimate Doom episode 4 reused music data', () => {
    const data = new ArrayBuffer(4);
    const wad = { lumpHash: { D_E3M4: data } } as unknown as Wad;

    expect(getMusicLump(wad, 'E4M1')).toEqual({ name: 'D_E3M4', data });
  });

  it('loads E1M1 music from bundled DOOM.WAD when present', () => {
    const wadPath = 'public/wads/DOOM.WAD';
    if (!existsSync(wadPath)) return;

    const file = readFileSync(wadPath);
    const wad = loadWadFromArrayBuffer(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
    );
    const lump = getMusicLump(wad, 'E1M1');

    expect(lump?.name).toBe('D_E1M1');
    expect(lump?.data.byteLength).toBeGreaterThan(1000);

    const song = parseMus(lump!.data);
    expect(song.notes.length).toBeGreaterThan(500);
  });

  it('loads GENMIDI from bundled DOOM.WAD when present', () => {
    const wadPath = 'public/wads/DOOM.WAD';
    if (!existsSync(wadPath)) return;

    const file = readFileSync(wadPath);
    const wad = loadWadFromArrayBuffer(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
    );
    const genmidi = getGenmidiFromWad(wad);

    expect(genmidi?.byteLength).toBeGreaterThan(1000);
  });
});

describe('MUS parser', () => {
  it('parses a simple note on/off song', () => {
    const song = parseMus(createSimpleMus());

    expect(song.ticksPerSecond).toBe(140);
    expect(song.notes).toHaveLength(1);
    expect(song.notes[0]).toMatchObject({
      channel: 0,
      note: 60,
      velocity: 100,
      startTick: 0,
      durationTicks: 12,
    });
  });

  it('finds MUS headers with leading padding like tolerant Doom ports', () => {
    const base = new Uint8Array(createSimpleMus());
    const padded = new Uint8Array(base.length + 8);
    padded.set(base, 8);

    expect(parseMus(padded.buffer).notes).toHaveLength(1);
  });
});

function createSimpleMus(): ArrayBuffer {
  const headerSize = 16;
  const events = [
    0x90, // last in group, play note, channel 0
    0x80 | 60, // note 60 with volume byte
    100,
    12, // delta
    0x80, // last in group, release note, channel 0
    60,
    0,
    0xb0, // last in group, score end, channel 0
  ];
  const buffer = new ArrayBuffer(headerSize + events.length);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'MUS\u001a');
  view.setUint16(4, events.length, true);
  view.setUint16(6, headerSize, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  events.forEach((event, index) => view.setUint8(headerSize + index, event));
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
