import { describe, expect, it } from 'vitest';
import { appendCheatChar, cheatTriggered } from './doomCheats';

describe('doom cheats', () => {
  describe('appendCheatChar', () => {
    it('appends lowercase characters to the buffer', () => {
      expect(appendCheatChar('', 'I')).toBe('i');
      expect(appendCheatChar('id', 'K')).toBe('idk');
    });

    it('keeps only the last twelve characters', () => {
      const long = 'abcdefghijkl';
      expect(appendCheatChar(long, 'm')).toBe('bcdefghijklm');
    });

    it('ignores multi-character input', () => {
      expect(appendCheatChar('id', 'fa')).toBe('id');
      expect(appendCheatChar('id', '')).toBe('id');
    });
  });

  describe('cheatTriggered', () => {
    it('detects when the buffer ends with a cheat code', () => {
      expect(cheatTriggered('idkfa', 'idkfa')).toBe(true);
      expect(cheatTriggered('xxxidkfa', 'idkfa')).toBe(true);
      expect(cheatTriggered('idkfa', 'IDKFA')).toBe(true);
    });

    it('returns false when the code is not at the end', () => {
      expect(cheatTriggered('idkf', 'idkfa')).toBe(false);
      expect(cheatTriggered('idkfaX', 'idkfa')).toBe(false);
      expect(cheatTriggered('', 'idkfa')).toBe(false);
    });
  });
});
