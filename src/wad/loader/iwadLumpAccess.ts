/**
 * Lightweight IWAD access without doom-wad-core parse — for GZDoom WASM (play), which loads and
 * parses the WAD inside GZDoom. Only reads the lump directory (map names) or individual lump bytes
 * (e.g. decoupled SFX) on demand.
 */

const MAP_LUMP = /^(E[1-4]M\d|MAP\d{2})$/i;

export interface RawIwad {
  bytes: Uint8Array;
  name: string;
}

export async function fetchRawIwad(path: string): Promise<RawIwad> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch IWAD ${path} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  validateWadMagic(buf, path);
  const name = path.split('/').pop() ?? 'DOOM.WAD';
  return { bytes: new Uint8Array(buf), name };
}

/**
 * Read MAPxx / ExMx lump names from the WAD directory table only.
 *
 * Uses HTTP Range requests to fetch just the 12-byte header + the directory table (a few tens of
 * KB), NOT the whole multi-MB IWAD. GZDoom WASM (play) parses all lumps itself from the raw IWAD it
 * mounts; the JS side only needs map names for the dropdown, so we must never download/parse the
 * full WAD here (that is what produced the spurious "loading WAD lumps" progress bars on play).
 * Falls back to a single full fetch if the server ignores Range (no 206).
 */
export async function listMapNamesFromIwad(path: string): Promise<string[]> {
  try {
    const header = await fetchRange(path, 0, 11);
    if (header && header.partial && header.buffer.byteLength >= 12) {
      const hv = new DataView(header.buffer);
      validateMagicView(hv, path);
      const numLumps = hv.getInt32(4, true);
      const dirOffset = hv.getUint32(8, true);
      const dirSize = numLumps * 16;
      const dir = await fetchRange(path, dirOffset, dirOffset + dirSize - 1);
      if (dir) {
        // 206 → buffer starts at dirOffset (relative); 200 → server sent whole file (absolute).
        const base = dir.partial ? 0 : dirOffset;
        return mapNamesFromDirBuffer(dir.buffer, base, numLumps);
      }
    }
  } catch {
    // fall through to full fetch
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch IWAD ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  validateWadMagic(buf, path);
  return listMapNamesFromBuffer(buf);
}

async function fetchRange(
  path: string,
  start: number,
  end: number,
): Promise<{ buffer: ArrayBuffer; partial: boolean } | null> {
  const res = await fetch(path, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) return null;
  const buffer = await res.arrayBuffer();
  return { buffer, partial: res.status === 206 };
}

function validateMagicView(view: DataView, path: string): void {
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== 'IWAD' && magic !== 'PWAD') {
    throw new Error(`Invalid WAD at ${path} (got ${magic})`);
  }
}

function mapNamesFromDirBuffer(buffer: ArrayBuffer, base: number, numLumps: number): string[] {
  const view = new DataView(buffer);
  const names: string[] = [];
  for (let i = 0; i < numLumps; i++) {
    const entry = base + i * 16;
    if (entry + 16 > buffer.byteLength) break;
    const name = readLumpName(view, entry + 8);
    if (MAP_LUMP.test(name)) names.push(name);
  }
  return names.sort();
}

export function listMapNamesFromBuffer(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return [];
  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getUint32(8, true);
  const names: string[] = [];
  for (let i = 0; i < numLumps; i++) {
    const entry = dirOffset + i * 16;
    if (entry + 16 > buffer.byteLength) break;
    const name = readLumpName(view, entry + 8);
    if (MAP_LUMP.test(name)) names.push(name);
  }
  return names.sort();
}

interface LumpDirEntry {
  offset: number;
  size: number;
}

/**
 * A lazily-sliced IWAD: the raw bytes plus a name → {offset,size} directory. NO lump bodies are
 * materialized up front — `read(name)` slices a single lump only when asked. This keeps GZDoom WASM
 * (play) from ever "parsing" the WAD on the JS side; the only on-demand read is the exact DS* lump a
 * decoupled sound event needs.
 */
export interface LazyIwad {
  /** Slice one lump's bytes on demand (directory lookup + single slice). Undefined if absent. */
  read: (lumpName: string) => ArrayBuffer | undefined;
}

const lazyIwadCache = new Map<string, LazyIwad>();

/** Fetch the IWAD once and index its directory only (offsets/sizes); lump bodies stay unsliced. */
export async function getLazyIwad(iwadPath: string): Promise<LazyIwad> {
  let lazy = lazyIwadCache.get(iwadPath);
  if (!lazy) {
    const res = await fetch(iwadPath);
    if (!res.ok) throw new Error(`Failed to fetch IWAD ${iwadPath} (${res.status})`);
    const buf = await res.arrayBuffer();
    validateWadMagic(buf, iwadPath);
    lazy = buildLazyIwad(buf);
    lazyIwadCache.set(iwadPath, lazy);
  }
  return lazy;
}

/** Read one lump by 8-char name on demand (directory scan + single slice, no full WAD parse). */
export async function readIwadLump(iwadPath: string, lumpName: string): Promise<ArrayBuffer | undefined> {
  const lazy = await getLazyIwad(iwadPath);
  return lazy.read(lumpName);
}

export function clearIwadLumpCache(iwadPath?: string): void {
  if (iwadPath) lazyIwadCache.delete(iwadPath);
  else lazyIwadCache.clear();
}

function buildLazyIwad(buffer: ArrayBuffer): LazyIwad {
  const view = new DataView(buffer);
  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getUint32(8, true);
  const dir = new Map<string, LumpDirEntry>();
  for (let i = 0; i < numLumps; i++) {
    const entry = dirOffset + i * 16;
    if (entry + 16 > buffer.byteLength) break;
    const offset = view.getUint32(entry, true);
    const size = view.getUint32(entry + 4, true);
    const name = readLumpName(view, entry + 8);
    if (size > 0 && offset + size <= buffer.byteLength) {
      dir.set(name, { offset, size });
    }
  }
  return {
    read(lumpName: string): ArrayBuffer | undefined {
      const e =
        dir.get(lumpName) ?? dir.get(lumpName.toUpperCase()) ?? dir.get(lumpName.toLowerCase());
      return e ? buffer.slice(e.offset, e.offset + e.size) : undefined;
    },
  };
}

function readLumpName(view: DataView, offset: number): string {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.toUpperCase();
}

function validateWadMagic(buffer: ArrayBuffer, path: string): void {
  if (buffer.byteLength < 12) {
    throw new Error(`WAD file is too small at ${path}`);
  }
  const magic = String.fromCharCode(
    new Uint8Array(buffer)[0]!,
    new Uint8Array(buffer)[1]!,
    new Uint8Array(buffer)[2]!,
    new Uint8Array(buffer)[3]!,
  );
  if (magic !== 'IWAD' && magic !== 'PWAD') {
    throw new Error(`Invalid WAD at ${path} (got ${magic})`);
  }
}
