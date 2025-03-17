import { Wad } from '@/parser/interfaces/Wad';

export function loadMap(mapName: string, wad: Wad) {
  return wad.maps[mapName];
}
