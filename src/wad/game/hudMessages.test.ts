import { describe, expect, it } from 'vitest';
import { HudMessageQueue } from './hudMessages';

describe('HudMessageQueue', () => {
  it('shows and expires messages', () => {
    const q = new HudMessageQueue();
    q.push('Picked up a clip.', 1000, 0);
    expect(q.get()).toBe('Picked up a clip.');
    q.tick(1001);
    expect(q.get()).toBeNull();
  });

  it('clears immediately', () => {
    const q = new HudMessageQueue();
    q.push('Test', 5000, 0);
    q.clear();
    expect(q.get()).toBeNull();
  });
});
