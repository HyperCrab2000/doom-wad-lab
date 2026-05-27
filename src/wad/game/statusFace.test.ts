import { describe, expect, it } from 'vitest';
import { getStatusFaceLump } from './statusFace';

describe('statusFace', () => {
  it('shows god face when invulnerable', () => {
    expect(getStatusFaceLump(50, true, { invulnerable: true })).toBe('STFGOD0');
  });

  it('shows dead face at zero health', () => {
    expect(getStatusFaceLump(0, false, {})).toBe('STFDEAD0');
  });

  it('shows hurt face at low health', () => {
    expect(getStatusFaceLump(20, true, {})).toBe('STFSTF4');
  });
});
