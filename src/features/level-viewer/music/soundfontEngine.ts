import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from 'spessasynth_core';

import { SOUNDFONT_URL } from '@/config/doomAssets';
import { musBufferToMidi } from './mus2midi';

/** ScriptProcessor quantum — must be a power of two (256+). */
const AUDIO_BUFFER_SIZE = 512;

let enginePromise: Promise<SoundfontEngine> | null = null;
let soundfontBufferPromise: Promise<ArrayBuffer> | null = null;

function fetchSoundfontBuffer(): Promise<ArrayBuffer> {
  if (!soundfontBufferPromise) {
    soundfontBufferPromise = fetch(SOUNDFONT_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load SoundFont (${response.status}). Place TimGM6mb.sf2 at ${SOUNDFONT_URL}`
        );
      }
      return response.arrayBuffer();
    });
  }
  return soundfontBufferPromise;
}

export function getSoundfontEngine(): Promise<SoundfontEngine> {
  if (!enginePromise) {
    enginePromise = SoundfontEngine.create();
  }
  return enginePromise;
}

export function resetSoundfontEngine(): void {
  enginePromise?.then((engine) => engine.dispose()).catch(() => {});
  enginePromise = null;
  soundfontBufferPromise = null;
}

export class SoundfontEngine {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private synth: SpessaSynthProcessor | null = null;
  private sequencer: SpessaSynthSequencer | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioInitPromise: Promise<void> | null = null;
  private readonly midiByKey = new Map<string, BasicMIDI>();
  private loadedKey: string | null = null;
  private disposed = false;

  static async create(): Promise<SoundfontEngine> {
    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not available in this environment.');
    }

    await fetchSoundfontBuffer();
    return new SoundfontEngine();
  }

  async unlockAudio(): Promise<void> {
    await this.ensureAudioGraph();
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /** Converts MUS → MIDI and caches it. Synth preload happens at play time. */
  async prepareMus(musData: ArrayBuffer, cacheKey: string): Promise<void> {
    if (this.disposed) return;

    if (!this.midiByKey.has(cacheKey)) {
      this.midiByKey.set(cacheKey, musBufferToMidi(musData));
    }
  }

  async playPrepared(cacheKey: string): Promise<void> {
    if (this.disposed) throw new Error('Soundfont engine disposed');

    const midi = this.midiByKey.get(cacheKey);
    if (!midi) {
      throw new Error('Music track is not prepared yet');
    }

    await this.unlockAudio();

    const sequencer = this.sequencer!;
    const synth = this.synth!;

    if (this.loadedKey !== cacheKey) {
      sequencer.loadNewSongList([midi]);
      midi.preloadSynth(synth);
      this.loadedKey = cacheKey;
    }

    this.ensureScriptNode();
    sequencer.currentTime = 0;
    sequencer.play();
  }

  stop(): void {
    this.sequencer?.pause();
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.scriptNode?.disconnect();
    this.scriptNode = null;
    this.analyserNode?.disconnect();
    this.analyserNode = null;
    this.gainNode?.disconnect();
    this.gainNode = null;
    if (this.audioContext) {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.synth = null;
    this.sequencer = null;
    this.midiByKey.clear();
    this.loadedKey = null;
    this.audioInitPromise = null;
  }

  private async ensureAudioGraph(): Promise<void> {
    if (this.disposed) throw new Error('Soundfont engine disposed');
    if (this.audioContext && this.sequencer) return;
    if (this.audioInitPromise) {
      await this.audioInitPromise;
      return;
    }

    this.audioInitPromise = (async () => {
      const audioContext = new AudioContext();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.85;

      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.82;
      analyserNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const synth = new SpessaSynthProcessor(audioContext.sampleRate, {
        maxBufferSize: AUDIO_BUFFER_SIZE,
      });
      await synth.processorInitialized;

      const soundfont = SoundBankLoader.fromArrayBuffer(await fetchSoundfontBuffer());
      synth.soundBankManager.addSoundBank(soundfont, 'main');

      const sequencer = new SpessaSynthSequencer(synth);
      sequencer.loopCount = Infinity;
      sequencer.preload = true;

      this.audioContext = audioContext;
      this.gainNode = gainNode;
      this.analyserNode = analyserNode;
      this.synth = synth;
      this.sequencer = sequencer;

      if (this.loadedKey) {
        const midi = this.midiByKey.get(this.loadedKey);
        if (midi) {
          sequencer.loadNewSongList([midi]);
          midi.preloadSynth(synth);
        }
      }
    })();

    await this.audioInitPromise;
  }

  private ensureScriptNode(): void {
    if (this.scriptNode || !this.audioContext || !this.analyserNode || !this.sequencer || !this.synth) {
      return;
    }

    const node = this.audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 0, 2);
    node.onaudioprocess = (event) => {
      const left = event.outputBuffer.getChannelData(0);
      const right = event.outputBuffer.getChannelData(1);

      this.sequencer!.processTick();
      this.synth!.process(left, right);
    };
    node.connect(this.analyserNode!);
    this.scriptNode = node;
  }
}
