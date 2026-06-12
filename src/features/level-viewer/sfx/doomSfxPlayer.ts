import { Wad } from '@/wad/interfaces/Wad';

const SAMPLE_CENTER = 128;

export class DoomSfxPlayer {
  private context: AudioContext | null = null;
  private cache = new Map<string, AudioBuffer>();

  async resume(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  play(wad: Wad, lumpName: string, volume = 0.85): void {
    if (!this.context) return;
    const buffer = this.getBuffer(wad, lumpName);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
  }

  private getBuffer(wad: Wad, lumpName: string): AudioBuffer | null {
    const key = lumpName.toUpperCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    const data = wad.lumpHash[key];
    if (!data) return null;

  const decoded = decodeDoomSound(data);
    if (!decoded || !this.context) return null;

    const buffer = this.context.createBuffer(1, decoded.samples.length, decoded.sampleRate);
    buffer.copyToChannel(decoded.samples, 0);
    this.cache.set(key, buffer);
    return buffer;
  }
}

export function decodeDoomSound(data: ArrayBuffer): { sampleRate: number; samples: Float32Array } | null {
  if (data.byteLength < 8) return null;

  const view = new DataView(data);
  const format = view.getUint16(0, true);

  if (format === 3) {
    const sampleRate = view.getUint16(2, true) || 11025;
    const sampleCount = view.getUint32(4, true);
    const start = 8 + 16;
    const end = Math.min(start + sampleCount, data.byteLength - 16);
    return pcm8ToFloat(new Uint8Array(data, start, Math.max(0, end - start)), sampleRate);
  }

  if (format === 0) {
    const sampleCount = view.getUint16(2, true);
    const start = 4;
    const end = Math.min(start + sampleCount, data.byteLength);
    return pcm8ToFloat(new Uint8Array(data, start, Math.max(0, end - start)), 11025);
  }

  // Some WAD tools store raw 8-bit samples with a simple length prefix.
  const sampleCount = view.getUint16(2, true);
  if (sampleCount > 0 && sampleCount <= data.byteLength - 4) {
    return pcm8ToFloat(new Uint8Array(data, 4, sampleCount), 11025);
  }

  return pcm8ToFloat(new Uint8Array(data), 11025);
}

function pcm8ToFloat(bytes: Uint8Array, sampleRate: number) {
  const samples = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    samples[i] = (bytes[i] - SAMPLE_CENTER) / SAMPLE_CENTER;
  }
  return { sampleRate, samples };
}

import { DOOM_MAP_SOUNDS } from '@/wad/game/mapActionSounds';

/** @deprecated Use `DOOM_MAP_SOUNDS` from `@/wad/game/mapActionSounds`. */
export const DOOM_DOOR_SOUNDS = {
  switchOn: DOOM_MAP_SOUNDS.switchOn,
  switchOff: DOOM_MAP_SOUNDS.switchOff,
  doorOpen: DOOM_MAP_SOUNDS.doorOpen,
  doorClose: DOOM_MAP_SOUNDS.doorClose,
  blazeOpen: DOOM_MAP_SOUNDS.blazeOpen,
  blazeClose: DOOM_MAP_SOUNDS.blazeClose,
} as const;
