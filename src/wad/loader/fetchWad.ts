import { Wad } from '@/wad/interfaces/Wad';
import { parseWadInWorker } from '@/wad/parser/parseWadInWorker';
import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';

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
