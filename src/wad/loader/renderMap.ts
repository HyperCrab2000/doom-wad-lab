import { Wad } from '@/parser/interfaces/Wad';
import { loadMap } from '@/wad/loader/loadMap';
import { drawMap } from '@/parser/render/drawMap';

export function renderMap(mapName: string, wad: Wad, mapCanvas: HTMLCanvasElement, game: any) {
  const map = loadMap(mapName, wad);
  drawMap(mapCanvas, map);
  game.loadWad(wad, map);
}