import { Wad } from '@/wad/interfaces/Wad';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';

export async function fetchWad(path: string): Promise<Wad> {
  const res = await fetch(path);
  const buffer = await res.arrayBuffer();
  return loadWadFromArrayBuffer(buffer);
}
