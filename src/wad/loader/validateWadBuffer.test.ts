import { describe, expect, it } from 'vitest';

import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';

describe('validateWadBuffer', () => {
  it('accepts a minimal valid PWAD header', () => {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint8(0, 'P'.charCodeAt(0));
    view.setUint8(1, 'W'.charCodeAt(0));
    view.setUint8(2, 'A'.charCodeAt(0));
    view.setUint8(3, 'D'.charCodeAt(0));
    view.setInt32(4, 1, true);
    view.setInt32(8, 12, true);

    expect(() => validateWadBuffer(buffer, '/wads/test.wad')).not.toThrow();
  });

  it('rejects HTML error pages masquerading as WADs', () => {
    const html = '<!DOCTYPE html><html><body>404</body></html>';
    const buffer = new TextEncoder().encode(html).buffer;

    expect(() => validateWadBuffer(buffer, '/wads/DOOM2.WAD')).toThrow(/Invalid WAD header/);
  });
});
