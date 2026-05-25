import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from 'spessasynth_core';

import { SOUNDFONT_URL } from '@/config/doomAssets';
import { musBufferToMidi } from './mus2midi';

const AUDIO_BUFFER_SIZE = 512;

let enginePromise: Promise<SoundfontEngine> | null = null;

export function getSoundfontEngine(): Promise<SoundfontEngine> {
  if (!enginePromise) {
    enginePromise = SoundfontEngine.create();
  }
  return enginePromise;
}

export function resetSoundfontEngine(): void {
  enginePromise?.then((engine) => engine.dispose()).catch(() => {});
  enginePromise = null;
}

export class SoundfontEngine {
  private readonly audioContext: AudioContext;
  private readonly gainNode: GainNode;
  private readonly synth: SpessaSynthProcessor;
  private readonly sequencer: SpessaSynthSequencer;
  private scriptNode: ScriptProcessorNode | null = null;
  private preparedKey: string | null = null;
  private disposed = false;

  static async create(): Promise<SoundfontEngine> {
    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not available in this environment.');
    }

    const audioContext = new AudioContext();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.85;
    gainNode.connect(audioContext.destination);

    const synth = new SpessaSynthProcessor(audioContext.sampleRate);
    await synth.processorInitialized;

    const response = await fetch(SOUNDFONT_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to load SoundFont (${response.status}). Place TimGM6mb.sf2 at ${SOUNDFONT_URL}`
      );
    }

    const soundfont = SoundBankLoader.fromArrayBuffer(await response.arrayBuffer());
    synth.soundBankManager.addSoundBank(soundfont, 'main');

    const sequencer = new SpessaSynthSequencer(synth);
    sequencer.loopCount = Infinity;
    sequencer.preload = true;

    return new SoundfontEngine(audioContext, gainNode, synth, sequencer);
  }

  private constructor(
    audioContext: AudioContext,
    gainNode: GainNode,
    synth: SpessaSynthProcessor,
    sequencer: SpessaSynthSequencer
  ) {
    this.audioContext = audioContext;
    this.gainNode = gainNode;
    this.synth = synth;
    this.sequencer = sequencer;
  }

  async unlockAudio(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /** Converts MUS → MIDI and preloads voices (runs off the play hot path). */
  async prepareMus(musData: ArrayBuffer, cacheKey: string): Promise<void> {
    if (this.disposed) return;
    if (this.preparedKey === cacheKey) return;

    const midi = musBufferToMidi(musData);
    this.sequencer.loadNewSongList([midi]);
    midi.preloadSynth(this.synth);
    this.preparedKey = cacheKey;
  }

  async playPrepared(cacheKey: string): Promise<void> {
    if (this.disposed) throw new Error('Soundfont engine disposed');
    if (this.preparedKey !== cacheKey) {
      throw new Error('Music track is not prepared yet');
    }

    await this.unlockAudio();
    this.ensureScriptNode();
    this.sequencer.pause();
    this.sequencer.songIndex = 0;
    this.sequencer.currentTime = 0;
    this.sequencer.play();
  }

  stop(): void {
    this.sequencer.pause();
    this.preparedKey = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.scriptNode?.disconnect();
    this.scriptNode = null;
    this.gainNode.disconnect();
    void this.audioContext.close();
  }

  private ensureScriptNode(): void {
    if (this.scriptNode) return;

    const node = this.audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 0, 2);
    node.onaudioprocess = (event) => {
      const left = event.outputBuffer.getChannelData(0);
      const right = event.outputBuffer.getChannelData(1);
      this.sequencer.processTick();
      this.synth.process(left, right);
    };
    node.connect(this.gainNode);
    this.scriptNode = node;
  }
}
