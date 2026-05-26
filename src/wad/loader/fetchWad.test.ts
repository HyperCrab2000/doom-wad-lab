import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wad } from '@/wad/interfaces/Wad';
import { parseWadInWorker } from '@/wad/parser/parseWadInWorker';
import { fetchWad } from './fetchWad';

vi.mock('@/wad/parser/parseWadInWorker', () => ({
  parseWadInWorker: vi.fn(),
}));

function makeValidWadBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  view.setUint8(0, 'P'.charCodeAt(0));
  view.setUint8(1, 'W'.charCodeAt(0));
  view.setUint8(2, 'A'.charCodeAt(0));
  view.setUint8(3, 'D'.charCodeAt(0));
  view.setInt32(4, 1, true);
  view.setInt32(8, 12, true);
  return buffer;
}

describe('fetchWad', () => {
  beforeEach(() => {
    vi.mocked(parseWadInWorker).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches, validates, and parses a binary WAD', async () => {
    const buffer = makeValidWadBuffer();
    const wad = { indentification: 'PWAD' } as Wad;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: async () => buffer,
      })
    );
    vi.mocked(parseWadInWorker).mockResolvedValue(wad);

    const result = await fetchWad('/wads/test.wad');

    expect(result).toBe(wad);
    expect(parseWadInWorker).toHaveBeenCalledWith(buffer);
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      })
    );

    await expect(fetchWad('/wads/MISSING.WAD')).rejects.toThrow(
      /Failed to fetch WAD \(404 Not Found\)/
    );
  });

  it('rejects HTML responses that are not WAD binaries', async () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html></html>').buffer;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        arrayBuffer: async () => html,
      })
    );

    await expect(fetchWad('/wads/DOOM2.WAD')).rejects.toThrow(
      /returned HTML instead of a binary WAD/
    );
  });

  it('rejects buffers with invalid WAD headers', async () => {
    const buffer = new TextEncoder().encode('not a wad file at all').buffer;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: async () => buffer,
      })
    );

    await expect(fetchWad('/wads/bad.wad')).rejects.toThrow(/Invalid WAD header/);
    expect(parseWadInWorker).not.toHaveBeenCalled();
  });
});
