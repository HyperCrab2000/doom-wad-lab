import { Wad } from '@/wad/interfaces/Wad';
import { loadMap } from '@/wad/loader/loadMap';
import { drawMap } from '@/wad/renderer/drawAssets/drawMap';

export function renderMap(mapName: string, wad: Wad, mapCanvas: HTMLCanvasElement, game: any) {
  const map = loadMap(mapName, wad);
  console.log('map selected', map);
  drawMap(mapCanvas, map);
  game.loadWad(wad, map, mapName);
}
