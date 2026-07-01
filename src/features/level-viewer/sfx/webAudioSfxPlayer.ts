import { decodeDoomSfx } from './doomSfx';

export type SfxLumpResolver = (lumpName: string) => ArrayBuffer | undefined;

/**
 * Plays Doom DS* sound effects through Web Audio, fully decoupled from the WASM engine: GZDoom
 * (running with -nosound) emits sound *events*, and this player turns the named DS* lump into an
 * AudioBuffer and plays it. Mirrors the music path so SFX and music are independently controllable.
 */
export class WebAudioSfxPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Resume the AudioContext — must be called from a user gesture (click/keypress). */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getBuffer(lumpName: string, resolve: SfxLumpResolver): AudioBuffer | null {
    if (this.buffers.has(lumpName)) return this.buffers.get(lumpName) ?? null;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    let buffer: AudioBuffer | null = null;
    const raw = resolve(lumpName);
    const decoded = raw ? decodeDoomSfx(raw) : null;
    if (decoded) {
      buffer = ctx.createBuffer(1, decoded.samples.length, decoded.sampleRate);
      buffer.getChannelData(0).set(decoded.samples);
    }
    this.buffers.set(lumpName, buffer); // cache misses too, so we don't re-resolve every frame
    return buffer;
  }

  play(lumpName: string, volume: number, resolve: SfxLumpResolver): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const buffer = this.getBuffer(lumpName, resolve);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain).connect(this.master);
    src.start();
  }

  dispose(): void {
    this.buffers.clear();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}
