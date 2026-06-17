import { Wad } from '@/wad/interfaces/Wad';
import { parseWadInWorker } from '@/wad/parser/parseWadInWorker';
import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';
import { loadWadStackFromArrayBuffers } from '@hypercrab2000/doom-wad-core';

export async function fetchWad(path: string): Promise<Wad> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch WAD (${res.status} ${res.statusText}): ${path}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(
      `WAD fetch returned HTML instead of a binary WAD at ${path}. Upload IWADs to S3 (scripts/upload-iwads.sh) or use the bundled test WAD.`
    );
  }

  const buffer = await res.arrayBuffer();
  validateWadBuffer(buffer, path);
  return parseWadInWorker(buffer);
}

/** GZDoom `-file` order: IWAD URL first, then each PWAD patch URL. */
export async function fetchWadStack(iwadPath: string, patchPaths: string[] = []): Promise<Wad> {
  const buffers: ArrayBuffer[] = [];
  buffers.push(await fetchBinary(iwadPath));
  for (const patchPath of patchPaths) {
    buffers.push(await fetchBinary(patchPath));
  }
  if (patchPaths.length === 0) {
    return parseWadInWorker(buffers[0]!);
  }
  return loadWadStackFromArrayBuffers(buffers);
}

async function fetchBinary(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch (${res.status} ${res.statusText}): ${path}`);
  }
  const buffer = await res.arrayBuffer();
  if (path.toLowerCase().endsWith('.wad')) {
    validateWadBuffer(buffer, path);
  }
  return buffer;
}

/** Cache key for IWAD + patch list (GZDoom load order). */
export function wadStackCacheKey(iwadPath: string, patchPaths: readonly string[]): string {
  if (!patchPaths.length) return iwadPath;
  return `${iwadPath}::${patchPaths.join('|')}`;
}
