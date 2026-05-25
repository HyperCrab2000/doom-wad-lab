import { describe, expect, it } from 'vitest';
import { WebAudioMusPlayer } from './webAudioMusPlayer';

describe('WebAudioMusPlayer', () => {
  it('constructs without throwing', () => {
    const player = new WebAudioMusPlayer();
    expect(player).toBeTruthy();
    player.stop();
  });
});
