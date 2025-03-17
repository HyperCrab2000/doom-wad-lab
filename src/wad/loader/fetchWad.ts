import { Wad } from '@/parser/interfaces/Wad';
import { loadWadFromBlob } from '@/parser/wad/loadWadFromBlob';

export async function fetchWad(path: string): Promise<Wad> {
  const res = await fetch(path);
  const buffer = await res.arrayBuffer();
  return loadWadFromBlob(buffer);
}
