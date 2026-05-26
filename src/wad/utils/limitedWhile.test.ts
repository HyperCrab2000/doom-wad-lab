import { describe, expect, it, vi } from 'vitest';
import { limitedWhile } from './limitedWhile';

describe('limitedWhile', () => {
  it('runs callFunc while whileFunc returns true', () => {
    let count = 0;

    limitedWhile(
      () => count < 3,
      () => {
        count++;
      }
    );

    expect(count).toBe(3);
  });

  it('stops when callFunc returns false', () => {
    let count = 0;

    limitedWhile(
      () => true,
      () => {
        count++;
        return count < 2;
      }
    );

    expect(count).toBe(2);
  });

  it('stops when whileFunc returns false', () => {
    let count = 0;

    limitedWhile(
      () => false,
      () => {
        count++;
      }
    );

    expect(count).toBe(0);
  });

  it('invokes limitHitFunc when the iteration cap is reached', () => {
    const limitHit = vi.fn();

    limitedWhile(
      () => true,
      () => {},
      2,
      limitHit
    );

    expect(limitHit).toHaveBeenCalledTimes(1);
  });

  it('does not invoke limitHitFunc when the loop exits early', () => {
    const limitHit = vi.fn();
    let count = 0;

    limitedWhile(
      () => count < 1,
      () => {
        count++;
      },
      10,
      limitHit
    );

    expect(limitHit).not.toHaveBeenCalled();
  });
});
