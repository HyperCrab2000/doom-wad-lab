import { Wad } from '@/wad/interfaces/Wad';
import { parseWadInWorker } from '@/wad/parser/parseWadInWorker';

export async function fetchWad(path: string): Promise<Wad> {
  const res = await fetch(path);
  const buffer = await res.arrayBuffer();
  return parseWadInWorker(buffer);
}
