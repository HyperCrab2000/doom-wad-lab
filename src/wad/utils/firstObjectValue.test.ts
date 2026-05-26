import { describe, expect, it } from 'vitest';
import { firstObjectValue } from './firstObjectValue';

describe('firstObjectValue', () => {
  it('returns the first own property value', () => {
    expect(firstObjectValue({ a: 1, b: 2 })).toBe(1);
    expect(firstObjectValue({ name: 'MAP01', size: 4096 })).toBe('MAP01');
  });

  it('returns undefined for an empty object', () => {
    expect(firstObjectValue({})).toBeUndefined();
  });

  it('ignores inherited properties', () => {
    const proto = { inherited: 'skip' };
    const obj = Object.create(proto);
    obj.own = 'keep';

    expect(firstObjectValue(obj)).toBe('keep');
  });
});
