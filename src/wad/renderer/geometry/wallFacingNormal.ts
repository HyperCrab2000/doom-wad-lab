import type { WallObject } from '@/wad/interfaces/WallObject';

export function readWallFacingNormal(wall: Pick<WallObject, 'normal'>): [number, number, number] {
  const normal = wall.normal;
  if (normal.length < 3) {
    return [0, 0, 1];
  }
  return [normal[0], normal[1], normal[2]];
}
