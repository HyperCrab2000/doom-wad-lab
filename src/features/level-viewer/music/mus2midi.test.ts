import { readFileSync, existsSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getMusicLump } from './doomMusic';
import { musBufferToMidi, musSongToMidi } from './mus2midi';
import { musPitchByteToMidiWheel, parseMus } from './doomMusic';

describe('mus2midi', () => {
  it('builds a non-empty MIDI timeline from parsed MUS notes', () => {
    const song = parseMus(createMinimalMus());
    const midi = musSongToMidi(song);

    expect(midi.tracks.length).toBeGreaterThan(0);
    expect(midi.timeline.length).toBeGreaterThan(0);
    expect(midi.duration).toBeGreaterThan(0);
    expect(midi.timeDivision).toBe(70);
  });

  it('writes pitch wheel events into the MIDI track', () => {
    const song = parseMus(createMusWithPitchBend());
    const midi = musSongToMidi(song);
    const pitchEvents = midi.tracks[0].events.filter((event) => event.statusByte === 0xe0);
    expect(pitchEvents.length).toBeGreaterThan(0);
    expect(pitchEvents[0].data[0]).toBe((musPitchByteToMidiWheel(140) & 0x7f));
    expect(pitchEvents[0].data[1]).toBe((musPitchByteToMidiWheel(140) >> 7) & 0x7f);
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

function createMusWithPitchBend(): ArrayBuffer {
  const headerSize = 16;
  const events = [0xa0, 140, 0, 0xd0];
  const buffer = new ArrayBuffer(headerSize + events.length);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeAscii(0, 'MUS\u001a');
  view.setUint16(4, events.length, true);
  view.setUint16(6, headerSize, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  events.forEach((event, index) => view.setUint8(headerSize + index, event));
  return buffer;
}
