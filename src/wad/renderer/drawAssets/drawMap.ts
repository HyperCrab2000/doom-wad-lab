import { WadMap } from '@/wad/interfaces/WadMap';
import { drawAutomap } from '@/wad/renderer/automap/automap';

/** @deprecated Use drawAutomap from automap/automap.ts */
export const drawMap = (canvas: HTMLCanvasElement, map: WadMap) =>
  drawAutomap(canvas, map, { player: { x: 0, y: 0, yaw: 0 } });
