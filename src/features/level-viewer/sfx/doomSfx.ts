/**
 * Doom DMX sound-effect (DS*) decoder.
 *
 * Vanilla Doom sound lumps use the DMX digital format:
 *   u16 format (always 3)   u16 sampleRate (e.g. 11025)   u32 sampleCount   u8[ sampleCount ] PCM
 * The PCM is unsigned 8-bit mono. The first and last 16 bytes are duplicate-padding the original
 * tools added; we trim them when present so playback doesn't start/end on a flat DC step.
 */
export interface DecodedSfx {
  sampleRate: number;
  samples: Float32Array;
}

const PAD = 16;

export function decodeDoomSfx(buffer: ArrayBuffer): DecodedSfx | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const format = view.getUint16(0, true);
  const sampleRate = view.getUint16(2, true);
  const count = view.getUint32(4, true);
  if (format !== 3 || sampleRate < 4000 || sampleRate > 48000) return null;
  if (count === 0 || 8 + count > buffer.byteLength) return null;

  const bytes = new Uint8Array(buffer, 8, count);
  // Trim the 16-byte pads on each end when the lump is long enough to have them.
  const hasPad = count > PAD * 2;
  const start = hasPad ? PAD : 0;
  const end = hasPad ? count - PAD : count;
  const length = end - start;
  if (length <= 0) return null;

  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = (bytes[start + i]! - 128) / 128;
  }
  return { sampleRate, samples };
}
