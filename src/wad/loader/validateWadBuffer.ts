const WAD_MAGIC = ['IWAD', 'PWAD'] as const;

export function validateWadBuffer(buffer: ArrayBuffer, path: string): void {
  if (buffer.byteLength < 12) {
    throw new Error(
      `WAD file is too small (${buffer.byteLength} bytes). If loading from production, upload IWADs to S3 with scripts/upload-iwads.sh. Path: ${path}`
    );
  }

  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (!WAD_MAGIC.includes(magic as (typeof WAD_MAGIC)[number])) {
    const preview = new TextDecoder().decode(
      new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength))
    );
    throw new Error(
      `Invalid WAD header "${magic}" at ${path}. Expected IWAD or PWAD. Response may be HTML from a missing file (got: ${preview.slice(0, 24)}...)`
    );
  }

  const lumpCount = view.getInt32(4, true);
  const directoryOffset = view.getInt32(8, true);

  if (lumpCount < 0 || lumpCount > 50000) {
    throw new Error(`Invalid WAD lump count (${lumpCount}) at ${path}`);
  }

  const directoryEnd = directoryOffset + lumpCount * 16;
  if (directoryOffset < 12 || directoryEnd > buffer.byteLength) {
    throw new Error(
      `WAD directory extends past file end (offset=${directoryOffset}, lumps=${lumpCount}, size=${buffer.byteLength}) at ${path}`
    );
  }
}
