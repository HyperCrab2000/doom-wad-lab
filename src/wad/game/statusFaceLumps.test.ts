import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { resolveStatusFaceLumpName } from '@/wad/game/statusFaceLumps';

describe('resolveStatusFaceLumpName', () => {
  it('prefers Doom II lump when present', () => {
    const wad = { lumpHash: { STFSTF0: new ArrayBuffer(8), STFST01: new ArrayBuffer(8) } } as never;
    expect(resolveStatusFaceLumpName(wad, 'STFSTF0')).toBe('STFSTF0');
  });

  it('falls back to Doom I straight face', () => {
    const wad = { lumpHash: { STFST01: new ArrayBuffer(8) } } as never;
    expect(resolveStatusFaceLumpName(wad, 'STFSTF0')).toBe('STFST01');
  });

  it('falls back to ouch face for pain logical id', () => {
    const wad = { lumpHash: { STFOUCH0: new ArrayBuffer(8) } } as never;
    expect(resolveStatusFaceLumpName(wad, 'STFKILL0')).toBe('STFOUCH0');
  });

  it('resolves shareware DOOM.WAD straight face', () => {
    const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
    const buf = fs.readFileSync(wadPath);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(resolveStatusFaceLumpName(wad, 'STFSTF0')).toBe('STFST01');
    expect(resolveStatusFaceLumpName(wad, 'STFGOD0')).toBe('STFGOD0');
  });
});
