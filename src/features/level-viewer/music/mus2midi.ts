import { MIDIBuilder, type BasicMIDI } from 'spessasynth_core';

import { MusSong, parseMus } from './doomMusic';

/** Doom MUS timebase: 140 Hz; standard mus2mid division is 70 ticks per quarter. */
const MUS_TIME_DIVISION = 70;
const DOOM_MIDI_BPM = 120;

type MidiEvent =
  | { tick: number; kind: 'pc'; channel: number; program: number }
  | { tick: number; kind: 'on'; channel: number; note: number; velocity: number }
  | { tick: number; kind: 'off'; channel: number; note: number };

export function musSongToMidi(song: MusSong): BasicMIDI {
  const builder = new MIDIBuilder({
    timeDivision: MUS_TIME_DIVISION,
    initialTempo: DOOM_MIDI_BPM,
    format: 0,
    name: 'DOOM',
  });

  builder.setTempo(0, DOOM_MIDI_BPM);

  const channelPrograms = new Map<number, number>();
  const events: MidiEvent[] = [];

  for (const note of song.notes) {
    const lastProgram = channelPrograms.get(note.channel);
    if (lastProgram !== note.program) {
      events.push({
        tick: note.startTick,
        kind: 'pc',
        channel: note.channel,
        program: note.program,
      });
      channelPrograms.set(note.channel, note.program);
    }

    events.push({
      tick: note.startTick,
      kind: 'on',
      channel: note.channel,
      note: note.note,
      velocity: note.velocity,
    });
    events.push({
      tick: note.startTick + note.durationTicks,
      kind: 'off',
      channel: note.channel,
      note: note.note,
    });
  }

  events.sort((a, b) => a.tick - b.tick);

  for (const event of events) {
    switch (event.kind) {
      case 'pc':
        builder.programChange(event.tick, 0, event.channel, event.program);
        break;
      case 'on':
        builder.noteOn(event.tick, 0, event.channel, event.note, event.velocity);
        break;
      case 'off':
        builder.noteOff(event.tick, 0, event.channel, event.note);
        break;
    }
  }

  builder.flush(true);
  builder.loop = {
    start: 0,
    end: Math.max(song.durationTicks, 1),
    type: 'soft',
  };

  return builder;
}

export function musBufferToMidi(musData: ArrayBuffer): BasicMIDI {
  return musSongToMidi(parseMus(musData));
}
