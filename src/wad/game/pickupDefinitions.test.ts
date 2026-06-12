import { describe, expect, it } from 'vitest';
import { applyPickupForThingType } from '@/wad/game/pickupDefinitions';
import { createDefaultInventory } from '@/wad/game/playerInventory';

describe('pickupDefinitions', () => {
  it('uses vanilla red keycard message and sets key flag', () => {
    const inv = createDefaultInventory();
    const result = applyPickupForThingType(13, inv);
    expect(result.picked).toBe(true);
    expect(result.message).toBe('Picked up a red keycard.');
    expect(inv.keys.red).toBe(true);
  });

  it('uses vanilla weapon pickup line', () => {
    const inv = createDefaultInventory();
    const result = applyPickupForThingType(2001, inv);
    expect(result.message).toBe('You got the shotgun!');
  });
});
