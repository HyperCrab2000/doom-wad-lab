export interface GztickScriptEvent {
  tick: number;
  op: 'useLine';
  line: number;
}

export interface GztickScriptFixture {
  map: string;
  targetTick: number;
  events: GztickScriptEvent[];
}

const EVENT_RE = /^event\s+(\d+)\s+useLine\s+(\d+)\s*$/i;
const TARGET_RE = /^target\s+(\d+)\s*$/i;

export function parseGztickScript(text: string, mapName: string): GztickScriptFixture {
  const events: GztickScriptEvent[] = [];
  let targetTick = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const targetMatch = line.match(TARGET_RE);
    if (targetMatch) {
      targetTick = Number(targetMatch[1]);
      continue;
    }

    const eventMatch = line.match(EVENT_RE);
    if (eventMatch) {
      events.push({
        tick: Number(eventMatch[1]),
        op: 'useLine',
        line: Number(eventMatch[2]),
      });
    }
  }

  if (targetTick <= 0) {
    throw new Error('GZTICK script missing target tick');
  }

  return { map: mapName, targetTick, events };
}
