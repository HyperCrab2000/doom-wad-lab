/** Classify IWAD/PWAD lump names (vanilla Doom conventions). */
export type WadLumpCategory =
  | 'map'
  | 'music'
  | 'sound'
  | 'sprite'
  | 'flat'
  | 'patch'
  | 'textureMeta'
  | 'palette'
  | 'colormap'
  | 'storyText'
  | 'menuText'
  | 'intermission'
  | 'demo'
  | 'midiMeta'
  | 'marker'
  | 'unknown';

const MAP_NAME = /^(E[1-4]M\d|MAP\d{2})$/i;
const MARKER = /^(FF?|SS?|P\d?)_(START|END)$/i;
const STORY_TEXT = /^(TEXT\d|HELP\d|CREDIT|P_(TITL|INTER|NET|END|RWDM|CWDM|BONUS|GOTHIC))$/i;
const MENU_TEXT = /^(HELP|DMENUPIC|TITLE|END|LOAD|SAVE|M_(RD|SD|SK|FS|END)LG?)$/i;

export function categorizeWadLumpName(name: string): WadLumpCategory {
  const upper = name.toUpperCase();

  if (MARKER.test(upper)) return 'marker';
  if (MAP_NAME.test(upper)) return 'map';
  if (upper === 'PLAYPAL') return 'palette';
  if (upper === 'COLORMAP') return 'colormap';
  if (upper === 'GENMIDI' || upper === 'DMXGUS') return 'midiMeta';
  if (upper === 'PNAMES' || upper.startsWith('TEXTURE')) return 'textureMeta';
  if (/^DEMO\d$/i.test(upper)) return 'demo';
  if (upper === 'DMUSINFO') return 'music';
  if (STORY_TEXT.test(upper)) return 'storyText';
  if (MENU_TEXT.test(upper) || upper === 'ENDOOM') return 'menuText';
  if (/^P1_(END|INTER|RWDM|CWDM|BONUS)$/i.test(upper)) return 'intermission';
  if (/^D_[A-Z0-9_]+$/i.test(upper)) return 'music';
  if (/^DS[A-Z0-9]+$/i.test(upper)) return 'sound';
  if (/^DP[A-Z0-9]+$/i.test(upper)) return 'sound';

  return 'unknown';
}

export function isBetweenMarkers(
  lumpNames: string[],
  index: number,
  startMarker: string,
  endMarker: string
): boolean {
  let inRange = false;
  for (let i = 0; i <= index; i++) {
    const name = lumpNames[i]?.toUpperCase();
    if (name === startMarker) inRange = true;
    if (name === endMarker) inRange = false;
  }
  return inRange;
}
