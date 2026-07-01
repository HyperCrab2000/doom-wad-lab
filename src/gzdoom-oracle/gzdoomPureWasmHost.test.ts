import { describe, expect, it } from 'vitest';

import { GZDOOM_S_WASM_URL, GzdoomSPureWasmNotBuiltError } from './gzdoomPureWasmHost';

describe('gzdoomPureWasmHost', () => {
  it('defines the pure WASM artifact URL under gzdoom-s (never gzdoom gold)', () => {
    expect(GZDOOM_S_WASM_URL).toBe('/wasm/gzdoom-s/gzdoom.wasm');
    expect(GZDOOM_S_WASM_URL).not.toContain('/wasm/gzdoom/gzdoom');
  });

  it('GzdoomSPureWasmNotBuiltError includes build hint', () => {
    const err = new GzdoomSPureWasmNotBuiltError('missing');
    expect(err.buildHint).toBe('npm run build:gzdoom-s-wasm');
    expect(err.message).toContain('bootstrap:gzdoom-s');
  });
});
