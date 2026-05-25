import { describe, expect, it } from 'vitest';
import { cycleAutomapCheat } from './automap';
import { appendCheatChar, cheatTriggered } from '@/wad/game/doomCheats';

describe('automap cheats', () => {
  it('cycles iddt cheat levels 0 → 1 → 2 → 0', () => {
    expect(cycleAutomapCheat(0)).toBe(1);
    expect(cycleAutomapCheat(1)).toBe(2);
    expect(cycleAutomapCheat(2)).toBe(0);
  });

  it('detects iddt in the cheat buffer', () => {
    let buffer = '';
    for (const char of 'xyiddt') {
      buffer = appendCheatChar(buffer, char);
    }
    expect(cheatTriggered(buffer, 'iddt')).toBe(true);
  });
});
