import { describe, expect, it } from 'vitest';
import { createTeleportMap } from '../../../test/helpers/syntheticMaps';
import { TeleportSystem } from './teleportSystem';

describe('TeleportSystem', () => {
  it('blocks non-players on monster-only specials 125', () => {
    const map = createTeleportMap(125, 2);
    const system = new TeleportSystem(map);
    expect(system.tryWalkLine(0, map.LINEDEFS[0], false).triggered).toBe(false);
    expect(system.tryWalkLine(0, map.LINEDEFS[0], true).triggered).toBe(true);
  });
});
