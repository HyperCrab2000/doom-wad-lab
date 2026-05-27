import { LineDef } from '@/wad/interfaces/LineDef';
import { SideDef } from '@/wad/interfaces/SideDef';
import { WadMap } from '@/wad/interfaces/WadMap';

function isSwitchTextureName(name: string | undefined): boolean {
  if (!name || name === '-') return false;
  const upper = name.toUpperCase();
  return (
    upper.startsWith('SW1') ||
    upper.startsWith('SW2') ||
    upper.startsWith('DB1') ||
    upper.startsWith('DB2')
  );
}

/** True when the linedef shows a switch texture (SW1/SW2 or DB1/DB2). */
export function lineHasSwitchTexture(map: WadMap, line: LineDef): boolean {
  for (const sideIndex of line.sidenum) {
    if (sideIndex < 0) continue;
    const side = map.SIDEDEFS[sideIndex];
    if (
      isSwitchTextureName(side.middleTexture) ||
      isSwitchTextureName(side.upperTexture) ||
      isSwitchTextureName(side.lowerTexture)
    ) {
      return true;
    }
  }
  return false;
}

function flipSwitchName(name: string): string | null {
  if (name.length < 4) return null;
  const upper = name.toUpperCase();
  if (upper.startsWith('SW1')) return `SW2${name.slice(3)}`;
  if (upper.startsWith('SW2')) return `SW1${name.slice(3)}`;
  if (upper.startsWith('DB1')) return `DB2${name.slice(3)}`;
  if (upper.startsWith('DB2')) return `DB1${name.slice(3)}`;
  return null;
}

function flipSideTextures(side: SideDef): boolean {
  let changed = false;
  const fields: Array<keyof Pick<SideDef, 'middleTexture' | 'upperTexture' | 'lowerTexture'>> = [
    'middleTexture',
    'upperTexture',
    'lowerTexture',
  ];
  for (const field of fields) {
    const current = side[field];
    if (!current || current === '-') continue;
    const flipped = flipSwitchName(current);
    if (flipped) {
      side[field] = flipped;
      changed = true;
    }
  }
  return changed;
}

/** Toggle SW1↔SW2 (and DB1↔DB2) on the activating linedef. Returns whether any texture changed. */
export function flipSwitchLineTextures(map: WadMap, line: LineDef): boolean {
  let changed = false;
  for (const sideIndex of line.sidenum) {
    if (sideIndex < 0) continue;
    if (flipSideTextures(map.SIDEDEFS[sideIndex])) {
      changed = true;
    }
  }
  return changed;
}
