import { Sector } from 'src/wad/interfaces/Sector';

export interface WallObject {
  position: Float32Array;
  uv: Float32Array;
  normal: Float32Array;
  indices: Uint16Array;
  sector?: Sector;
  sectorIndex?: number;
  lineIndex?: number;
  texName?: string;
  transparent?: boolean;
  twoSidedMiddle?: boolean;
  /** When false, texture is drawn once vertically (two-sided midtextures). */
  repeatVertical?: boolean;
  center: [number, number, number];
  /** Max distance from center to any vertex; used for frustum culling. */
  boundsRadius?: number;
}
