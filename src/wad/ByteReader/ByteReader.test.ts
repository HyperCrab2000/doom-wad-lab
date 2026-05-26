import { describe, expect, it } from 'vitest';
import { ByteReader } from './ByteReader';

function bufferFrom(values: number[]): ArrayBuffer {
  const bytes = new Uint8Array(values);
  return bytes.buffer;
}

describe('ByteReader', () => {
  describe('byteToBits', () => {
    it('expands a byte into eight bits (LSB at index 0)', () => {
      expect(ByteReader.byteToBits(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ByteReader.byteToBits(128)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
      expect(ByteReader.byteToBits(255)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
      expect(ByteReader.byteToBits(5)).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    });
  });

  describe('read primitives', () => {
    it('reads integers and floats in little-endian order', () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setInt8(0, -1);
      view.setUint8(1, 200);
      view.setInt16(2, -300, true);
      view.setUint16(4, 65000, true);
      view.setInt32(6, -123456, true);
      view.setUint32(10, 4000000000, true);

      const reader = new ByteReader(buffer);

      expect(reader.readInt8()).toBe(-1);
      expect(reader.readUint8()).toBe(200);
      expect(reader.readInt16()).toBe(-300);
      expect(reader.readUint16()).toBe(65000);
      expect(reader.readInt32()).toBe(-123456);
      expect(reader.readUint32()).toBe(4000000000);
      expect(reader.hasMore()).toBe(true);
      expect(reader.offset).toBe(14);
    });

    it('reads float32 and float64 values', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setFloat32(0, 3.5, true);
      view.setFloat64(4, 42.125, true);

      const reader = new ByteReader(buffer);

      expect(reader.readFloat32()).toBeCloseTo(3.5);
      expect(reader.readFloat64()).toBeCloseTo(42.125);
    });
  });

  describe('navigation', () => {
    it('supports skip and setIndex', () => {
      const reader = new ByteReader(bufferFrom([1, 2, 3, 4]));

      reader.skip(2);
      expect(reader.readUint8()).toBe(3);

      reader.setIndex(0);
      expect(reader.readUint8()).toBe(1);
    });

    it('reads a slice via readBytes without advancing offset', () => {
      const reader = new ByteReader(bufferFrom([10, 20, 30, 40]));

      expect(Array.from(new Uint8Array(reader.readBytes(1, 2)))).toEqual([20, 30]);
      expect(reader.readUint8()).toBe(10);
    });
  });

  describe('readASCII', () => {
    it('reads a fixed-length ASCII string and strips null padding', () => {
      const reader = new ByteReader(bufferFrom([
        'M'.charCodeAt(0),
        'A'.charCodeAt(0),
        'P'.charCodeAt(0),
        '0'.charCodeAt(0),
        '1'.charCodeAt(0),
        0,
        0,
      ]));

      expect(reader.readASCII(7)).toBe('MAP01');
    });
  });

  describe('readBytesAsBits', () => {
    it('reads consecutive bytes as a bit stream', () => {
      const reader = new ByteReader(bufferFrom([128, 1]));

      expect(reader.readBytesAsBits(2)).toEqual([
        0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0,
      ]);
    });
  });
});
