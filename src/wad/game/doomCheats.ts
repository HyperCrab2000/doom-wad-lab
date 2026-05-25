const MAX_BUFFER = 12;

export function appendCheatChar(buffer: string, char: string): string {
  if (char.length !== 1) return buffer;
  return (buffer + char.toLowerCase()).slice(-MAX_BUFFER);
}

export function cheatTriggered(buffer: string, code: string): boolean {
  return buffer.endsWith(code.toLowerCase());
}
