import { WadMap } from '@/wad/interfaces/WadMap';
import { MapActionController } from './mapActionController';
import { MapActionResult } from './mapActionTypes';
import { isOnFrontSide } from './useLines';

export interface LineSpecialSimulator {
  map: WadMap;
  controller: MapActionController;
}

export function createLineSpecialSimulator(map: WadMap): LineSpecialSimulator {
  return {
    map,
    controller: new MapActionController(map),
  };
}

export function simulateUseLine(sim: LineSpecialSimulator, lineIndex: number): MapActionResult {
  const line = sim.map.LINEDEFS[lineIndex];
  if (!line) return { triggered: false };
  return sim.controller.tryUseLine(lineIndex, line);
}

export function simulateWalkLine(sim: LineSpecialSimulator, lineIndex: number): MapActionResult {
  const line = sim.map.LINEDEFS[lineIndex];
  if (!line) return { triggered: false };
  return sim.controller.tryWalkLine(lineIndex, line, true);
}

/** Positions that cross the linedef from back to front (walk-over). */
export function walkCrossPositions(
  map: WadMap,
  lineIndex: number,
  distance = 24
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const line = map.LINEDEFS[lineIndex];
  if (!line) return null;
  const v1 = map.VERTEXES[line.v1];
  const v2 = map.VERTEXES[line.v2];
  const midX = (v1.x + v2.x) * 0.5;
  const midY = (v1.y + v2.y) * 0.5;
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const probe = { x: midX + nx * 8, y: midY + ny * 8 };
  const frontSign = isOnFrontSide(probe, v1, v2) ? 1 : -1;
  const ox = nx * frontSign * distance;
  const oy = ny * frontSign * distance;
  return {
    from: { x: midX - ox, y: midY - oy },
    to: { x: midX + ox, y: midY + oy },
  };
}
