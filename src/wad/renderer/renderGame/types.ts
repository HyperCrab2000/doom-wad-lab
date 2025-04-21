// types.ts

import { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import { Triangle } from '@/wad/interfaces/Triangle';
import { Sector } from '@/wad/interfaces/Sector';

export interface ThingSprite {
  sprite: SpriteTexture;
  mirror?: boolean;
}

export type FramesByThingNameMap = Record<
  string,
  Record<number, Record<number, ThingSprite>>
>;

export interface TriangleHashObject {
  triangle: Triangle;
  sector: Sector;
}