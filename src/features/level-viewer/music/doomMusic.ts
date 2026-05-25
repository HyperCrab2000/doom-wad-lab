import { Wad } from '@/wad/interfaces/Wad';

export interface MusNote {
  channel: number;
  note: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
  program: number;
}

export interface MusSong {
  notes: MusNote[];
  durationTicks: number;
  ticksPerSecond: number;
}

const MUS_TICKS_PER_SECOND = 140;
const DEFAULT_VELOCITY = 96;

const doom2MusicByMap: Record<string, string> = {
  MAP01: 'D_RUNNIN',
  MAP02: 'D_STALKS',
  MAP03: 'D_COUNTD',
  MAP04: 'D_BETWEE',
  MAP05: 'D_DOOM',
  MAP06: 'D_THE_DA',
  MAP07: 'D_SHAWN',
  MAP08: 'D_DDTBLU',
  MAP09: 'D_IN_CIT',
  MAP10: 'D_DEAD',
  MAP11: 'D_STLKS2',
  MAP12: 'D_THEDA2',
  MAP13: 'D_DOOM2',
  MAP14: 'D_DDTBL2',
  MAP15: 'D_RUNNI2',
  MAP16: 'D_DEAD2',
  MAP17: 'D_STLKS3',
  MAP18: 'D_ROMERO',
  MAP19: 'D_SHAWN2',
  MAP20: 'D_MESSAG',
  MAP21: 'D_COUNT2',
  MAP22: 'D_DDTBL3',
  MAP23: 'D_AMPIE',
  MAP24: 'D_THEDA3',
  MAP25: 'D_ADRIAN',
  MAP26: 'D_MESSG2',
  MAP27: 'D_ROMER2',
  MAP28: 'D_TENSE',
  MAP29: 'D_SHAWN3',
  MAP30: 'D_OPENIN',
  MAP31: 'D_EVIL',
  MAP32: 'D_ULTIMA',
};

const ultimateDoomEpisode4MusicByMap: Record<string, string> = {
  E4M1: 'D_E3M4',
  E4M2: 'D_E3M2',
  E4M3: 'D_E3M3',
  E4M4: 'D_E1M5',
  E4M5: 'D_E2M7',
  E4M6: 'D_E2M4',
  E4M7: 'D_E2M6',
  E4M8: 'D_E2M5',
  E4M9: 'D_E1M9',
};

export function getMusicLumpForMap(mapName: string): string {
  return getMusicLumpCandidatesForMap(mapName)[0];
}

export function getMusicLumpCandidatesForMap(mapName: string): string[] {
  const upper = mapName.toUpperCase();
  if (ultimateDoomEpisode4MusicByMap[upper]) {
    return [ultimateDoomEpisode4MusicByMap[upper], `D_${upper}`];
  }

  if (/^E\dM\d$/.test(upper)) {
    return [`D_${upper}`];
  }

  return [doom2MusicByMap[upper] ?? `D_${upper}`];
}

export function getGenmidiFromWad(wad: Wad): ArrayBuffer | undefined {
  return wad.genmidi ?? (wad.lumpHash.GENMIDI as ArrayBuffer | undefined);
}

export function getMusicLump(wad: Wad, mapName: string): { name: string; data: ArrayBuffer } | null {
  for (const candidate of getMusicLumpCandidatesForMap(mapName)) {
    const data = wad.lumpHash[candidate];
    if (data) {
      return { name: candidate, data };
    }
  }

  return null;
}

export function parseMus(buffer: ArrayBuffer): MusSong {
  const view = new DataView(buffer);
  const headerOffset = findMusHeader(view);
  const id = headerOffset >= 0 ? readAscii(view, headerOffset, 4) : '';
  if (id !== 'MUS\u001a') {
    throw new Error('Music lump is not Doom MUS format');
  }

  const scoreStart = headerOffset + view.getUint16(headerOffset + 6, true);
  let offset = scoreStart;
  let tick = 0;
  const channelState = new Map<number, { volume: number; program: number; lastNote: number }>();
  const openNotes = new Map<string, { startTick: number; velocity: number; program: number }>();
  const notes: MusNote[] = [];
  let ended = false;

  while (!ended && offset < buffer.byteLength) {
    let lastInGroup = false;

    while (!lastInGroup && offset < buffer.byteLength) {
      const eventDescriptor = view.getUint8(offset++);
      lastInGroup = (eventDescriptor & 0x80) !== 0;
      const eventType = (eventDescriptor >> 4) & 0x07;
      const musChannel = eventDescriptor & 0x0f;
      const channel = mapMusChannelToMidi(musChannel);
      const state = getChannelState(channelState, channel);

      switch (eventType) {
        case 0: {
          const note = view.getUint8(offset++) & 0x7f;
          closeNote(notes, openNotes, channel, note, tick);
          break;
        }
        case 1: {
          const noteByte = view.getUint8(offset++);
          const note = noteByte & 0x7f;
          if ((noteByte & 0x80) !== 0) {
            state.volume = view.getUint8(offset++) & 0x7f;
          }
          state.lastNote = note;
          openNotes.set(noteKey(channel, note), {
            startTick: tick,
            velocity: state.volume,
            program: state.program,
          });
          break;
        }
        case 2:
          offset += 1; // pitch wheel, ignored by simple synth
          break;
        case 3:
          offset += 1; // system event, ignored for now
          break;
        case 4: {
          const controller = view.getUint8(offset++);
          const value = view.getUint8(offset++) & 0x7f;
          if (controller === 0) {
            state.program = value;
          } else if (controller === 3 || controller === 5) {
            state.volume = value;
          }
          break;
        }
        case 5:
          ended = true;
          break;
        default:
          ended = true;
          break;
      }
    }

    if (!ended && offset < buffer.byteLength) {
      const delta = readMusVarLen(view, () => offset++);
      tick += delta;
    }
  }

  for (const [key, open] of openNotes) {
    const [channel, note] = key.split(':').map(Number);
    notes.push({
      channel,
      note,
      velocity: open.velocity,
      startTick: open.startTick,
      durationTicks: Math.max(1, tick - open.startTick),
      program: open.program,
    });
  }

  return {
    notes,
    durationTicks: Math.max(tick, ...notes.map((note) => note.startTick + note.durationTicks), 1),
    ticksPerSecond: MUS_TICKS_PER_SECOND,
  };
}

function findMusHeader(view: DataView): number {
  const limit = Math.min(32, view.byteLength - 4);
  for (let offset = 0; offset <= limit; offset++) {
    if (readAscii(view, offset, 4) === 'MUS\u001a') {
      return offset;
    }
  }
  return -1;
}

function closeNote(
  notes: MusNote[],
  openNotes: Map<string, { startTick: number; velocity: number; program: number }>,
  channel: number,
  note: number,
  tick: number
) {
  const key = noteKey(channel, note);
  const open = openNotes.get(key);
  if (!open) return;

  notes.push({
    channel,
    note,
    velocity: open.velocity,
    startTick: open.startTick,
    durationTicks: Math.max(1, tick - open.startTick),
    program: open.program,
  });
  openNotes.delete(key);
}

function readMusVarLen(view: DataView, advance: () => number): number {
  let value = 0;
  let byte = 0;
  do {
    byte = view.getUint8(advance());
    value = value * 128 + (byte & 0x7f);
  } while ((byte & 0x80) !== 0);

  return value;
}

function getChannelState(
  states: Map<number, { volume: number; program: number; lastNote: number }>,
  channel: number
) {
  let state = states.get(channel);
  if (!state) {
    state = { volume: DEFAULT_VELOCITY, program: 0, lastNote: 60 };
    states.set(channel, state);
  }
  return state;
}

function mapMusChannelToMidi(channel: number): number {
  if (channel === 15) return 9;
  return channel >= 9 ? channel + 1 : channel;
}

function noteKey(channel: number, note: number) {
  return `${channel}:${note}`;
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = '';
  for (let i = 0; i < length; i++) {
    value += String.fromCharCode(view.getUint8(offset + i));
  }
  return value;
}
