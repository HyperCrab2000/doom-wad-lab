export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  get byteLength(): number {
    return this.length;
  }

  private push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  writeUint8(value: number): void {
    const buf = new Uint8Array(1);
    buf[0] = value & 0xff;
    this.push(buf);
  }

  writeInt16(value: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, true);
    this.push(new Uint8Array(buf));
  }

  writeUint16(value: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, true);
    this.push(new Uint8Array(buf));
  }

  writeInt32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    this.push(new Uint8Array(buf));
  }

  writeUint32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value >>> 0, true);
    this.push(new Uint8Array(buf));
  }

  writeBytes(bytes: Uint8Array): void {
    this.push(bytes);
  }

  writeFixedAscii(value: string, size: number): void {
    const out = new Uint8Array(size);
    const encoded = new TextEncoder().encode(value);
    out.set(encoded.subarray(0, size));
    this.push(out);
  }

  toArrayBuffer(): ArrayBuffer {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out.buffer;
  }
}
