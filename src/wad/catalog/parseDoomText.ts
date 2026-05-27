/**
 * Doom story / help lumps (TEXT1–6, HELP, CREDIT, …).
 * Screens are separated by a line containing only `_` (vanilla convention).
 */
export function isMostlyPrintableText(text: string): boolean {
  if (!text.length) return false;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return printable / text.length >= 0.85;
}

export function parseDoomTextScreens(data: ArrayBuffer): string[] {
  const raw = new TextDecoder('latin1').decode(data);
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const screens = normalized
    .split(/\n_\n/)
    .map((screen) => screen.trim())
    .filter((screen) => screen.length > 0);

  if (screens.length > 0) return screens;

  const trimmed = normalized.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

export function parseDmusinfo(data: ArrayBuffer): Array<{ mapName: string; musicLump: string }> {
  const text = new TextDecoder('latin1').decode(data);
  const tokens = text.split(/\s+/).filter(Boolean);
  const entries: Array<{ mapName: string; musicLump: string }> = [];

  for (let i = 0; i + 1 < tokens.length; i += 2) {
    entries.push({
      mapName: tokens[i].toUpperCase(),
      musicLump: tokens[i + 1].toUpperCase(),
    });
  }

  return entries;
}
