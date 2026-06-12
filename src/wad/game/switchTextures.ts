import { LineDef } from '@/wad/interfaces/LineDef';
import { SideDef } from '@/wad/interfaces/SideDef';
import { WadMap } from '@/wad/interfaces/WadMap';

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
