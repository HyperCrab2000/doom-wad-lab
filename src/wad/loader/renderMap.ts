import { Wad } from '@/wad/interfaces/Wad';

export function renderMap(mapName: string, wad: Wad, _canvas: HTMLCanvasElement, game: any) {
  const map = wad.maps[mapName];
  if (!map) {
    console.error(`Map ${mapName} not found in WAD`);
    return;
  }

  if (typeof game?.load === 'function') {
    game.load(wad, map, mapName); // ✅ Call load from modular renderGame
  }
}