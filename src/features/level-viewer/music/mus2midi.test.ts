import { readFileSync, existsSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getMusicLump } from './doomMusic';
import { musBufferToMidi, musSongToMidi } from './mus2midi';
import { parseMus } from './doomMusic';

describe('mus2midi', () => {
  it('builds a non-empty MIDI timeline from parsed MUS notes', () => {
    const song = parseMus(createMinimalMus());
    const midi = musSongToMidi(song);

    expect(midi.tracks.length).toBeGreaterThan(0);
    expect(midi.timeline.length).toBeGreaterThan(0);
    expect(midi.duration).toBeGreaterThan(0);
    expect(midi.timeDivision).toBe(70);
  });

  it('converts E1M1 music from DOOM.WAD when bundled', () => {
    const wadPath = 'public/wads/DOOM.WAD';
    if (!existsSync(wadPath)) return;

    const bytes = readFileSync(wadPath);
    const wad = loadWadFromArrayBuffer(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
    const lump = getMusicLump(wad, 'E1M1');
    expect(lump).not.toBeNull();

    const midi = musBufferToMidi(lump!.data);
    expect(midi.timeline.length).toBeGreaterThan(10);
    const buffer = midi.writeMIDI();
    expect(buffer.byteLength).toBeGreaterThan(100);
  });
});

function createMinimalMus(): ArrayBuffer {
  const bytes = new Uint8Array([
    0x4d, 0x55, 0x53, 0x1a, 0x00, 0x00, 0x08, 0x00,
    0x10, 0x3c, 0x40, 0x80, 0x00, 0x00, 0x50, 0x3c, 0x80, 0x5c,
  ]);
  return bytes.buffer;
}
