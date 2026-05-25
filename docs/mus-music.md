# MUS & music

![SpessaSynth](https://img.shields.io/badge/spessasynth__core-4.3-8B5CF6)
![Web Audio](https://img.shields.io/badge/Web_Audio_API-playback-4285F4?logo=googlechrome&logoColor=white)
![SoundFont](https://img.shields.io/badge/TimGM6mb.sf2-General_MIDI-F59E0B)
![OPL3](https://img.shields.io/badge/opl3.js-alternate_FM-FF5722)

Doom stores music as **MUS** lumps (not standard MIDI). This project decodes MUS in TypeScript, converts to **Standard MIDI File format 0**, and plays it through **SpessaSynth** with a General MIDI SoundFont in the browser.

## Why not play MUS directly?

Original Doom used the OPL2/OPL3 FM chip. Browsers have no OPL hardware. Options:

| Approach | Used here? | Notes |
|----------|------------|-------|
| **MUS → MIDI → SoundFont (SpessaSynth)** | **Primary** | Best compatibility, GM instruments |
| **OPL3 emulator (`opl3` + vendor script)** | Alternate / tests | Closer to FM timbre; `opl3Browser.ts` |
| Web MIDI output | No | Requires external synth |

Production playback path: `useLevelMusic` → `WebAudioMusPlayer` → `SoundfontEngine`.

## Map → music lump lookup

**File:** `src/features/level-viewer/music/doomMusic.ts`

- Doom II: `MAP01` → `D_RUNNIN`, …, `MAP32` → `D_ULTIMA` (`doom2MusicByMap`)
- Ultimate Doom episode 4: reused tracks (`E4M1` → `D_E3M4`, etc.)
- Fallback: `D_${MAPNAME}` with candidate list from `getMusicLumpCandidatesForMap`

`getMusicLump(wad, mapName)` scans the WAD lump hash for the first matching name.

## MUS format decoding

**File:** `src/features/level-viewer/music/doomMusic.ts` — `parseMus()`

1. Verify header `MUS` + `0x1A`.
2. Read song length, first event offset, channel count.
3. Walk event bytes in **groups**; each group ends with a delay (variable-length encoded, 140 Hz tick base → `MUS_TICKS_PER_SECOND = 140`).

### Event types

| Code | Meaning |
|------|---------|
| 0 | Release note |
| 1 | Note on (pitch in next byte, velocity from channel state) |
| 2 | **Pitch wheel** (Doom-specific byte → MIDI 14-bit bend) |
| 3 | Controller change (volume stored per channel) |
| 4 | End of song |

Channel 15 is treated as **percussion** (maps to MIDI channel 9 in conversion).

### Pitch bends (important fix)

Doom MUS uses an 8-bit pitch byte per bend. We convert with:

```typescript
export function musPitchByteToMidiWheel(byte: number): number {
  const value = byte & 0xff;
  return ((value >> 1) << 7) | ((value & 1) << 6);
}
```

Tracks like **MAP22 / D_DDTBL3** contain thousands of bends (whistle/portamento effects). Ignoring case `2` made music sound flat and “telephone-like.” Bends are emitted as `MusPitchBend` and merged into the MIDI timeline.

## MUS → MIDI conversion

**File:** `src/features/level-viewer/music/mus2midi.ts`

Uses `spessasynth_core` **`MIDIBuilder`**:

- Format 0, ticks per quarter = 70, tempo 120 BPM
- Timeline merges: note on/off, program changes, **pitch wheel**, end marker
- Soft loop metadata `{ start: 0, end: durationTicks }` for seamless replay

Output is cached in memory by `musicCacheKey(wadPath, lumpName)`.

## SoundFont playback

**File:** `src/features/level-viewer/music/soundfontEngine.ts`

Singleton `SoundfontEngine`:

```
ScriptProcessor(512) → AnalyserNode → GainNode(0.85) → destination
         ↑
 SpessaSynthProcessor + SpessaSynthSequencer
```

- Loads `TimGM6mb.sf2` from `public/` (see `SOUNDFONT_URL` in config).
- `prepareMus(musData, cacheKey)` — MUS→MIDI only (cheap; safe to call during preload).
- `playPrepared(cacheKey)` — `midi.preloadSynth(synth)`, reset sequencer, play.
- `getAnalyser()` feeds the Winamp-style [MusicVisualizer](../src/features/level-viewer/music/MusicVisualizer.tsx).

**Audio unlock:** Browsers require a user gesture; `unlockAudio()` resumes `AudioContext` on first Play.

## React integration

**Files:** `useLevelMusic.ts`, `musicPreload.ts`, `useDoomLoader.ts`

- Music **does not block** map geometry load (parallel preload).
- On map change: stop current track, preload MUS→MIDI in background.
- Level transition wipe completes → `music.play()` if enabled.
- `clearCache()` clears music MIDI cache with WAD/map caches.

## OPL3 alternate path

**Files:** `src/features/level-viewer/music/opl3Browser.ts`, `public/vendor/opl3.js`

Dynamic script load exposes `window.OPL3.Player`. Useful for comparison tests (`npm run test:music` scripts). Not the default in the level viewer UI.

## Tests

- `doomMusic.test.ts` — map tables, lump lookup, pitch byte conversion, bundled DOOM.WAD E1M1 when present
- `mus2midi.test.ts` — round-trip event counts, pitch bend presence
- `webAudioMusPlayer.test.ts` — player lifecycle

## File reference

| File | Role |
|------|------|
| `doomMusic.ts` | MUS parser, map→lump, GENMIDI helper |
| `mus2midi.ts` | MUS → `BasicMIDI` |
| `soundfontEngine.ts` | Web Audio + SpessaSynth |
| `webAudioMusPlayer.ts` | Async play/stop wrapper |
| `useLevelMusic.ts` | React state, preload, play on level ready |
| `musicPreload.ts` | Shared MIDI cache API |
| `MusicVisualizer.tsx` | Canvas spectrum + waveform while playing |
