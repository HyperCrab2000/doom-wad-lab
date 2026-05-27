import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getMusicLump } from '@/features/level-viewer/music/doomMusic';
import { musBufferToMidi, musSongToMidi } from '@/features/level-viewer/music/mus2midi';
import { parseMus } from '@/features/level-viewer/music/doomMusic';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';
import { hasIntegrationIwad, loadWadForMap } from './helpers/wadFixtures';

describe.skipIf(!hasIntegrationIwad())('music pipeline integration', () => {
  it('parses MAP01 MUS from DOOM2.WAD and converts it to MIDI', () => {
    const { wad } = loadWadForMap('MAP01');
    const lump = getMusicLump(wad, 'MAP01');

    expect(lump).not.toBeNull();
    expect(lump!.name).toBe('D_RUNNIN');
    expect(lump!.data.byteLength).toBeGreaterThan(1000);

    const song = parseMus(lump!.data);
    expect(song.notes.length).toBeGreaterThan(100);
    expect(song.durationTicks).toBeGreaterThan(0);

    const midi = musBufferToMidi(lump!.data);
    expect(midi.timeline.length).toBeGreaterThan(100);
    expect(midi.duration).toBeGreaterThan(0);
    expect(midi.timeDivision).toBe(70);

    const bytes = midi.writeMIDI();
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('round-trips parsed MUS through musSongToMidi with note events', () => {
    const { wad } = loadWadForMap('MAP01');
    const lump = getMusicLump(wad, 'MAP01')!;
    const song = parseMus(lump.data);
    const midi = musSongToMidi(song);

    const noteOnEvents = midi.tracks[0].events.filter((event) => event.statusByte === 0x90);
    expect(noteOnEvents.length).toBeGreaterThan(50);
  });

  it('loads E1M1 music from DOOM.WAD when bundled', () => {
    const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
    if (!existsSync(wadPath)) {
      return;
    }

    const bytes = readFileSync(wadPath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    validateWadBuffer(buffer, wadPath);
    const wad = loadWadFromArrayBuffer(buffer);
    const lump = getMusicLump(wad, 'E1M1');

    expect(lump?.name).toBe('D_E1M1');
    const midi = musBufferToMidi(lump!.data);
    expect(midi.timeline.length).toBeGreaterThan(100);
  });
});
