import { describe, expect, it } from 'vitest';
import { getKeyedDoorColor, playerHasDoorKey } from './doorKeys';

describe('doorKeys', () => {
  it('maps keyed door specials to colors', () => {
    expect(getKeyedDoorColor(26)).toBe('blue');
    expect(getKeyedDoorColor(34)).toBe('yellow');
    expect(getKeyedDoorColor(1)).toBeNull();
  });

  it('requires the matching key when inventory is provided', () => {
    expect(playerHasDoorKey({ blue: true, red: false, yellow: false }, 'blue')).toBe(true);
    expect(playerHasDoorKey({ blue: false, red: true, yellow: false }, 'red')).toBe(true);
    expect(playerHasDoorKey({ blue: false, red: false, yellow: true }, 'yellow')).toBe(true);
    expect(playerHasDoorKey({ blue: false, red: false, yellow: false }, 'blue')).toBe(false);
    expect(playerHasDoorKey(null, 'blue')).toBe(true);
    expect(playerHasDoorKey({ blue: true, red: true, yellow: true }, null)).toBe(true);
  });
});
